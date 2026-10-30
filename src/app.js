// -----------------------------------------------------------------------------
// The TGV MAX integration: every handler, registered on a Gladys client.
//
// Follows the MAX JEUNE and MAX SENIOR seats of SNCF (TGV INOUI and
// Intercités with reservation) through the official open data of SNCF
// Voyageurs (dataset `tgvmax`, no key):
//   - devices (device.js): one per followed route, added with the "Add a
//     route" button (routes.js), with its open trains, within 7 days, its
//     days with seats and the next open train;
//   - scene triggers (events.js): new MAX seats on a route, route sold out;
//   - scene actions: search the MAX seats of any route on a date, read a
//     followed route;
//   - dashboard widgets (widgets.js): trains, calendar, overview.
//
// The dataset is rebuilt once a day, early in the morning: its metadata is
// read every 30 minutes, and the trains of the routes only when it changed
// (one request per route and per day). Every 5 minutes, the states are
// worked out again from the trains in memory (a train that left is gone),
// without a request. The stations of the dataset are kept in /data and read
// again weekly. Transport: cloud only.
//
// index.js only creates the SDK client; the tests drive this module with the
// fake Gladys of the SDK (test/app.test.js).
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { logger as sdkLogger } from '@gladysassistant/integration-sdk';
import { normalizeConfig, readLanguage, AUTO_LANGUAGE, DEFAULT_LANGUAGE } from './config.js';
import { createSncfClient } from './sncf-api.js';
import { createStore, DEFAULT_PATH } from './store.js';
import { buildCatalog, findStation, searchStations } from './stations.js';
import {
  createRegistry,
  RegistryError,
  readHours,
  readDays,
  readDates,
  MAX_ROUTES,
} from './routes.js';
import { parseTrains, upcomingTrains, summarize, perDay, HORIZON_DAYS } from './trains.js';
import { buildRouteDevice, buildRouteStates, idsOf, routeIdOf } from './device.js';
import {
  TRIGGERS,
  SEARCH_OUTPUTS,
  ROUTE_OUTPUTS,
  detectNewSeats,
  detectSoldOut,
  newSeatsEvent,
  soldOutEvent,
  searchOutputs,
  routeOutputs,
  pick,
} from './events.js';
import {
  WIDGETS,
  messageContent,
  buildTrainsWidget,
  buildCalendarWidget,
  buildOverviewWidget,
} from './widgets.js';
import { parisClock, daysBetween, parseDateInput, MINUTE_MS, DAY_MS } from './time.js';
import { t, all, routeName, routeFilter, numericDate, isLanguage } from './i18n.js';

const ACTIONS = {
  TEST_CONNECTION: 'test_connection',
  FIND_STATION: 'find_station',
  ADD_ROUTE: 'add_route',
  EDIT_ROUTE: 'edit_route',
  REMOVE_ROUTE: 'remove_route',
  LIST_ROUTES: 'list_routes',
};
const SCENE_ACTIONS = { SEARCH_SEATS: 'search_seats', GET_ROUTE: 'get_route' };
// The metadata of the dataset: 48 requests a day.
const CHECK_INTERVAL_MS = 30 * MINUTE_MS;
// The states follow the time (a train that left is gone): no request.
const TICK_INTERVAL_MS = 5 * MINUTE_MS;
const STATIONS_MAX_AGE_MS = 7 * DAY_MS;
// A search of the scene action is reused this long.
const SEARCH_CACHE_MS = 15 * MINUTE_MS;
const SEARCH_CACHE_MAX = 50;
const ACTION_TEXT_MAX = 1500;
const { version: VERSION } = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);

/**
 * @description The signature of what a route follows: another one is a new
 * baseline for the scene triggers.
 * @param {object} route - The route.
 * @returns {string} The signature.
 */
const signatureOf = (route) =>
  [
    route.origin,
    route.destination,
    route.days,
    route.dates.join(','),
    route.after,
    route.before,
  ].join('|');

/**
 * @description "06:23" in Paris.
 * @param {number} instant - The instant, in ms.
 * @returns {{ date: string, time: string }} The Paris date and time.
 */
