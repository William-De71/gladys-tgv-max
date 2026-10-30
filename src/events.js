// -----------------------------------------------------------------------------
// Scene triggers and scene action outputs.
//
// Triggers (one event per route and per rebuild of the dataset, never one
// per train: ten seats opening on a Friday make one notification):
//   - `new_seats`  MAX seats opened on trains of a followed route that had
//                  none in the previous data (or were not listed yet: the
//                  dataset adds a new day every morning, 30 days ahead);
//   - `sold_out`   a followed route had open trains and has none left.
//
// The first reading of a route is a baseline: nothing fires. `seen` (in
// /data) remembers the open trains of each route, so a restart neither fires
// again nor misses what opened meanwhile. A scene action or a widget never
// fires an event.
// -----------------------------------------------------------------------------

import { t, routeName, stationName, trainText, dateText } from './i18n.js';
import { daysBetween, parisClock } from './time.js';

const TRIGGERS = { NEW_SEATS: 'new_seats', SOLD_OUT: 'sold_out' };
// The trains listed in a summary: the rest is counted.
const SUMMARY_TRAINS = 8;
const DATA_TEXT_MAX = 1000;

const SEARCH_OUTPUTS = [
  'found',
  'count',
  'origin_name',
  'destination_name',
  'date',
  'first_departure',
  'first_arrival',
  'first_train',
  'summary',
];
const ROUTE_OUTPUTS = [
  'found',
  'count',
  'days',
  'next_date',
  'next_date_text',
  'next_departure',
  'next_arrival',
  'next_train',
  'summary',
];

/**
 * @description The trains that opened since the previous reading.
 * @param {string[]|null|undefined} previous - The keys of the open trains of
 * the previous reading, null when there is none (a baseline).
 * @param {object[]} open - The open trains now (summarize().open).
 * @returns {object[]|null} The new open trains, null for a baseline.
 */
function detectNewSeats(previous, open) {
  if (!Array.isArray(previous)) {
    return null;
  }
  const known = new Set(previous);
  return open.filter((train) => !known.has(train.key));
}

/**
 * @description Whether a route has just sold out: open trains before, none
 * now, and the previous ones are still to come (a train that left does not
 * make a route sold out).
 * @param {string[]|null|undefined} previous - The keys of the open trains of
 * the previous reading.
 * @param {object[]} open - The open trains now.
 * @param {object[]} upcoming - Every train still to come (open or not).
 * @returns {boolean} True when it sold out.
 */
function detectSoldOut(previous, open, upcoming) {
  if (!Array.isArray(previous) || previous.length === 0 || open.length > 0) {
    return false;
  }
  const coming = new Set(upcoming.map((train) => train.key));
  return previous.some((key) => coming.has(key));
}

/**
 * @description A list of trains, one per line, the rest counted.
 * @param {object[]} trains - The trains.
 * @param {string} language - The language.
 * @param {string} today - Today, `YYYY-MM-DD`.
 * @returns {string} The lines.
 */
function trainsText(trains, language, today) {
  const lines = trains
    .slice(0, SUMMARY_TRAINS)
    .map((train) => `• ${trainText(train, language, { today })}`);
  if (trains.length > SUMMARY_TRAINS) {
    lines.push(t('andMore', language, { count: trains.length - SUMMARY_TRAINS }));
  }
  return lines.join('\n');
}

/**
 * @description The data of the `new_seats` event.
 * @param {object} options - `{ route, deviceId, trains, language, now }`.
 * @returns {object} The flat payload.
 */
function newSeatsEvent({ route, deviceId, trains, language, now }) {
  const today = parisClock(now).date;
  const first = trains[0];
  const summary = `${t('newSeatsSummary', language, {
    route: routeName(route),
    count: trains.length,
  })}\n${trainsText(trains, language, today)}`;
  return {
    route: deviceId,
    route_name: routeName(route),
    origin: stationName(route.origin),
    destination: stationName(route.destination),
    count: trains.length,
    first_date: first.date,
    first_date_text: dateText(first.date, language),
    first_departure: first.departure,
    first_arrival: first.arrival,
    first_train: first.number,
    days_until: daysBetween(today, first.date),
    summary: summary.slice(0, DATA_TEXT_MAX),
  };
}

/**
 * @description The data of the `sold_out` event.
 * @param {object} options - `{ route, deviceId, language }`.
 * @returns {object} The flat payload.
 */
function soldOutEvent({ route, deviceId, language }) {
  return {
    route: deviceId,
    route_name: routeName(route),
    origin: stationName(route.origin),
    destination: stationName(route.destination),
    summary: t('soldOutSummary', language, { route: routeName(route) }),
  };
}

/**
 * @description The outputs of the "Search MAX seats" scene action.
 * @param {object} options - `{ origin, destination, date, trains, language,
 * now }`: the stations found, the date, its open trains.
 * @returns {object} The outputs.
 */
function searchOutputs({ origin, destination, date, trains, language, now }) {
  const today = parisClock(now).date;
  const first = trains[0];
  const route = `${stationName(origin)} → ${stationName(destination)}`;
  const summary = trains.length
    ? `${t('searchSummary', language, { route, date: dateText(date, language), count: trains.length })}\n${trainsText(trains, language, today)}`
    : t('searchNone', language, { route, date: dateText(date, language) });
  return {
    found: trains.length > 0,
    count: trains.length,
    origin_name: stationName(origin),
    destination_name: stationName(destination),
    date,
    first_departure: first?.departure ?? '',
    first_arrival: first?.arrival ?? '',
    first_train: first?.number ?? '',
    summary,
  };
}

/**
 * @description The outputs of the "Read a followed route" scene action.
 * @param {object} options - `{ route, summary, language, now }`.
 * @returns {object} The outputs.
 */
function routeOutputs({ route, summary, language, now }) {
  const today = parisClock(now).date;
  const { next } = summary;
  const text = summary.count
    ? `${t('routeSummary', language, { route: routeName(route), count: summary.count, days: summary.days })}\n${trainsText(summary.open, language, today)}`
    : t('routeNone', language, { route: routeName(route) });
  return {
    found: summary.count > 0,
    count: summary.count,
    days: summary.days,
    next_date: next?.date ?? '',
    next_date_text: next ? dateText(next.date, language) : '',
    next_departure: next?.departure ?? '',
    next_arrival: next?.arrival ?? '',
    next_train: next?.number ?? '',
    summary: text,
  };
}

/**
 * @description Keep only the declared keys.
 * @param {object} values - The values.
 * @param {string[]} keys - The declared keys.
 * @returns {object} The values of those keys.
 */
const pick = (values, keys) => Object.fromEntries(keys.map((key) => [key, values[key]]));

export {
  TRIGGERS,
  SUMMARY_TRAINS,
  SEARCH_OUTPUTS,
  ROUTE_OUTPUTS,
  detectNewSeats,
  detectSoldOut,
  trainsText,
  newSeatsEvent,
  soldOutEvent,
  searchOutputs,
  routeOutputs,
  pick,
};
