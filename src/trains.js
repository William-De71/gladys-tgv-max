// -----------------------------------------------------------------------------
// The trains of a route, from the records of the dataset.
//
// A train is listed once per pair of stations it serves: Paris → Lyon gives
// one record to Part-Dieu and one to Perrache for the same TGV. They are
// merged into one train, open when MAX seats are open to one of the
// stations at least. A followed route then keeps the trains of its days and
// hours, from now on (a train that left is gone, even if the morning data
// still lists it).
// -----------------------------------------------------------------------------

import { parisClock, isDate, minutesOf, weekdayOf, addDays, daysBetween } from './time.js';
import { stationOf } from './stations.js';

const OPEN = 'OUI';
// The days of a route, keys of the manifest selects.
const DAY_SETS = {
  all: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
  weekdays: ['mon', 'tue', 'wed', 'thu', 'fri'],
  weekend: ['sat', 'sun'],
  fri_sun: ['fri', 'sat', 'sun'],
  mon: ['mon'],
  tue: ['tue'],
  wed: ['wed'],
  thu: ['thu'],
  fri: ['fri'],
  sat: ['sat'],
  sun: ['sun'],
};
const DAY_KEYS = Object.keys(DAY_SETS);
// The dataset covers 30 days: today and the next 30 (31 dates seen).
const HORIZON_DAYS = 31;

/**
 * @description The identifier of a train on a date: stable from one day of
 * data to the next.
 * @param {object} train - `{ date, number, departure }`.
 * @returns {string} "2026-11-06_6641_06:20".
 */
const trainKey = (train) => `${train.date}_${train.number}_${train.departure}`;

/**
 * @description Merge the records of a route into trains.
 * @param {object[]} records - The records of the dataset.
 * @param {object} [names] - `{ origin, destination }`: the names of the
 * route in the dataset, for the station names.
 * @returns {object[]} `[{ key, date, number, axis, departure, arrival,
 * nextDay, open, from, to, fromCode, toCode }]`, by date and time; `from`
 * and `to` are the stations of the first open record (or of the first one).
 */
function parseTrains(records, names = {}) {
  const byKey = new Map();
  for (const record of records ?? []) {
    const departure = minutesOf(record?.heure_depart);
    const arrival = minutesOf(record?.heure_arrivee);
    const number = String(record?.train_no ?? '').trim();
    if (!isDate(record?.date) || departure === null || !number) {
      continue;
    }
    const open = record.od_happy_card === OPEN;
    const base = {
      date: record.date,
      number,
      departure: record.heure_depart.trim().padStart(5, '0'),
    };
    const key = trainKey(base);
    const leg = {
      open,
      arrival: arrival === null ? '' : record.heure_arrivee.trim().padStart(5, '0'),
      nextDay: arrival !== null && arrival < departure,
      fromCode: String(record.origine_iata ?? ''),
      toCode: String(record.destination_iata ?? ''),
    };
    const train = byKey.get(key);
    if (!train) {
      byKey.set(key, { ...base, key, axis: String(record.axe ?? ''), legs: [leg] });
    } else {
      train.legs.push(leg);
    }
  }
  return [...byKey.values()]
    .map(({ legs, ...train }) => {
      // The first open leg, the earliest arrival first.
      const sorted = [...legs].sort(
        (a, b) =>
          Number(b.open) - Number(a.open) ||
          Number(a.nextDay) - Number(b.nextDay) ||
          a.arrival.localeCompare(b.arrival),
      );
      const leg = sorted[0];
      return {
        ...train,
        open: legs.some((entry) => entry.open),
        arrival: leg.arrival,
        nextDay: leg.nextDay,
        fromCode: leg.fromCode,
        toCode: leg.toCode,
        from: stationOf(leg.fromCode, names.origin ?? ''),
        to: stationOf(leg.toCode, names.destination ?? ''),
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.departure.localeCompare(b.departure));
}

/**
 * @description Whether a train fits the days and hours of a route.
 * @param {object} train - A train of parseTrains.
 * @param {object} route - `{ days, dates, after, before }`: a key of
 * DAY_SETS, the dates that replace it (empty for none), the hours (0-24).
 * @returns {boolean} True when it fits.
 */
function fits(train, route) {
  if (route.dates?.length) {
    if (!route.dates.includes(train.date)) {
      return false;
    }
  } else if (!(DAY_SETS[route.days] ?? DAY_SETS.all).includes(weekdayOf(train.date))) {
    return false;
  }
  const minutes = minutesOf(train.departure);
  return minutes >= (route.after ?? 0) * 60 && minutes < (route.before ?? 24) * 60;
}

/**
 * @description The trains of a route still to come.
 * @param {object[]} trains - parseTrains().
 * @param {object} route - The route (see fits).
 * @param {number} now - Now, in ms.
 * @returns {object[]} The trains that fit and have not left yet.
 */
function upcomingTrains(trains, route, now) {
  const clock = parisClock(now);
  return (trains ?? []).filter(
    (train) =>
      (train.date > clock.date ||
        (train.date === clock.date && minutesOf(train.departure) > clock.minutes)) &&
      fits(train, route),
  );
}

/**
 * @description What a route offers.
 * @param {object[]} trains - upcomingTrains().
 * @param {number} now - Now, in ms.
 * @returns {{ open: object[], count: number, days: number, total: number,
 * next: object|null, nextInDays: number|null }} The open trains by date and
 * time, their number, the number of dates with one at least, the trains of
 * the route, the first open one and how many days until it.
 */
function summarize(trains, now) {
  const open = (trains ?? []).filter((train) => train.open);
  const next = open[0] ?? null;
  return {
    open,
    count: open.length,
    days: new Set(open.map((train) => train.date)).size,
    total: (trains ?? []).length,
    next,
    nextInDays: next ? daysBetween(parisClock(now).date, next.date) : null,
  };
}

/**
 * @description The open trains of each date, over the horizon of the
 * dataset, for the calendar widget.
 * @param {object[]} trains - upcomingTrains().
 * @param {number} now - Now, in ms.
 * @param {object} [route] - Only the dates of the route (all of them when
 * absent).
 * @returns {Array<{ date: string, open: number, total: number }>} One entry
 * per date, today first.
 */
function perDay(trains, now, route) {
  const today = parisClock(now).date;
  const days = [];
  for (let offset = 0; offset < HORIZON_DAYS; offset += 1) {
    const date = addDays(today, offset);
    const inRoute =
      !route ||
      (route.dates?.length
        ? route.dates.includes(date)
        : (DAY_SETS[route.days] ?? DAY_SETS.all).includes(weekdayOf(date)));
    if (!inRoute) {
      continue;
    }
    const ofDay = (trains ?? []).filter((train) => train.date === date);
    days.push({
      date,
      open: ofDay.filter((train) => train.open).length,
      total: ofDay.length,
    });
  }
  return days;
}

export {
  OPEN,
  DAY_SETS,
  DAY_KEYS,
  HORIZON_DAYS,
  trainKey,
  parseTrains,
  fits,
  upcomingTrains,
  summarize,
  perDay,
};