function parisStamp(instant) {
  const clock = parisClock(instant);
  const time = `${String(Math.floor(clock.minutes / 60)).padStart(2, '0')}:${String(clock.minutes % 60).padStart(2, '0')}`;
  return { date: clock.date, time };
}

/**
 * @description Cut a text of several lines at a line break, under a bound.
 * @param {string} text - The text.
 * @param {number} max - The bound.
 * @returns {string} The whole lines that fit, then "…".
 */
function clipLines(text, max) {
  if (text.length <= max) {
    return text;
  }
  const cut = text.lastIndexOf('\n', max - 2);
  return `${text.slice(0, cut > 0 ? cut : max - 2)}\n…`;
}

/**
 * @description Register every handler of the integration on a Gladys client.
 * @param {object} gladys - The GladysIntegration instance (or the fake one).
 * @param {object} [options] - Options (tests).
 * @param {Function} [options.fetch] - The fetch function.
 * @param {string} [options.baseUrl] - The datasets root of the portal.
 * @param {string} [options.storePath] - The file kept in /data.
 * @param {Function} [options.now] - `() => number` in ms.
 * @param {boolean} [options.timers] - Start the timers (false in tests).
 * @param {Function} [options.newId] - Identifiers of the routes (tests).
 * @param {object} [options.logger] - Logger.
 * @returns {object} The internals the tests drive.
 */
