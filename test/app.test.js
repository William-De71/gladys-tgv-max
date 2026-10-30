// The whole integration against the fake Gladys of the SDK
// (`@gladysassistant/integration-sdk/testing`), which checks the discovered
// devices, the states and the scene events like the host API does, and a
// fake SNCF portal serving real (reduced) answers.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';

import { createApp, SCENE_ACTIONS, ACTIONS, STATIONS_MAX_AGE_MS } from '../src/app.js';
import { WIDGETS } from '../src/widgets.js';
import { TRIGGERS, SEARCH_OUTPUTS, ROUTE_OUTPUTS } from '../src/events.js';
import { fakeSncf, storePath, silent, setSeats, NOW } from './helpers/fixtures.js';

const PREFIX = 'ext:test-integration';
const PARIS_LYON = 'PARIS (intramuros)|LYON (intramuros)';
const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

/**
 * @description Identifiers for the routes, in order.
 * @returns {Function} `() => string`.
 */
function ids() {
  const list = ['0000000a', '0000000b', '0000000c', '0000000d'];
  let next = 0;
  return () => list[next++] ?? `${String(next++).padStart(8, '0')}`;
}

/**
 * @description The integration, connected to a fake Gladys and a fake portal.
 * @param {object} [options] - `{ config, path }`.
 * @returns {Promise<object>} `{ gladys, app, api, clock, path }`.
 */
async function startApp({ config = { language: 'fr' }, path = storePath() } = {}) {
  const clock = { now: NOW };
  const api = fakeSncf();
  const gladys = createFakeGladys({ config });
  const app = createApp(gladys, {
    fetch: api,
    storePath: path,
    now: () => clock.now,
    timers: false,
    newId: ids(),
    logger: silent,
  });
  await gladys.connect();
  await app.whenReady();
  return { gladys, app, api, clock, path };
}

const deviceOf = (id) => `${PREFIX}:route:${id}`;
const created = async (gladys, externalId) => {
  const device = gladys.fake.discoveredDevices.find((d) => d.external_id === externalId);
  assert.ok(device, `${externalId} is offered`);
  await gladys.fake.deviceCreated(device);
  return device;
};
const eventsOf = (gladys, key) => gladys.fake.sceneEvents.filter((event) => event.key === key);
const exportsOf = (api) => api.calls.filter((call) => call.path === '/exports/json');

/**
 * @description Add a route through the configuration button.
 * @param {object} gladys - The fake Gladys.
 * @param {object} fields - The form.
 * @returns {Promise<object>} The ack.
 */
const addRoute = (gladys, fields) =>
  gladys.fake.action(ACTIONS.ADD_ROUTE, { origin: 'Paris', destination: 'Lyon', ...fields });

test('starts with no route: reads the metadata and the stations, offers nothing', async () => {
  const { gladys, api } = await startApp();
  assert.deepEqual(gladys.fake.discoveredDevices, []);
  assert.deepEqual(
    api.calls.map((call) => [call.path, call.params.group_by ?? null]),
    [
      ['/records', 'origine_iata,origine'],
      ['/records', 'destination_iata,destination'],
      ['', null],
    ],
  );
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.match(gladys.fake.connectionStatus.message.fr, /Ajoutez un trajet/);
});

test('"Add a route" checks the stations, offers the device, and publishes its states once created', async () => {
  const { gladys, api } = await startApp();
  const ack = await addRoute(gladys, { days: 'mon', depart_after: 6, depart_before: 12 });
  assert.equal(ack.success, true, ack.error);
  assert.match(ack.data.message.fr, /Paris → Lyon, le lundi, 06:00–12:00/);
  assert.match(ack.data.message.en, /Mondays, 06:00–12:00/);
  const [device] = gladys.fake.discoveredDevices;
  assert.equal(device.external_id, deviceOf('0000000a'));
  assert.equal(device.name, 'TGV MAX Paris → Lyon (le lundi, 06:00–12:00)');
  assert.equal(device.should_poll, false);
  assert.equal(device.poll_frequency, undefined);
  // The check read the trains once: the reading is kept, no second request.
  assert.equal(exportsOf(api).length, 1);
  assert.equal(
    exportsOf(api)[0].params.where,
    `origine = "PARIS (intramuros)" and destination = "LYON (intramuros)" and date >= date'2026-10-30'`,
  );
  await created(gladys, device.external_id);
  const open = gladys.fake.lastState(`${device.external_id}:open_trains`);
  assert.ok(Number.isInteger(open), String(open));
  const next = gladys.fake.lastState(`${device.external_id}:next_train`);
  assert.equal(next, 'lun. 2 nov. · 06:20 → 08:22 · train 6641');
  assert.equal(exportsOf(api).length, 1);
  // The route is stored in the configuration, not in /data.
  assert.equal(gladys.fake.config.routes.length, 1);
  assert.deepEqual(gladys.fake.config.routes[0], {
    id: '0000000a',
    origin: 'PARIS (intramuros)',
    destination: 'LYON (intramuros)',
    days: 'mon',
    dates: [],
    after: 6,
    before: 12,
  });
});

