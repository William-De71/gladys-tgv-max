// -----------------------------------------------------------------------------
// The registry of the followed routes, declared with the configuration
// buttons ("Add a route", "Edit a route", "Remove a route"): no JSON to type,
// plain forms whose fields are checked here.
//
// A route is a pair of station names of the dataset ("PARIS (intramuros)" →
// "LYON (intramuros)"), the days it is followed (every day, weekdays, one day
// of the week… or a list of dates that replaces them) and the departure
// hours (from 17:00 to 21:00). Stored through setConfig() under
// INTERNAL_KEYS.routes, a key outside the config_schema: the routes live in
// the Gladys database and follow its backups (/data does not). A change is
// applied in memory once Gladys saved it, and changes run one after the
// other: two quick buttons never lose a route.
//
// Each route gets a random identifier at creation (8 hex digits), kept for
// ever: it builds the external ids of its device, never a station name.
// Editing a route keeps it; changing its stations is another route.
// -----------------------------------------------------------------------------

import { randomBytes } from 'node:crypto';
import { INTERNAL_KEYS } from './config.js';
import { DAY_KEYS } from './trains.js';
import { parseDateInput, isDate } from './time.js';
import { fold, stationLabel } from './stations.js';

// Far beyond the trips of a household; each route is one request per day of
// data, within the daily quota of the portal.
const MAX_ROUTES = 20;
const MAX_DATES = 10;
const ID_PATTERN = /^[0-9a-f]{8}$/;
const KEEP = 'keep';

class RegistryError extends Error {
  /**
   * @param {string} key - The TEXTS key of the message.
   * @param {object} [params] - Its substitutions.
   */
  constructor(key, params = {}) {
    super(key);
    this.key = key;
    this.params = params;
  }
}

const isEmpty = (value) => value === undefined || value === null || String(value).trim() === '';

/**
 * @description Read a whole hour of a form (numbers can come as strings).
 * @param {unknown} raw - The value.
 * @param {number} min - The smallest hour.
 * @param {number} max - The largest hour.
 * @returns {number|null|undefined} The hour, null when empty, undefined when invalid.
 */
function readHour(raw, min, max) {
  if (isEmpty(raw)) {
    return null;
  }
  const value = Number(typeof raw === 'string' ? raw.trim().replace(/\s*h$/i, '') : raw);
  return Number.isInteger(value) && value >= min && value <= max ? value : undefined;
}

/**
 * @description Read the departure hours of a form.
 * @param {unknown} rawAfter - "Leaving from" (0-23).
 * @param {unknown} rawBefore - "Leaving before" (1-24).
 * @param {object} [current] - The hours kept when a field is empty.
 * @returns {{ after: number, before: number }} The hours.
 */
function readHours(rawAfter, rawBefore, current = { after: 0, before: 24 }) {
  const after = readHour(rawAfter, 0, 23);
  const before = readHour(rawBefore, 1, 24);
  if (after === undefined || before === undefined) {
    throw new RegistryError('errorHours');
  }
  const hours = { after: after ?? current.after, before: before ?? current.before };
  if (hours.after >= hours.before) {
    throw new RegistryError('errorHours');
  }
  return hours;
}

/**
 * @description Read the days of a form.
 * @param {unknown} raw - A key of DAY_SETS.
 * @param {string} [current] - The days kept when the field is empty or `keep`.
 * @returns {string} The key.
 */
function readDays(raw, current = 'all') {
  if (isEmpty(raw) || raw === KEEP) {
    return current;
  }
  if (!DAY_KEYS.includes(raw)) {
    throw new RegistryError('errorDays');
  }
  return raw;
}

/**
 * @description Read the dates of a form: "2026-11-06, 13/11", "+3",
 * "demain"…
 * @param {unknown} raw - The text.
 * @param {string} today - Today, `YYYY-MM-DD` (Paris).
 * @returns {string[]|null} The dates, sorted, without duplicates; null when
 * the field is empty; [] for "-" (no date: back to the days).
 */
