// A fake open data portal of SNCF for the tests, served through the `fetch`
// option of the integration. Its answers are real ones, read on 2026-10-30
// at 13:30 (Paris), and reduced: the metadata of the `tgvmax` dataset, every
// origin and destination (the two `group_by`), and the trains of Paris →
// Lyon, Lyon → Paris and Bordeaux → Paris from 30 October to 8 November.
// Open data of SNCF Voyageurs, ODbL. Tests never touch the network.

import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Friday 30 October 2026, 09:00 in Paris (UTC+1 since 25 October).
const NOW = Date.parse('2026-10-30T08:00:00Z');

const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8'));
const DATASET = fixture('dataset.json');
const ORIGINS = fixture('origins.json');
const DESTINATIONS = fixture('destinations.json');
const ROUTES = {
  'PARIS (intramuros)|LYON (intramuros)': fixture('paris-lyon.json'),
  'LYON (intramuros)|PARIS (intramuros)': fixture('lyon-paris.json'),
  'BORDEAUX ST JEAN|PARIS (intramuros)': fixture('bordeaux-paris.json'),
};

const silent = { info() {}, warn() {}, error() {}, debug() {} };

/**
 * @description A temporary path for the file kept in /data.
 * @returns {string} The path (its directory exists, the file does not).
 */
const storePath = () => join(mkdtempSync(join(tmpdir(), 'tgv-max-')), 'tgv-max.json');

const clone = (value) => JSON.parse(JSON.stringify(value));

/**
 * @description The value of a condition `field = "x"` of a query.
 * @param {string} where - The ODSQL condition.
 * @param {string} field - The field.
 * @returns {string|null} The value, unescaped.
 */
function equal(where, field) {
  const match = new RegExp(`(?:^|\\s)${field} = "((?:[^"\\\\]|\\\\.)*)"`).exec(where ?? '');
  return match ? match[1].replace(/\\(.)/g, '$1') : null;
}

/**
 * @description A date bound of a query: `date >= date'2026-10-30'`.
 * @param {string} where - The ODSQL condition.
 * @param {string} operator - `>=` or `<=`.
 * @returns {string|null} The date.
 */
function dateBound(where, operator) {
  const match = new RegExp(`date ${operator} date'(\\d{4}-\\d{2}-\\d{2})'`).exec(where ?? '');
  return match ? match[1] : null;
}

/**
 * @description The fake portal.
 * @returns {Function} A fetch function, with `.calls` and `.state`.
 */
function fakeSncf() {
  const state = {
    dataset: clone(DATASET),
    origins: clone(ORIGINS),
    destinations: clone(DESTINATIONS),
    routes: clone(ROUTES),
    // 'network', or an HTTP status, for every request.
    fail: null,
    remaining: 9500,
  };
  const calls = [];

  /**
   * @description An answer of the portal.
   * @param {unknown} body - The JSON body.
   * @param {number} [status] - The HTTP status.
   * @returns {Response} The answer, with the quota headers.
   */
  const json = (body, status = 200) => {
    state.remaining -= 1;
    return new Response(JSON.stringify(body), {
      status,
      headers: {
        'content-type': 'application/json',
        'x-ratelimit-limit': '10000',
        'x-ratelimit-remaining': String(Math.max(0, state.remaining)),
        'x-ratelimit-reset': '2026-10-31 00:00:00+00:00',
      },
    });
  };

  /**
   * @description The fetch function.
   * @param {string} url - The URL.
   * @returns {Promise<Response>} The answer.
   */
  async function fetchFn(url) {
    const parsed = new URL(url);
    const [, path = ''] = /\/datasets\/tgvmax(.*)$/.exec(parsed.pathname) ?? [];
    const params = Object.fromEntries(parsed.searchParams);
    calls.push({ path, params });
    if (state.fail === 'network') {
      throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
    }
    if (state.fail === 429) {
      return json({ error_code: 'TooManyRequests', message: 'Too many requests' }, 429);
    }
    if (typeof state.fail === 'number') {
      return new Response('down', { status: state.fail });
    }
    if (path === '') {
      return json(state.dataset);
    }
    if (path === '/records' && params.group_by === 'origine_iata,origine') {
      return json({ total_count: state.origins.length, results: state.origins });
    }
    if (path === '/records' && params.group_by === 'destination_iata,destination') {
      return json({ total_count: state.destinations.length, results: state.destinations });
    }
    if (path === '/exports/json') {
      const origin = equal(params.where, 'origine');
      const destination = equal(params.where, 'destination');
      const from = dateBound(params.where, '>=') ?? '0000-00-00';
      const to = dateBound(params.where, '<=') ?? '9999-99-99';
      const fields = params.select.split(',');
      const records = (state.routes[`${origin}|${destination}`] ?? [])
        .filter((record) => record.date >= from && record.date <= to)
        .map((record) => Object.fromEntries(fields.map((field) => [field, record[field]])));
      return json(records);
    }
    return json({ error_code: 'ODSQLError', message: 'Unknown query' }, 400);
  }
  fetchFn.calls = calls;
  fetchFn.state = state;
  return fetchFn;
}

/**
 * @description Open (or close) the MAX seats of a train in the fake data.
 * @param {object} api - fakeSncf().
 * @param {string} route - "PARIS (intramuros)|LYON (intramuros)".
 * @param {string} date - `YYYY-MM-DD`.
 * @param {string} number - The train number.
 * @param {boolean} open - Open or not.
 */
function setSeats(api, route, date, number, open) {
  for (const record of api.state.routes[route]) {
    if (record.date === date && record.train_no === number) {
      record.od_happy_card = open ? 'OUI' : 'NON';
    }
  }
}

/**
 * @description A minimal Gladys client for the pure builders.
 */
const fakeGladys = {
  externalIds: (type, id) => ({
    device: `ext:tgv-max:${type}:${id}`,
    feature: (key) => `ext:tgv-max:${type}:${id}:${key}`,
  }),
};

export {
  NOW,
  DATASET,
  ORIGINS,
  DESTINATIONS,
  ROUTES,
  silent,
  storePath,
  fakeSncf,
  setSeats,
  fakeGladys,
};
