import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  detectNewSeats,
  detectSoldOut,
  newSeatsEvent,
  soldOutEvent,
  searchOutputs,
  routeOutputs,
  trainsText,
  pick,
  SEARCH_OUTPUTS,
  SUMMARY_TRAINS,
} from '../src/events.js';
import { parseTrains, upcomingTrains, summarize } from '../src/trains.js';
import { ROUTES, NOW } from './helpers/fixtures.js';

const ROUTE = {
  id: '0000000a',
  origin: 'PARIS (intramuros)',
  destination: 'LYON (intramuros)',
  days: 'all',
  dates: [],
  after: 0,
  before: 24,
};
const upcoming = upcomingTrains(
  parseTrains(ROUTES['PARIS (intramuros)|LYON (intramuros)'], ROUTE),
  ROUTE,
  NOW,
);
const summary = summarize(upcoming, NOW);
const DEVICE = 'ext:tgv-max:route:0000000a';

test('new seats: none on a baseline, only the trains not open before', () => {
  assert.equal(detectNewSeats(null, summary.open), null);
  assert.equal(detectNewSeats(undefined, summary.open), null);
  const keys = summary.open.map((train) => train.key);
  assert.deepEqual(detectNewSeats(keys, summary.open), []);
  assert.deepEqual(detectNewSeats(keys.slice(1), summary.open), [summary.open[0]]);
});

test('sold out: open trains before, none now, and they are still to come', () => {
  const keys = summary.open.map((train) => train.key);
  assert.equal(detectSoldOut(keys, [], upcoming), true);
  assert.equal(detectSoldOut(keys, summary.open, upcoming), false);
  assert.equal(detectSoldOut([], [], upcoming), false);
  assert.equal(detectSoldOut(null, [], upcoming), false);
  assert.equal(detectSoldOut(['2026-10-29_6641_06:20'], [], upcoming), false, 'it left');
});

test('the event payloads are flat and bounded', () => {
  const trains = summary.open.slice(0, 12);
  const event = newSeatsEvent({ route: ROUTE, deviceId: DEVICE, trains, language: 'en', now: NOW });
  for (const value of Object.values(event)) {
    assert.ok(['string', 'number', 'boolean'].includes(typeof value));
    assert.ok(typeof value !== 'string' || value.length <= 1000);
  }
  assert.ok(Object.keys(event).length <= 30);
  assert.equal(event.route, DEVICE);
  assert.equal(event.origin, 'Paris');
  assert.equal(event.count, 12);
  assert.match(event.summary, /^MAX seats opened on Paris → Lyon: 12 train\(s\)\.\n• /);
  assert.match(event.summary, /\n… and 4 more$/);
  assert.equal(event.summary.split('\n').length, SUMMARY_TRAINS + 2);
  assert.deepEqual(soldOutEvent({ route: ROUTE, deviceId: DEVICE, language: 'de' }), {
    route: DEVICE,
    route_name: 'Paris → Lyon',
    origin: 'Paris',
    destination: 'Lyon',
    summary: 'Keine MAX-Plätze mehr auf Paris → Lyon.',
  });
});

test('the outputs of the scene actions', () => {
  const none = searchOutputs({
    origin: ROUTE.origin,
    destination: ROUTE.destination,
    date: '2026-11-06',
    trains: [],
    language: 'es',
    now: NOW,
  });
  assert.deepEqual(pick(none, SEARCH_OUTPUTS), {
    found: false,
    count: 0,
    origin_name: 'Paris',
    destination_name: 'Lyon',
    date: '2026-11-06',
    first_departure: '',
    first_arrival: '',
    first_train: '',
    summary: 'Paris → Lyon, viernes, 6 de noviembre: ninguna plaza MAX.',
  });
  const read = routeOutputs({ route: ROUTE, summary, language: 'fr', now: NOW });
  assert.equal(read.found, true);
  assert.equal(read.next_date, summary.next.date);
  assert.match(read.summary, /^Paris → Lyon : \d+ train\(s\) avec places MAX sur \d+ jour\(s\)\./);
  assert.equal(trainsText([], 'fr', '2026-10-30'), '');
});