test('"Add a route" refuses unknown, ambiguous or identical stations and a pair without MAX trains', async () => {
  const { gladys } = await startApp();
  const unknown = await addRoute(gladys, { origin: 'Atlantide' });
  assert.equal(unknown.success, false);
  assert.match(unknown.error, /Aucune gare MAX ne s’appelle « Atlantide »/);
  const ambiguous = await addRoute(gladys, { destination: 'Marseille' });
  assert.match(
    ambiguous.error,
    /Marseille Blancarde, Marseille St Charles|Marseille St Charles, Marseille Blancarde/,
  );
  const same = await addRoute(gladys, { destination: 'paris' });
  assert.match(same.error, /même gare/);
  const none = await addRoute(gladys, { origin: 'Nice', destination: 'Brest' });
  assert.match(none.error, /Aucun train MAX ne va de Nice Ville à Brest/);
  const hours = await addRoute(gladys, { depart_after: 20, depart_before: 8 });
  assert.match(hours.error, /Heures de 0 à 24/);
  const date = await addRoute(gladys, { dates: '31/02' });
  assert.match(date.error, /n’est pas une date/);
  assert.deepEqual(gladys.fake.discoveredDevices, []);
});

test('the return trip adds two routes, and the same route twice is refused', async () => {
  const { gladys } = await startApp();
  const ack = await addRoute(gladys, { return_trip: true, days: 'weekend' });
  assert.equal(ack.success, true, ack.error);
  assert.deepEqual(
    gladys.fake.discoveredDevices.map((device) => device.name),
    ['TGV MAX Paris → Lyon (le week-end)', 'TGV MAX Lyon → Paris (le week-end)'],
  );
  const again = await addRoute(gladys, { days: 'weekend' });
  assert.match(again.error, /déjà suivi/);
});

test('new MAX seats fire one event per route when the dataset is rebuilt, never on the first reading', async () => {
  const { gladys, app, api, clock } = await startApp();
  await addRoute(gladys, {});
  await created(gladys, deviceOf('0000000a'));
  assert.deepEqual(gladys.fake.sceneEvents, [], 'the first reading is a baseline');
  // The same data, read again: nothing new.
  await app.checkDataset();
  assert.equal(exportsOf(api).length, 1, 'same version of the data: not read again');
  // The next morning: two trains open, one of them is new for the route.
  setSeats(api, PARIS_LYON, '2026-11-02', '6643', true);
  setSeats(api, PARIS_LYON, '2026-11-03', '6603', true);
  api.state.dataset.metas.default.data_processed = '2026-10-31T05:24:00+00:00';
  clock.now += DAY;
  await app.checkDataset();
  const events = eventsOf(gladys, TRIGGERS.NEW_SEATS);
  assert.equal(events.length, 1);
  const { data } = events[0];
  assert.equal(data.route, deviceOf('0000000a'));
  assert.equal(data.route_name, 'Paris → Lyon');
  assert.equal(data.count, 2);
  assert.equal(data.first_date, '2026-11-02');
  assert.equal(data.first_date_text, 'lundi 2 novembre');
  assert.equal(data.first_departure, '07:26');
  assert.equal(data.first_train, '6643');
  assert.equal(data.days_until, 2);
  assert.match(
    data.summary,
    /^Places MAX ouvertes sur Paris → Lyon : 2 train\(s\)\.\n• lun\. 2 nov\. · 07:26 → 09:22 · train 6643/,
  );
  // Read again with the same data: nothing fires twice.
  api.state.dataset.metas.default.data_processed = '2026-10-31T09:00:00+00:00';
  await app.checkDataset();
  assert.equal(eventsOf(gladys, TRIGGERS.NEW_SEATS).length, 1);
});

