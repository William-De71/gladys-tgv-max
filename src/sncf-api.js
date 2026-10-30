// -----------------------------------------------------------------------------
// HTTP client of the open data portal of SNCF (https://ressources.data.sncf.com),
// dataset `tgvmax`: "Disponibilité à 30 jours de places MAX JEUNE et MAX
// SENIOR ouvertes à la réservation", published by SNCF Voyageurs under the
// ODbL. An Opendatasoft portal: Explore API v2.1, no key.
//
// One record per train and per pair of stations it serves, over the next 30
// days: `date`, `train_no`, `axe`, `origine` / `origine_iata`, `destination`
// / `destination_iata`, `heure_depart`, `heure_arrivee` (Paris time) and
// `od_happy_card`, "OUI" while MAX seats are open for booking on that pair.
// The dataset is rebuilt once a day, early in the morning (05:23 UTC seen):
// the metadata `data_processed` says when.
//
// Without a key, the portal allows a daily number of calls per address
// (`X-RateLimit-*` headers, 10 000 seen, reset at midnight UTC) and answers
// 429 beyond. Errors are JSON `{ error_code, message }`.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';

const BASE_URL =
  process.env.SNCF_API_URL || 'https://ressources.data.sncf.com/api/explore/v2.1/catalog/datasets';
const DATASET = 'tgvmax';
const TIMEOUT_MS = 30000;
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const USER_AGENT = `gladys-tgv-max/${version} (+https://github.com/William-De71/gladys-tgv-max)`;
const TRAIN_FIELDS =
  'date,train_no,axe,origine_iata,destination_iata,heure_depart,heure_arrivee,od_happy_card';

class SncfError extends Error {
  /**
   * @param {string} kind - `quota`, `unreachable` or `invalid`.
   * @param {string} message - The detail.
   * @param {object} [extra] - `{ status }`.
   */
  constructor(kind, message, { status = null } = {}) {
    super(message);
    this.name = 'SncfError';
    this.kind = kind;
    this.status = status;
  }
}

/**
 * @description A string literal of the query language of the portal (ODSQL).
 * @param {unknown} value - The value.
 * @returns {string} `"…"`, quotes and backslashes escaped.
 * @example
 * quote('PARIS (intramuros)'); // -> '"PARIS (intramuros)"'
 */
const quote = (value) => `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

/**
 * @description A client of the `tgvmax` dataset.
 * @param {object} [options] - Options.
 * @param {Function} [options.fetch] - The fetch function (tests).
 * @param {Function} [options.now] - `() => number` in ms.
 * @param {string} [options.baseUrl] - The datasets root (tests, end-to-end runs).
 * @returns {object} The methods, `requests` and `quota` for the diagnostic.
 */
function createSncfClient({
  fetch: fetchFn = globalThis.fetch,
  now = () => Date.now(),
  baseUrl = BASE_URL,
} = {}) {
  // Requests made, and the last quota seen, for the diagnostic.
  const requests = { total: 0, failed: 0, last: null };
  const quota = { limit: null, remaining: null, reset: null };

  /**
   * @description Call the portal.
   * @param {string} path - '' for the metadata, `/records` or `/exports/json`.
   * @param {object} [params] - Query parameters.
   * @returns {Promise<unknown>} The JSON answer.
   */
  async function call(path, params = {}) {
    const query = new URLSearchParams();
    for (const [name, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        query.set(name, String(value));
      }
    }
    requests.total += 1;
    requests.last = now();
    const search = query.size ? `?${query}` : '';
    let response;
    try {
      response = await fetchFn(`${baseUrl}/${DATASET}${path}${search}`, {
        headers: { accept: 'application/json', 'user-agent': USER_AGENT },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      requests.failed += 1;
      throw new SncfError('unreachable', err.cause?.code ?? err.message);
    }
    if (response.headers?.get?.('x-ratelimit-remaining') !== null) {
      const remaining = Number(response.headers.get('x-ratelimit-remaining'));
      if (Number.isFinite(remaining)) {
        quota.remaining = remaining;
        quota.limit = Number(response.headers.get('x-ratelimit-limit')) || null;
        quota.reset = response.headers.get('x-ratelimit-reset') || null;
      }
    }
    if (!response.ok) {
      requests.failed += 1;
      let detail = `HTTP ${response.status}`;
      try {
        const body = await response.json();
        if (typeof body?.message === 'string') {
          detail = `${detail}: ${body.message.slice(0, 160)}`;
        }
      } catch {
        // No JSON body: the status says enough.
      }
      let kind = 'unreachable';
      if (response.status === 429) {
        kind = 'quota';
      } else if (response.status >= 400 && response.status < 500) {
        kind = 'invalid';
      }
      throw new SncfError(kind, detail, { status: response.status });
    }
    try {
      return await response.json();
    } catch (err) {
      requests.failed += 1;
      throw new SncfError('invalid', `${DATASET}: ${err.message}`);
    }
  }

  /**
   * @description The distinct values of two fields (a `group_by`).
   * @param {string} fields - "origine_iata,origine".
   * @returns {Promise<object[]>} The groups, with their `count(*)`.
   */
  async function groups(fields) {
    const body = await call('/records', { group_by: fields, select: 'count(*)', limit: -1 });
    if (!Array.isArray(body?.results)) {
      throw new SncfError('invalid', `${DATASET}: no results`);
    }
    return body.results;
  }

  return {
    requests,
    quota,
    /**
     * @description When the dataset was last rebuilt.
     * @returns {Promise<{ processedAt: number|null, modifiedAt: number|null, records: number|null }>}
     * The instants, in ms.
     */
    async dataset() {
      const body = await call('');
      const metas = body?.metas?.default;
      if (!metas || typeof metas !== 'object') {
        throw new SncfError('invalid', `${DATASET}: no metadata`);
      }
      const instant = (value) => {
        const parsed = Date.parse(value ?? '');
        return Number.isFinite(parsed) ? parsed : null;
      };
      return {
        processedAt: instant(metas.data_processed),
        modifiedAt: instant(metas.modified),
        records: Number.isFinite(metas.records_count) ? metas.records_count : null,
      };
    },
    /**
     * @description Every origin and destination of the dataset.
     * @returns {Promise<object[]>} `{ origine, origine_iata, count(*) }` then
     * `{ destination, destination_iata, count(*) }` records.
     */
    async stations() {
      const origins = await groups('origine_iata,origine');
      const destinations = await groups('destination_iata,destination');
      return [...origins, ...destinations];
    },
    /**
     * @description The trains of a route, from a date on.
     * @param {string} origin - The origin name of the dataset.
     * @param {string} destination - The destination name of the dataset.
     * @param {string} from - The first date, `YYYY-MM-DD`.
     * @param {string} [to] - The last date, `YYYY-MM-DD`.
     * @returns {Promise<object[]>} The records, by date and time.
     */
    async trains(origin, destination, from, to) {
      const where = [
        `origine = ${quote(origin)}`,
        `destination = ${quote(destination)}`,
        `date >= date'${from}'`,
      ];
      if (to) {
        where.push(`date <= date'${to}'`);
      }
      const body = await call('/exports/json', {
        where: where.join(' and '),
        select: TRAIN_FIELDS,
        order_by: 'date,heure_depart',
      });
      if (!Array.isArray(body)) {
        throw new SncfError('invalid', `${DATASET}: not a list`);
      }
      return body;
    },
  };
}

export { BASE_URL, DATASET, USER_AGENT, TRAIN_FIELDS, SncfError, quote, createSncfClient };