function readDates(raw, today) {
  if (isEmpty(raw)) {
    return null;
  }
  const text = String(raw).trim();
  if (text === '-') {
    return [];
  }
  const dates = new Set();
  for (const part of text.split(/[,;\s]+/).filter(Boolean)) {
    const date = parseDateInput(part, today);
    if (!date) {
      throw new RegistryError('errorDate', { date: part.slice(0, 20) });
    }
    if (date < today) {
      throw new RegistryError('errorDatePast', { date: part.slice(0, 20) });
    }
    dates.add(date);
  }
  if (dates.size > MAX_DATES) {
    throw new RegistryError('errorTooManyDates', { max: MAX_DATES });
  }
  return [...dates].sort();
}

/**
 * @description Check a stored or built route.
 * @param {object} raw - The route.
 * @returns {object} The clean route.
 */
function validateRoute(raw) {
  const route = raw ?? {};
  if (!ID_PATTERN.test(route.id ?? '')) {
    throw new RegistryError('errorStored');
  }
  for (const key of ['origin', 'destination']) {
    if (typeof route[key] !== 'string' || !route[key].trim() || route[key].length > 80) {
      throw new RegistryError('errorStored');
    }
  }
  if (!DAY_KEYS.includes(route.days)) {
    throw new RegistryError('errorStored');
  }
  const dates = Array.isArray(route.dates) ? route.dates : [];
  if (!dates.every(isDate) || dates.length > MAX_DATES) {
    throw new RegistryError('errorStored');
  }
  const { after, before } = route;
  if (
    !Number.isInteger(after) ||
    !Number.isInteger(before) ||
    after < 0 ||
    before > 24 ||
    after >= before
  ) {
    throw new RegistryError('errorStored');
  }
  return {
    id: route.id,
    origin: route.origin,
    destination: route.destination,
    days: route.days,
    dates: [...new Set(dates)].sort(),
    after,
    before,
  };
}

/**
 * @description Read the stored routes.
 * @param {unknown} raw - The stored value: an array (or its JSON text).
 * @param {object} [logger] - Logger.
 * @returns {object[]} The valid routes, without duplicates, MAX_ROUTES at most.
 */
function parseRoutes(raw, logger) {
  let list = raw;
  if (typeof raw === 'string') {
    try {
      list = JSON.parse(raw);
    } catch {
      logger?.warn('TGV MAX: the stored routes are not JSON, ignored');
      return [];
    }
  }
  const routes = [];
  const seen = new Set();
  for (const entry of Array.isArray(list) ? list : []) {
    try {
      const route = validateRoute(entry);
      if (!seen.has(route.id)) {
        seen.add(route.id);
        routes.push(route);
      }
    } catch {
      logger?.warn(`TGV MAX: stored route ignored: ${JSON.stringify(entry)?.slice(0, 200)}`);
    }
  }
  return routes.slice(0, MAX_ROUTES);
}

/**
 * @description Whether two routes follow the same trains.
 * @param {object} a - A route.
 * @param {object} b - Another one.
 * @returns {boolean} True when stations, days, dates and hours are equal.
 */
const sameRoute = (a, b) =>
  a.origin === b.origin &&
  a.destination === b.destination &&
  a.days === b.days &&
  a.dates.join() === b.dates.join() &&
  a.after === b.after &&
  a.before === b.before;

/**
 * @description The registry of the routes.
 * @param {object} gladys - SDK client (setConfig).
 * @param {object} [options] - Options.
 * @param {object} [options.logger] - Logger.
 * @param {Function} [options.newId] - `() => string`, 8 hex digits (tests).
 * @returns {object} The registry.
 */