test('a route whose last seats close fires "sold out", a train that left does not', async () => {
  const { gladys, app, api } = await startApp();
  await addRoute(gladys, { dates: '06/11', depart_after: 6, depart_before: 7 });
  const reading = app.getReading('0000000a');
  const open = reading.trains.filter((train) => train.date === '2026-11-06' && train.open);
  assert.ok(open.length >= 1, 'the 06:20 train has MAX seats on 6 November');
  for (const train of open) {
    setSeats(api, PARIS_LYON, '2026-11-06', train.number, false);
  }
  api.state.dataset.metas.default.data_processed = '2026-10-31T05:24:00+00:00';
  await app.checkDataset();
  const [event] = eventsOf(gladys, TRIGGERS.SOLD_OUT);
  assert.equal(event.data.route, deviceOf('0000000a'));
  assert.equal(event.data.summary, 'Plus aucune place MAX sur Paris → Lyon.');
});

test('the seen trains survive a restart: nothing fires again, what opened meanwhile does', async () => {
  const path = storePath();
  const first = await startApp({ path });
  await addRoute(first.gladys, {});
  const config = first.gladys.fake.config;
  const second = await startApp({ config, path });
  assert.deepEqual(second.gladys.fake.sceneEvents, []);
  setSeats(second.api, PARIS_LYON, '2026-11-04', '6641', true);
  second.api.state.dataset.metas.default.data_processed = '2026-10-31T05:24:00+00:00';
  await second.app.checkDataset();
  assert.equal(eventsOf(second.gladys, TRIGGERS.NEW_SEATS)[0].data.first_train, '6641');
});

test('the states follow the time: a train that left is no longer counted, without a request', async () => {
  const { gladys, app, api, clock } = await startApp();
  await addRoute(gladys, { dates: '30/10' });
  await created(gladys, deviceOf('0000000a'));
  const feature = `${deviceOf('0000000a')}:open_trains`;
  const before = gladys.fake.lastState(feature);
  const requests = api.calls.length;
  clock.now = Date.parse('2026-10-30T22:59:00Z');
  await app.tick();
  assert.equal(api.calls.length, requests);
  assert.ok(gladys.fake.lastState(feature) < before || before === 0);
  assert.equal(gladys.fake.lastState(`${deviceOf('0000000a')}:next_train`), 'Aucun');
});

test('"Edit a route" keeps the device and starts a new baseline; "Remove" forgets it', async () => {
  const { gladys } = await startApp();
  await addRoute(gladys, {});
  const edit = await gladys.fake.action(ACTIONS.EDIT_ROUTE, {
    route: '1',
    days: 'sat',
    depart_after: 8,
  });
  assert.equal(edit.success, true, edit.error);
  assert.match(edit.data.message.fr, /Paris → Lyon, le samedi, à partir de 08:00/);
  assert.equal(gladys.fake.discoveredDevices[0].external_id, deviceOf('0000000a'));
  assert.equal(gladys.fake.config.routes[0].days, 'sat');
  assert.equal(gladys.fake.config.routes[0].before, 24);
  assert.deepEqual(gladys.fake.sceneEvents, []);
  const list = await gladys.fake.action(ACTIONS.LIST_ROUTES);
  assert.match(
    list.data.message,
    /^Trajets suivis \(1\) :\n#1 Paris → Lyon, le samedi, à partir de 08:00 : \d+ train\(s\) avec places MAX$/,
  );
  const unknown = await gladys.fake.action(ACTIONS.REMOVE_ROUTE, { route: 'nantes' });
  assert.match(unknown.error, /Aucun trajet suivi ne correspond à « nantes »/);
  const removed = await gladys.fake.action(ACTIONS.REMOVE_ROUTE, { route: 'paris lyon' });
  assert.equal(removed.success, true, removed.error);
  assert.deepEqual(gladys.fake.discoveredDevices, []);
  assert.deepEqual(gladys.fake.config.routes, []);
});

test('"Find a station" and "Test the connection"', async () => {
  const { gladys } = await startApp();
  const found = await gladys.fake.action(ACTIONS.FIND_STATION, { query: 'marseille' });
  assert.match(
    found.data.message,
    /^Gares MAX correspondant à « marseille » :\n• Marseille St Charles\n• Marseille Blancarde$/,
  );
  const city = await gladys.fake.action(ACTIONS.FIND_STATION, { query: 'paris' });
  assert.match(city.data.message, /• Paris \(toutes les gares de la ville\)/);
  const none = await gladys.fake.action(ACTIONS.FIND_STATION, { query: 'zzz' });
  assert.match(none.data.message, /Aucune gare MAX/);
  const ack = await gladys.fake.action(ACTIONS.TEST_CONNECTION);
  assert.equal(ack.success, true, ack.error);
  assert.match(
    ack.data.message.fr,
    /données du 30\/10 à 06:23, 313 gares, 490563 lignes\. Quota du jour restant : \d+/,
  );
});

