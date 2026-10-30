import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseTrains,
  fits,
  upcomingTrains,
  summarize,
  perDay,
  trainKey,
  DAY_KEYS,
  HORIZON_DAYS,
} from '../src/trains.js';
import { daysBetween } from '../src/time.js';
import { ROUTES, NOW } from './helpers/fixtures.js';

const NAMES = { origin: 'PARIS (intramuros)', destination: 'LYON (intramuros)' };
const trains = parseTrains(ROUTES['PARIS (intramuros)|LYON (intramuros)'], NAMES);
const route = (fields = {}) => ({ days: 'all', dates: [], after: 0, before: 24, ...fields });

test('one train per train number and date, open when one of its stations is', () => {
  const records = ROUTES['PARIS (intramuros)|LYON (intramuros)'];
  assert.equal(records.length, 330);
  assert.ok(trains.length < records.length && trains.length > 150, String(trains.length));
  const first = trains.find((train) => train.date === '2026-11-06' && train.number === '6641');
  assert.deepEqual(first, {
    key: '2026-11-06_6641_06:20',
    date: '2026-11-06',
    number: '6641',
    departure: '06:20',
    axis: 'SUD EST',
    open: true,
    arrival: '08:22',
    nextDay: false,
    fromCode: 'FRPLY',
    toCode: 'FRLPD',
    from: 'Paris Gare de Lyon',
    to: 'Lyon Part-Dieu',
  });
  assert.equal(trainKey(first), first.key);
  // Open to Perrache only: still an open train, arriving at Perrache.
  const mixed = parseTrains([
    { ...records[0], destination_iata: 'FRLPD', heure_arrivee: '08:22', od_happy_card: 'NON' },
    { ...records[0], destination_iata: 'FRLPE', heure_arrivee: '08:34', od_happy_card: 'OUI' },
  ]);
  assert.equal(mixed.length, 1);
  assert.equal(mixed[0].open, true);
  assert.equal(mixed[0].arrival, '08:34');
  assert.equal(mixed[0].toCode, 'FRLPE');
});

test('a night train arrives the next day; broken records are skipped', () => {
  const [night] = parseTrains([
    {
      date: '2026-11-06',
      train_no: '5789',
      axe: 'IC NUIT',
      origine_iata: 'FRPAZ',
      destination_iata: 'FRBZR',
      heure_depart: '21:52',
      heure_arrivee: '07:10',
      od_happy_card: 'OUI',
    },
    { date: '2026-02-30', train_no: '1', heure_depart: '10:00', od_happy_card: 'OUI' },
    { date: '2026-11-06', train_no: '', heure_depart: '10:00', od_happy_card: 'OUI' },
    { date: '2026-11-06', train_no: '2', heure_depart: 'soon', od_happy_card: 'OUI' },
  ]);
  assert.equal(night.nextDay, true);
  assert.equal(night.from, 'Paris Austerlitz');
});

test('the days and hours of a route', () => {
  const friday = { date: '2026-11-06', departure: '18:00' };
  assert.ok(fits(friday, route({ days: 'fri', after: 17, before: 21 })));
  assert.ok(fits(friday, route({ days: 'fri_sun' })));
  assert.ok(!fits(friday, route({ days: 'weekend' })));
  assert.ok(!fits(friday, route({ days: 'weekdays', after: 19 })));
  assert.ok(!fits({ ...friday, departure: '21:00' }, route({ before: 21 })), 'before is exclusive');
  assert.ok(fits(friday, route({ days: 'mon', dates: ['2026-11-06'] })), 'dates replace the days');
  assert.ok(!fits(friday, route({ dates: ['2026-11-07'] })));
  assert.deepEqual(DAY_KEYS.slice(0, 4), ['all', 'weekdays', 'weekend', 'fri_sun']);
});

test('upcoming trains: the ones of today that left are gone', () => {
  const today = upcomingTrains(trains, route({ dates: ['2026-10-30'] }), NOW);
  assert.ok(today.length > 0);
  assert.ok(today.every((train) => train.departure > '09:00'));
  const summary = summarize(upcomingTrains(trains, route(), NOW), NOW);
  assert.equal(summary.count, summary.open.length);
  assert.ok(summary.days >= 1 && summary.days <= 10);
  assert.equal(summary.next, summary.open[0]);
  assert.equal(summary.nextInDays, daysBetween('2026-10-30', summary.next.date));
  assert.deepEqual(summarize([], NOW), {
    open: [],
    count: 0,
    days: 0,
    total: 0,
    next: null,
    nextInDays: null,
  });
});

test('per day, over the horizon of the dataset, only the days of the route', () => {
  const upcoming = upcomingTrains(trains, route(), NOW);
  const days = perDay(upcoming, NOW);
  assert.equal(days.length, HORIZON_DAYS);
  assert.equal(days[0].date, '2026-10-30');
  assert.equal(days.at(-1).date, '2026-11-29');
  // The fixture stops on 8 November.
  assert.ok(days.slice(10).every((day) => day.total === 0));
  const fridays = perDay(upcoming, NOW, route({ days: 'fri' }));
  assert.deepEqual(
    fridays.map((day) => day.date),
    ['2026-10-30', '2026-11-06', '2026-11-13', '2026-11-20', '2026-11-27'],
  );
  assert.ok(fridays[1].open >= 1 && fridays[1].open <= fridays[1].total);
});
