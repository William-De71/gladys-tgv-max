// The discovered devices against the rules of Gladys the fake Gladys does not
// check: poll settings, min / max / read_only / has_feedback everywhere,
// category / type pairs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_POLL_FREQUENCIES,
} from '@gladysassistant/integration-sdk';

import {
  buildRouteDevice,
  buildRouteStates,
  deviceName,
  routeIdOf,
  FEATURE_KEYS,
} from '../src/device.js';
import { parseTrains, upcomingTrains, summarize } from '../src/trains.js';
import { LANGUAGES } from '../src/i18n.js';
import { fakeGladys, ROUTES, NOW } from './helpers/fixtures.js';

const ROUTE = {
  id: '3f9a12c4',
  origin: 'PARIS (intramuros)',
  destination: 'LYON (intramuros)',
  days: 'all',
  dates: [],
  after: 0,
  before: 24,
};

test('every feature declares what Gladys requires, with a known category / type pair', () => {
  for (const language of LANGUAGES) {
    const device = buildRouteDevice(fakeGladys, ROUTE, language);
    assert.equal(device.should_poll, false);
    assert.equal(device.poll_frequency, undefined);
    assert.ok(!Object.values(DEVICE_POLL_FREQUENCIES).includes(device.poll_frequency));
    assert.equal(device.external_id, 'ext:tgv-max:route:3f9a12c4');
    assert.deepEqual(
      device.features.map((feature) => feature.external_id.split(':').at(-1)),
      Object.values(FEATURE_KEYS),
    );
    for (const feature of device.features) {
      for (const key of ['min', 'max', 'read_only', 'has_feedback']) {
        assert.notEqual(feature[key], undefined, `${feature.external_id}.${key}`);
      }
      assert.equal(feature.read_only, true);
      assert.ok(Object.values(DEVICE_FEATURE_CATEGORIES).includes(feature.category));
      const types = Object.values(DEVICE_FEATURE_TYPES).flatMap((group) => Object.values(group));
      assert.ok(types.includes(feature.type), feature.type);
      assert.ok(feature.name.length > 0 && feature.name.length <= 40, feature.name);
    }
  }
});

test('names tell the routes apart', () => {
  assert.equal(deviceName(ROUTE, 'fr'), 'TGV MAX Paris → Lyon');
  assert.equal(
    deviceName({ ...ROUTE, days: 'fri', after: 17, before: 21 }, 'en'),
    'TGV MAX Paris → Lyon (Fridays, 17:00–21:00)',
  );
  assert.equal(
    deviceName({ ...ROUTE, dates: ['2026-11-06', '2026-11-08'], before: 10 }, 'de'),
    'TGV MAX Paris → Lyon (06.11., 08.11., vor 10:00)',
  );
  assert.equal(routeIdOf('ext:tgv-max:route:3f9a12c4:open_trains'), '3f9a12c4');
  assert.equal(routeIdOf('ext:tgv-max:stop:1'), null);
  assert.equal(routeIdOf(undefined), null);
});

test('the states of a route', () => {
  const trains = parseTrains(ROUTES['PARIS (intramuros)|LYON (intramuros)'], ROUTE);
  const summary = summarize(upcomingTrains(trains, ROUTE, NOW), NOW);
  const states = buildRouteStates(fakeGladys, ROUTE, summary, { language: 'fr', now: NOW });
  const byKey = Object.fromEntries(
    states.map((state) => [state.device_feature_external_id.split(':').at(-1), state]),
  );
  assert.equal(byKey.open_trains.state, summary.count);
  assert.equal(byKey.open_days.state, summary.days);
  assert.ok(byKey.open_week.state <= summary.count && byKey.open_week.state > 0);
  assert.match(byKey.next_train.text, /^sam\. 31 oct\. · \d\d:\d\d → \d\d:\d\d · train \d+$/);
  const none = buildRouteStates(fakeGladys, ROUTE, summarize([], NOW), {
    language: 'en',
    now: NOW,
  });
  assert.equal(none.at(-1).text, 'None');
  assert.equal(none[0].state, 0);
});