test('the scene actions: search a date, read a followed route', async () => {
  const { gladys } = await startApp();
  const search = await gladys.fake.sceneAction(SCENE_ACTIONS.SEARCH_SEATS, {
    origin: 'paris',
    destination: 'lyon',
    date: '06/11',
  });
  assert.equal(search.success, true, search.error);
  assert.deepEqual(Object.keys(search.data.outputs).sort(), [...SEARCH_OUTPUTS].sort());
  assert.equal(search.data.outputs.date, '2026-11-06');
  assert.equal(search.data.outputs.found, true);
  assert.equal(search.data.outputs.first_departure, '06:20');
  assert.equal(search.data.outputs.first_train, '6641');
  assert.match(
    search.data.outputs.summary,
    /^Paris → Lyon, vendredi 6 novembre : \d+ train\(s\) avec places MAX\./,
  );
  const late = await gladys.fake.sceneAction(SCENE_ACTIONS.SEARCH_SEATS, {
    origin: 'paris',
    destination: 'lyon',
    date: '+40',
  });
  assert.equal(late.success, false);
  assert.match(late.error, /dans les 30 prochains jours/);
  await addRoute(gladys, {});
  const route = await gladys.fake.sceneAction(SCENE_ACTIONS.GET_ROUTE, {
    route: deviceOf('0000000a'),
  });
  assert.deepEqual(Object.keys(route.data.outputs).sort(), [...ROUTE_OUTPUTS].sort());
  assert.equal(route.data.outputs.found, true);
  assert.ok(route.data.outputs.count > 0 && route.data.outputs.days > 0);
  assert.equal(gladys.fake.sceneEvents.length, 0, 'a scene action never fires an event');
});

test('the widgets fit the vocabulary, in every language', async () => {
  const { gladys } = await startApp();
  await addRoute(gladys, {});
  for (const language of ['fr', 'en', 'de', 'es']) {
    for (const key of [WIDGETS.TRAINS, WIDGETS.CALENDAR]) {
      const ack = await gladys.fake.widgetGet(key, {
        settings: { route: deviceOf('0000000a'), count: 4 },
        language,
      });
      assert.equal(ack.success, true, ack.error);
      assert.deepEqual(validateWidgetContent(ack.data.content), [], `${key} ${language}`);
    }
    const overview = await gladys.fake.widgetGet(WIDGETS.OVERVIEW, { settings: {}, language });
    assert.deepEqual(validateWidgetContent(overview.data.content), [], language);
  }
  // The language of the dashboard is the one of the texts afterwards.
  assert.equal(gladys.fake.config.last_language, 'es');
  const none = await gladys.fake.widgetGet(WIDGETS.TRAINS, { settings: {}, language: 'fr' });
  assert.match(none.data.content.components[0].text, /Choisissez un trajet suivi/);
});

test('a portal down or out of quota is reported, and the stations come from /data', async () => {
  const path = storePath();
  const first = await startApp({ path });
  const { gladys, api, app, clock } = await startApp({ path, config: first.gladys.fake.config });
  assert.equal(
    api.calls.filter((call) => call.params.group_by).length,
    0,
    'the stations kept in /data are fresh',
  );
  api.state.fail = 429;
  await app.checkDataset();
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.fr, /quota quotidien/);
  api.state.fail = 'network';
  await app.checkDataset();
  assert.match(gladys.fake.connectionStatus.message.en, /does not answer \(ECONNREFUSED\)/);
  const add = await addRoute(gladys, {});
  assert.match(add.error, /ne répond pas/);
  api.state.fail = null;
  await app.checkDataset();
  assert.equal(gladys.fake.connectionStatus.connected, true);
  clock.now += STATIONS_MAX_AGE_MS + MINUTE;
  await app.loadCatalog();
  assert.equal(api.calls.filter((call) => call.params.group_by).length, 2, 'read again weekly');
});

test('the manifest declares what the handlers answer', () => {
  const manifest = JSON.parse(
    readFileSync(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
  );
  assert.deepEqual(
    manifest.actions.map((action) => action.key),
    Object.values(ACTIONS),
  );
});