function createApp(
  gladys,
  {
    fetch: fetchFn,
    baseUrl,
    storePath = DEFAULT_PATH,
    now = () => Date.now(),
    timers = true,
    newId,
    logger = sdkLogger,
  } = {},
) {
  let config = normalizeConfig();
  // Language of the last widget request: the fallback of the texts Gladys does
  // not ask for in a language, when the `language` setting is `auto`. French
  // until a widget is shown: MAX is sold in France.
  let language = DEFAULT_LANGUAGE;
  let createdDevices = new Set();
  let catalog = [];
  // The last metadata of the dataset, and its last error.
  const dataset = { processedAt: null, records: null, checkedAt: 0, error: null };
  // route id -> { trains, readAt, version } of its last reading, or its error.
  const readings = new Map();
  const routeErrors = new Map();
  const pending = new Map();
  // "origin|destination|date" -> { trains, readAt }, for the scene action.
  const searches = new Map();
  let lastStatus = null;
  let lastDiscovery = null;
  let checkTimer = null;
  let tickTimer = null;
  let stopped = false;

  const api = createSncfClient({
    now,
    ...(fetchFn ? { fetch: fetchFn } : {}),
    ...(baseUrl ? { baseUrl } : {}),
  });
  const store = createStore({ path: storePath, logger });
  const registry = createRegistry(gladys, { logger, ...(newId ? { newId } : {}) });

  /**
   * @description Remember the language of a widget request, and store it when
   * it changed.
   * @param {string} next - The language.
   */
  function rememberLanguage(next) {
    if (!isLanguage(next) || next === language) {
      return;
    }
    language = next;
    gladys
      .setConfig({ last_language: next })
      .catch((err) => logger.warn(`Unable to store the language: ${err.message}`));
  }

  /**
   * @description Language of the texts Gladys does not ask for in a language.
   * @returns {string} The language.
   */
  const textLanguage = () => (config.language === AUTO_LANGUAGE ? language : config.language);

  /**
   * @description The message of an error, for a user.
   * @param {Error} err - The error.
   * @param {string} lang - The language.
   * @returns {string} The message.
   */
  function errorText(err, lang) {
    if (err instanceof RegistryError) {
      return t(err.key, lang, err.params);
    }
    if (err?.kind === 'quota') {
      return t('errorQuota', lang);
    }
    return t('errorUnreachable', lang, { detail: String(err?.message ?? err).slice(0, 80) });
  }

  /**
   * @description An error a configuration action shows under its button.
   * @param {Error} err - The error.
   * @returns {Error} An error whose message is written for the user.
   */
  const userError = (err) => new Error(errorText(err, textLanguage()), { cause: err });

  // --- Status ------------------------------------------------------------------------

  /**
   * @description Report the connection status, only when it changed.
   * @param {boolean} connected - Connected or not.
   * @param {object} message - The multi-language message.
   * @returns {Promise<void>}
   */
  async function reportStatus(connected, message) {
    const signature = JSON.stringify([connected, message]);
    if (signature === lastStatus) {
      return;
    }
    lastStatus = signature;
    try {
      await gladys.setConnectionStatus(connected, message);
    } catch (err) {
      lastStatus = null;
      logger.error('Unable to report the connection status', err);
    }
  }

  /**
   * @description Work out the connection status from the last readings.
   * @returns {Promise<void>}
   */
  async function refreshStatus() {
    const failure = dataset.error ?? [...routeErrors.values()][0];
    if (failure) {
      await reportStatus(
        false,
        all(failure.kind === 'quota' ? 'errorQuota' : 'errorUnreachable', {
          detail: String(failure.message ?? '').slice(0, 80),
        }),
      );
      return;
    }
    if (!Number.isFinite(dataset.processedAt)) {
      return;
    }
    const routes = registry.list().length;
    if (!routes) {
      await reportStatus(true, all('statusNoRoute'));
      return;
    }
    const stamp = parisStamp(dataset.processedAt);
    await reportStatus(
      true,
      all('statusOk', (lang) => ({
        date: numericDate(stamp.date, lang),
        time: stamp.time,
        routes,
      })),
    );
  }

  // --- Devices -----------------------------------------------------------------------

  /**
   * @description Read the devices the user created.
   * @returns {Promise<void>}
   */
  async function refreshCreatedDevices() {
    try {
      const devices = await gladys.getDevices();
      createdDevices = new Set((devices ?? []).map((device) => device.external_id));
    } catch (err) {
      logger.warn(`Unable to read the devices: ${err.message}`);
    }
  }

  /**
   * @description Offer the device of every route on the Discovery screen.
   * @param {boolean} [force] - Publish even when nothing changed.
   * @returns {Promise<number>} The number of devices offered.
   */
  async function publishDiscoveredDevices(force = false) {
    const devices = registry.list().map((route) => buildRouteDevice(gladys, route, textLanguage()));
    const signature = JSON.stringify(devices);
    if (!force && signature === lastDiscovery) {
      return devices.length;
    }
    try {
      await gladys.publishDiscoveredDevices(devices);
      lastDiscovery = signature;
    } catch (err) {
      logger.error('Unable to publish the discovered devices', err);
    }
    return devices.length;
  }

  /**
   * @description What a route offers now, from its last reading.
   * @param {object} route - The route.
   * @returns {object|null} `{ upcoming, summary }`, null when never read.
   */
  function snapshotOf(route) {
    const reading = readings.get(route.id);
    if (!reading) {
      return null;
    }
    const upcoming = upcomingTrains(reading.trains, route, now());
    return { upcoming, summary: summarize(upcoming, now()) };
  }

  /**
   * @description Publish the states of a route, when its device exists.
   * @param {object} route - The route.
   * @returns {Promise<void>}
   */
  async function publishRouteStates(route) {
    const snapshot = snapshotOf(route);
    if (!snapshot || !createdDevices.has(idsOf(gladys, route.id).device)) {
      return;
    }
    try {
      await gladys.publishChangedStates(
        buildRouteStates(gladys, route, snapshot.summary, { language: textLanguage(), now: now() }),
        { heartbeat: 6 * 60 * MINUTE_MS },
      );
    } catch (err) {
      logger.warn(`Unable to publish the states of ${routeName(route)}: ${err.message}`);
    }
  }

  /**
   * @description Fire the scene events of a new reading of a route, and
   * remember its open trains.
   * @param {object} route - The route.
   * @returns {Promise<void>}
   */
  async function digestEvents(route) {
    const snapshot = snapshotOf(route);
    if (!snapshot) {
      return;
    }
    const { upcoming, summary } = snapshot;
    const signature = signatureOf(route);
    const seen = store.data.seen[route.id];
    // Another route behind the same id (edited): a new baseline.
    const previous = seen?.signature === signature ? seen.open : null;
    const fresh = detectNewSeats(previous, summary.open);
    const deviceId = idsOf(gladys, route.id).device;
    const lang = textLanguage();
    const events = [];
    if (fresh?.length) {
      events.push([
        TRIGGERS.NEW_SEATS,
        newSeatsEvent({ route, deviceId, trains: fresh, language: lang, now: now() }),
      ]);
    }
    if (detectSoldOut(previous, summary.open, upcoming)) {
      events.push([TRIGGERS.SOLD_OUT, soldOutEvent({ route, deviceId, language: lang })]);
    }
    for (const [key, data] of events) {
      try {
        await gladys.publishSceneEvent(key, data);
      } catch (err) {
        logger.warn(`Unable to fire ${key}: ${err.message}`);
      }
    }
    store.data.seen[route.id] = { signature, open: summary.open.map((train) => train.key) };
    await store.save();
  }

  /**
   * @description Read the trains of a route on the portal.
   * @param {object} route - The route.
   * @param {object} [options] - `{ events }`: false for a reading that must
   * only set the baseline (a route just added or edited).
   * @returns {Promise<object|null>} Its reading, null on an error.
   */
  async function readRoute(route, { events = true } = {}) {
    if (pending.has(route.id)) {
      return pending.get(route.id);
    }
    const run = (async () => {
      try {
        const today = parisClock(now()).date;
        const records = await api.trains(route.origin, route.destination, today);
        const reading = {
          trains: parseTrains(records, route),
          readAt: now(),
          version: dataset.processedAt,
        };
        readings.set(route.id, reading);
        routeErrors.delete(route.id);
        if (!events) {
          delete store.data.seen[route.id];
        }
        await digestEvents(route);
        await publishRouteStates(route);
        return reading;
      } catch (err) {
        routeErrors.set(route.id, err);
        logger.warn(`Unable to read ${routeName(route)}: ${err.message}`);
        return null;
      } finally {
        pending.delete(route.id);
      }
    })();
    pending.set(route.id, run);
    return run;
  }

  /**
   * @description Read every route whose trains are older than the data.
   * @param {object} [options] - `{ force }`: every route.
   * @returns {Promise<void>}
   */
  async function readRoutes({ force = false } = {}) {
    for (const route of registry.list()) {
      if (stopped) {
        return;
      }
      const reading = readings.get(route.id);
      if (force || !reading || reading.version !== dataset.processedAt) {
        await readRoute(route);
      }
    }
    for (const id of [...routeErrors.keys()]) {
      if (!registry.byId(id)) {
        routeErrors.delete(id);
      }
    }
    await refreshStatus();
    refreshWidgets();
  }

  /**
   * @description Read the metadata of the dataset, and the routes when it was
   * rebuilt.
   * @returns {Promise<void>}
   */
  async function checkDataset() {
    try {
      const meta = await api.dataset();
      dataset.error = null;
      dataset.checkedAt = now();
      dataset.records = meta.records;
      if (meta.processedAt !== dataset.processedAt) {
        logger.info(
          `TGV MAX data of ${new Date(meta.processedAt ?? 0).toISOString()}: reading the routes`,
        );
      }
      dataset.processedAt = meta.processedAt;
    } catch (err) {
      dataset.error = err;
      logger.warn(`Unable to read the dataset: ${err.message}`);
      await refreshStatus();
      return;
    }
    await readRoutes();
  }

  /**
   * @description Work the states out again from the trains in memory.
   * @returns {Promise<void>}
   */
  async function tick() {
    for (const route of registry.list()) {
      await publishRouteStates(route);
    }
  }

  /**
   * @description Ask the dashboards to pull the widgets again.
   */
  function refreshWidgets() {
    for (const key of Object.values(WIDGETS)) {
      try {
        gladys.requestWidgetRefresh?.(key);
      } catch (err) {
        logger.debug?.(`Unable to refresh the widget ${key}: ${err.message}`);
      }
    }
  }

  // --- Stations ----------------------------------------------------------------------

  /**
   * @description The stations of the dataset: from /data while fresh, from
   * the portal otherwise (or when forced).
   * @param {object} [options] - `{ force }`.
   * @returns {Promise<object[]>} The catalogue.
   */
  async function loadCatalog({ force = false } = {}) {
    const kept = store.data.stations;
    const fresh = Array.isArray(kept.records) && now() - kept.readAt < STATIONS_MAX_AGE_MS;
    if (catalog.length && fresh && !force) {
      return catalog;
    }
    if (fresh && !force) {
      catalog = buildCatalog(kept.records);
      return catalog;
    }
    try {
      const records = await api.stations();
      store.data.stations = { records, readAt: now() };
      await store.save();
      catalog = buildCatalog(records);
    } catch (err) {
      logger.warn(`Unable to read the stations: ${err.message}`);
      if (Array.isArray(kept.records)) {
        catalog = buildCatalog(kept.records);
      } else if (!catalog.length) {
        throw err;
      }
    }
    return catalog;
  }

  /**
   * @description The station a user typed.
   * @param {unknown} query - The name.
   * @returns {Promise<object>} The station of the catalogue.
   */
  async function resolveStation(query) {
    const list = await loadCatalog();
    const found = findStation(list, query);
    if (found.status === 'found') {
      return found.station;
    }
    const typed = String(query ?? '')
      .trim()
      .slice(0, 40);
    if (found.status === 'empty') {
      throw new RegistryError('errorStationEmpty');
    }
    if (found.status === 'ambiguous') {
      throw new RegistryError('errorStationAmbiguous', {
        query: typed,
        candidates: found.candidates.map((station) => station.label).join(', '),
      });
    }
    throw new RegistryError('errorStationNone', { query: typed });
  }

  // --- Widgets -----------------------------------------------------------------------

  /**
   * @description The route a widget points at, read when needed.
   * @param {unknown} externalId - The device external id of the setting.
   * @param {string} lang - The language.
   * @returns {Promise<{ route: object, snapshot: object }|{ content: object }>}
   * The route and what it offers, or the content to show instead.
   */
  async function widgetRoute(externalId, lang) {
    if (!externalId) {
      return { content: messageContent(t('widgetNoRoute', lang)) };
    }
    const route = registry.byId(routeIdOf(externalId));
    if (!route) {
      return { content: messageContent(t('widgetUnknownRoute', lang)) };
    }
    if (!readings.has(route.id)) {
      await readRoute(route);
    }
    const snapshot = snapshotOf(route);
    if (!snapshot) {
      const err = routeErrors.get(route.id);
      return {
        content: messageContent(
          err ? t('widgetError', lang, { detail: errorText(err, lang) }) : t('widgetNotRead', lang),
        ),
      };
    }
    return { route, snapshot };
  }

  gladys.onWidgetGet(WIDGETS.TRAINS, async ({ settings = {}, language: lang }) => {
    rememberLanguage(lang);
    const found = await widgetRoute(settings.route, lang);
    if (found.content) {
      return found.content;
    }
    return buildTrainsWidget({
      route: found.route,
      summary: found.snapshot.summary,
      readAt: dataset.processedAt,
      count: settings.count,
      language: lang,
      now: now(),
    });
  });

  gladys.onWidgetGet(WIDGETS.CALENDAR, async ({ settings = {}, language: lang }) => {
    rememberLanguage(lang);
    const found = await widgetRoute(settings.route, lang);
    if (found.content) {
      return found.content;
    }
    return buildCalendarWidget({
      route: found.route,
      summary: found.snapshot.summary,
      days: perDay(found.snapshot.upcoming, now(), found.route),
      readAt: dataset.processedAt,
      language: lang,
      now: now(),
    });
  });

  gladys.onWidgetGet(WIDGETS.OVERVIEW, async ({ language: lang }) => {
    rememberLanguage(lang);
    const rows = registry
      .list()
      .map((route) => ({ route, summary: snapshotOf(route)?.summary ?? null }));
    return buildOverviewWidget({ rows, readAt: dataset.processedAt, language: lang });
  });

  // --- Scene actions -----------------------------------------------------------------

  /**
   * @description The trains of a route on one date, from the cache or the portal.
   * @param {object} origin - The origin station.
   * @param {object} destination - The destination station.
   * @param {string} date - `YYYY-MM-DD`.
   * @returns {Promise<object[]>} The trains.
   */
  async function trainsOn(origin, destination, date) {
    const key = `${origin.name}|${destination.name}|${date}`;
    const cached = searches.get(key);
    if (cached && now() - cached.readAt < SEARCH_CACHE_MS) {
      return cached.trains;
    }
    const records = await api.trains(origin.name, destination.name, date, date);
    const trains = parseTrains(records, { origin: origin.name, destination: destination.name });
    searches.set(key, { trains, readAt: now() });
    while (searches.size > SEARCH_CACHE_MAX) {
      searches.delete(searches.keys().next().value);
    }
    return trains;
  }

  gladys.onSceneAction(SCENE_ACTIONS.SEARCH_SEATS, async (fields = {}) => {
    const lang = textLanguage();
    try {
      const origin = await resolveStation(fields.origin);
      const destination = await resolveStation(fields.destination);
      const today = parisClock(now()).date;
      const parsed = parseDateInput(fields.date, today);
      const date = parsed ?? today;
      if (parsed === undefined || date < today || daysBetween(today, date) >= HORIZON_DAYS) {
        throw new RegistryError('errorSearchDate');
      }
      const hours = readHours(fields.depart_after, fields.depart_before);
      const trains = upcomingTrains(
        await trainsOn(origin, destination, date),
        { days: 'all', dates: [date], ...hours },
        now(),
      ).filter((train) => train.open);
      return pick(
        searchOutputs({
          origin: origin.name,
          destination: destination.name,
          date,
          trains,
          language: lang,
          now: now(),
        }),
        SEARCH_OUTPUTS,
      );
    } catch (err) {
      throw new Error(errorText(err, lang), { cause: err });
    }
  });

  gladys.onSceneAction(SCENE_ACTIONS.GET_ROUTE, async (fields = {}) => {
    const lang = textLanguage();
    const route = registry.byId(routeIdOf(fields.route));
    if (!route) {
      throw new Error(t('widgetUnknownRoute', lang));
    }
    if (!readings.has(route.id)) {
      await readRoute(route);
    }
    const snapshot = snapshotOf(route);
    if (!snapshot) {
      throw new Error(errorText(routeErrors.get(route.id), lang));
    }
    return pick(
      routeOutputs({ route, summary: snapshot.summary, language: lang, now: now() }),
      ROUTE_OUTPUTS,
    );
  });

  // --- Configuration actions -----------------------------------------------------------

  gladys.onAction(ACTIONS.TEST_CONNECTION, async () => {
    try {
      const meta = await api.dataset();
      dataset.processedAt = meta.processedAt;
      dataset.records = meta.records;
      dataset.error = null;
      const list = await loadCatalog({ force: true });
      const stamp = parisStamp(meta.processedAt ?? now());
      const quota = api.quota.remaining ?? '?';
      await refreshStatus();
      return all('testOk', (lang) => ({
        date: numericDate(stamp.date, lang),
        time: stamp.time,
        stations: list.length,
        records: meta.records ?? '?',
        quota,
      }));
    } catch (err) {
      dataset.error = err;
      await refreshStatus();
      throw userError(err);
    }
  });

  gladys.onAction(ACTIONS.FIND_STATION, async (fields = {}) => {
    const lang = textLanguage();
    const query = String(fields.query ?? '').trim();
    let list;
    try {
      list = await loadCatalog();
    } catch (err) {
      throw userError(err);
    }
    const stations = searchStations(list, query);
    if (!stations.length) {
      return t('stationsNone', lang, { query: query.slice(0, 40) });
    }
    const lines = stations.map((station) => {
      const group = station.codes.length > 1 ? ` (${t('stationGroup', lang)})` : '';
      return `• ${station.label}${group}`;
    });
    return clipLines(
      `${t('stationsFound', lang, { query: query.slice(0, 40) })}\n${lines.join('\n')}`,
      ACTION_TEXT_MAX,
    );
  });

  /**
   * @description Check that MAX trains run on a pair of stations, and keep
   * the answer as the first reading of the route.
   * @param {object} origin - The origin station.
   * @param {object} destination - The destination station.
   * @returns {Promise<object[]>} The trains.
   */
  async function checkPair(origin, destination) {
    if (origin.name === destination.name) {
      throw new RegistryError('errorSameStation');
    }
    const today = parisClock(now()).date;
    const records = await api.trains(origin.name, destination.name, today);
    if (!records.length) {
      throw new RegistryError('errorNoTrains', {
        origin: origin.label,
        destination: destination.label,
      });
    }
    return parseTrains(records, { origin: origin.name, destination: destination.name });
  }

  /**
   * @description Take a route into account: its first reading (a baseline),
   * its device, its states.
   * @param {object} route - The route.
   * @param {object[]} [trains] - Its trains, already read.
   * @returns {Promise<void>}
   */
  async function adopt(route, trains) {
    delete store.data.seen[route.id];
    if (trains) {
      readings.set(route.id, { trains, readAt: now(), version: dataset.processedAt });
      routeErrors.delete(route.id);
      await digestEvents(route);
    } else {
      await readRoute(route, { events: false });
    }
    await publishDiscoveredDevices();
    await publishRouteStates(route);
    await refreshStatus();
    refreshWidgets();
  }

  gladys.onAction(ACTIONS.ADD_ROUTE, async (fields = {}) => {
    try {
      const origin = await resolveStation(fields.origin);
      const destination = await resolveStation(fields.destination);
      const today = parisClock(now()).date;
      const days = readDays(fields.days);
      const dates = readDates(fields.dates, today) ?? [];
      const hours = readHours(fields.depart_after, fields.depart_before);
      const both = fields.return_trip === true || fields.return_trip === 'true';
      if (registry.list().length + (both ? 2 : 1) > MAX_ROUTES) {
        throw new RegistryError('errorTooManyRoutes', { max: MAX_ROUTES });
      }
      const trains = await checkPair(origin, destination);
      const back = both ? await checkPair(destination, origin) : null;
      const added = await registry.add({
        origin: origin.name,
        destination: destination.name,
        days,
        dates,
        ...hours,
      });
      await adopt(added, trains);
      if (back) {
        const reverse = await registry.add({
          origin: destination.name,
          destination: origin.name,
          days,
          dates,
          ...hours,
        });
        await adopt(reverse, back);
      }
      return all(back ? 'routesAdded' : 'routeAdded', (lang) => ({
        route: routeName(added),
        filter: routeFilter(added, lang, { always: true }),
      }));
    } catch (err) {
      throw userError(err);
    }
  });

  gladys.onAction(ACTIONS.EDIT_ROUTE, async (fields = {}) => {
    try {
      const route = registry.find(fields.route);
      const today = parisClock(now()).date;
      const dates = readDates(fields.dates, today);
      const patch = {
        days: readDays(fields.days, route.days),
        dates: dates ?? route.dates,
        ...readHours(fields.depart_after, fields.depart_before, route),
      };
      const changed = await registry.update(route.id, patch);
      await adopt(changed, readings.get(route.id)?.trains);
      return all('routeChanged', (lang) => ({
        route: routeName(changed),
        filter: routeFilter(changed, lang, { always: true }),
      }));
    } catch (err) {
      throw userError(err);
    }
  });

  gladys.onAction(ACTIONS.REMOVE_ROUTE, async (fields = {}) => {
    try {
      const route = registry.find(fields.route);
      await registry.remove(route.id);
      readings.delete(route.id);
      routeErrors.delete(route.id);
      delete store.data.seen[route.id];
      await store.save();
      await publishDiscoveredDevices();
      await refreshStatus();
      refreshWidgets();
      return all('routeRemoved', { route: routeName(route) });
    } catch (err) {
      throw userError(err);
    }
  });

  gladys.onAction(ACTIONS.LIST_ROUTES, async () => {
    const lang = textLanguage();
    const routes = registry.list();
    if (!routes.length) {
      return t('routesNone', lang);
    }
    const lines = routes.map((route, index) => {
      const summary = snapshotOf(route)?.summary;
      return t('routeLine', lang, {
        index: index + 1,
        route: routeName(route),
        filter: routeFilter(route, lang, { always: true }),
        seats: summary ? t('routeSeats', lang, { count: summary.count }) : t('routeNotRead', lang),
      });
    });
    return clipLines(
      `${t('routesList', lang, { count: routes.length })}\n${lines.join('\n')}`,
      ACTION_TEXT_MAX,
    );
  });

  // --- Discovery and devices -----------------------------------------------------------

  gladys.onScanRequest(async () => {
    const count = await publishDiscoveredDevices(true);
    logger.info(`Scan: ${count} device(s) offered`);
  });

  gladys.onDeviceCreated(async () => {
    await refreshCreatedDevices();
    // States sent before the device existed were dropped by Gladys, and the SDK
    // forgot what it sent for this device: send everything known again.
    for (const route of registry.list()) {
      await publishRouteStates(route);
    }
    refreshWidgets();
  });

  gladys.onDeviceDeleted(refreshCreatedDevices);

  // --- Configuration -----------------------------------------------------------------

  /**
   * @description Reload the whole config (internal keys included).
   * @param {object} [fallback] - Raw values to use when the read fails.
   * @returns {Promise<void>}
   */
  async function loadConfig(fallback) {
    try {
      const raw = (await gladys.getConfig()) ?? {};
      config = normalizeConfig(raw);
      language = readLanguage(raw, language);
      registry.load(raw);
    } catch (err) {
      // The form values may lack the internal keys: keep the routes in memory.
      if (fallback) {
        config = normalizeConfig(fallback);
      }
      logger.error('Unable to read the configuration', err);
    }
  }

  gladys.onConfigUpdated(async (raw) => {
    const before = textLanguage();
    await loadConfig(raw);
    if (textLanguage() !== before) {
      // Device names follow the language until a device is created.
      await publishDiscoveredDevices();
      await tick();
    }
    logger.info('Configuration updated');
  });

  // --- Timers ------------------------------------------------------------------------

  function schedule() {
    if (!timers || checkTimer) {
      return;
    }
    checkTimer = setInterval(() => {
      checkDataset().catch((err) => logger.error('Dataset check', err));
    }, CHECK_INTERVAL_MS);
    tickTimer = setInterval(() => {
      tick().catch((err) => logger.error('Tick', err));
    }, TICK_INTERVAL_MS);
  }

  // --- Connection lifecycle ----------------------------------------------------------
  // Each (re)connection resynchronizes; the promise lets the tests wait for it.
  let startup = Promise.resolve();
  gladys.on('connected', () => {
    startup = (async () => {
      logger.info(`TGV MAX ${VERSION}: resynchronizing`);
      await loadConfig();
      await store.load();
      await refreshCreatedDevices();
      lastStatus = null;
      lastDiscovery = null;
      await publishDiscoveredDevices();
      await loadCatalog().catch(() => {});
      await checkDataset();
      schedule();
    })().catch((err) => logger.error('Startup', err));
  });

  // --- Graceful shutdown -------------------------------------------------------------
  gladys.handleShutdown(async (signal) => {
    logger.info(`Received ${signal} -> graceful shutdown`);
    stopped = true;
    clearInterval(checkTimer);
    clearInterval(tickTimer);
    await store.save();
  });

  return {
    api,
    store,
    registry,
    checkDataset,
    readRoutes,
    readRoute,
    tick,
    loadCatalog,
    getReading: (id) => readings.get(id),
    getDataset: () => dataset,
    getCatalog: () => catalog,
    whenReady: () => startup,
  };
}

export {
  createApp,
  ACTIONS,
  SCENE_ACTIONS,
  CHECK_INTERVAL_MS,
  TICK_INTERVAL_MS,
  STATIONS_MAX_AGE_MS,
  SEARCH_CACHE_MS,
};