function createRegistry(gladys, { logger, newId = () => randomBytes(4).toString('hex') } = {}) {
  let routes = [];
  let writing = Promise.resolve();

  // One change at a time, computed from the previous one once it is saved.
  const serial = (change) => {
    const run = writing.then(async () => {
      const { next, result } = change(routes);
      await gladys.setConfig({ [INTERNAL_KEYS.routes]: next });
      routes = next;
      return result;
    });
    writing = run.catch(() => {});
    return run;
  };

  return {
    /** @param {object} config - The raw config. @returns {object[]} The routes. */
    load(config) {
      routes = parseRoutes(config?.[INTERNAL_KEYS.routes], logger);
      return routes;
    },

    list: () => routes,

    /** @param {string} id - Identifier. @returns {object|undefined} The route. */
    byId: (id) => routes.find((route) => route.id === id),

    /**
     * @description Find a route by its number in the list (#2 or 2), its
     * identifier, or the words of its stations ("paris lyon").
     * @param {unknown} query - What the user typed.
     * @returns {object} The route.
     */
    find(query) {
      const text = String(query ?? '').trim();
      if (!text) {
        throw new RegistryError('errorRouteMissing');
      }
      const number = /^#?(\d{1,2})$/.exec(text);
      if (number) {
        const route = routes[Number(number[1]) - 1];
        if (!route) {
          throw new RegistryError('errorRouteUnknown', { query: text.slice(0, 40) });
        }
        return route;
      }
      const byId = routes.find((route) => route.id === text.toLowerCase());
      if (byId) {
        return byId;
      }
      const words = fold(text.replace(/→|->|>/g, ' ')).split(' ');
      const matches = routes.filter((route) => {
        const own = fold(`${stationLabel(route.origin)} ${stationLabel(route.destination)}`).split(
          ' ',
        );
        return words.every((word) => own.some((part) => part.startsWith(word)));
      });
      if (matches.length === 1) {
        return matches[0];
      }
      // "lyon paris" is Lyon → Paris, not Paris → Lyon: the words in order.
      const ordered = matches.filter((route) => {
        const own = fold(`${stationLabel(route.origin)} ${stationLabel(route.destination)}`).split(
          ' ',
        );
        let index = -1;
        return words.every((word) => {
          index = own.findIndex((part, at) => at > index && part.startsWith(word));
          return index >= 0;
        });
      });
      if (ordered.length === 1) {
        return ordered[0];
      }
      throw new RegistryError(matches.length ? 'errorRouteAmbiguous' : 'errorRouteUnknown', {
        query: text.slice(0, 40),
      });
    },

    /**
     * @description Add a route.
     * @param {object} fields - `{ origin, destination, days, dates, after, before }`.
     * @returns {Promise<object>} The route added.
     */
    add(fields) {
      return serial((current) => {
        if (current.length >= MAX_ROUTES) {
          throw new RegistryError('errorTooManyRoutes', { max: MAX_ROUTES });
        }
        let id = newId();
        while (current.some((route) => route.id === id)) {
          id = newId();
        }
        const route = validateRoute({ ...fields, id });
        if (current.some((other) => sameRoute(other, route))) {
          throw new RegistryError('errorRouteExists');
        }
        return { next: [...current, route], result: route };
      });
    },

    /**
     * @description Change the days, dates or hours of a route.
     * @param {string} id - The route.
     * @param {object} patch - `{ days, dates, after, before }`.
     * @returns {Promise<object>} The route changed.
     */
    update(id, patch) {
      return serial((current) => {
        const index = current.findIndex((route) => route.id === id);
        if (index < 0) {
          throw new RegistryError('errorRouteUnknown', { query: id });
        }
        const route = validateRoute({ ...current[index], ...patch, id });
        const next = [...current];
        next[index] = route;
        return { next, result: route };
      });
    },

    /**
     * @description Remove a route.
     * @param {string} id - The route.
     * @returns {Promise<object>} The route removed.
     */
    remove(id) {
      return serial((current) => {
        const route = current.find((entry) => entry.id === id);
        if (!route) {
          throw new RegistryError('errorRouteUnknown', { query: id });
        }
        return { next: current.filter((entry) => entry.id !== id), result: route };
      });
    },
  };
}

export {
  MAX_ROUTES,
  MAX_DATES,
  KEEP,
  RegistryError,
  readHour,
  readHours,
  readDays,
  readDates,
  validateRoute,
  parseRoutes,
  sameRoute,
  createRegistry,
};
