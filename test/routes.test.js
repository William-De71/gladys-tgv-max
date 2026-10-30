import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createRegistry,
  parseRoutes,
  readHours,
  readDays,
  readDates,
  RegistryError,
  MAX_ROUTES,
} from '../src/routes.js';
import { silent } from './helpers/fixtures.js';

const TODAY = '2026-10-30';
const PARIS = 'PARIS (intramuros)';
const LYON = 'LYON (intramuros)';
const BASE = { origin: PARIS, destination: LYON, days: 'all', dates: [], after: 0, before: 24 };

/**
 * @description A registry on a Gladys that records what it saves.
 * @returns {{ registry: object, saved: object[] }} The registry and the saves.
 */
function setup() {
  const saved = [];
  let next = 0;
  const gladys = {
    setConfig: async (values) => {
      saved.push(values);
    },
  };
  const registry = createRegistry(gladys, {
    logger: silent,
    newId: () => (next++).toString(16).padStart(8, '0'),
  });
  return { registry, saved };
}

const rejects = (fn, key) =>
  assert.throws(fn, (err) => err instanceof RegistryError && err.key === key, key);

test('hours, days and dates of the forms', () => {
  assert.deepEqual(readHours(17, 21), { after: 17, before: 21 });
  assert.deepEqual(readHours('', ''), { after: 0, before: 24 });
  assert.deepEqual(readHours('18h', null, { after: 6, before: 22 }), { after: 18, before: 22 });
  rejects(() => readHours(21, 17), 'errorHours');
  rejects(() => readHours(24, null), 'errorHours');
  rejects(() => readHours(7.5, null), 'errorHours');
  assert.equal(readDays('fri'), 'fri');
  assert.equal(readDays('keep', 'sat'), 'sat');
  assert.equal(readDays(''), 'all');
  rejects(() => readDays('someday'), 'errorDays');
  assert.deepEqual(readDates('08/11, 06/11; 2026-11-06 +1', TODAY), [
    '2026-10-31',
    '2026-11-06',
    '2026-11-08',
  ]);
  assert.equal(readDates('', TODAY), null);
  assert.deepEqual(readDates('-', TODAY), []);
  rejects(() => readDates('2026-10-01', TODAY), 'errorDatePast');
  rejects(() => readDates('32/10', TODAY), 'errorDate');
  rejects(
    () => readDates('1/11 2/11 3/11 4/11 5/11 6/11 7/11 8/11 9/11 10/11 11/11', TODAY),
    'errorTooManyDates',
  );
});

test('the stored routes: invalid entries and duplicates are dropped', () => {
  const routes = parseRoutes(
    [
      { ...BASE, id: '0000000a' },
      { ...BASE, id: '0000000a', days: 'fri' },
      { ...BASE, id: 'nope' },
      { ...BASE, id: '0000000b', after: 22, before: 6 },
      { ...BASE, id: '0000000c', days: 'someday' },
      { ...BASE, id: '0000000d', dates: ['2026-02-30'] },
      null,
    ],
    silent,
  );
  assert.deepEqual(routes, [{ ...BASE, id: '0000000a' }]);
  assert.deepEqual(parseRoutes(JSON.stringify([{ ...BASE, id: '0000000a' }])).length, 1);
  assert.deepEqual(parseRoutes('not json', silent), []);
  assert.deepEqual(parseRoutes(undefined), []);
});

test('add, find, update and remove, each change saved before it applies', async () => {
  const { registry, saved } = setup();
  const paris = await registry.add(BASE);
  assert.equal(paris.id, '00000000');
  const back = await registry.add({ ...BASE, origin: LYON, destination: PARIS, days: 'sun' });
  assert.equal(saved.length, 2);
  assert.deepEqual(
    saved[1].routes.map((route) => route.id),
    ['00000000', '00000001'],
  );
  await assert.rejects(registry.add(BASE), (err) => err.key === 'errorRouteExists');
  assert.equal(registry.find('#2'), back);
  assert.equal(registry.find('1'), paris);
  assert.equal(registry.find('00000001'), back);
  assert.equal(registry.find('lyon → paris'), back);
  rejects(() => registry.find('paris'), 'errorRouteAmbiguous');
  rejects(() => registry.find('nantes'), 'errorRouteUnknown');
  rejects(() => registry.find('#9'), 'errorRouteUnknown');
  rejects(() => registry.find(''), 'errorRouteMissing');
  const changed = await registry.update(back.id, { days: 'fri_sun', after: 15 });
  assert.equal(changed.id, back.id);
  assert.equal(registry.byId(back.id).days, 'fri_sun');
  await registry.remove(paris.id);
  assert.deepEqual(
    registry.list().map((route) => route.id),
    [back.id],
  );
  await assert.rejects(registry.remove(paris.id), (err) => err.key === 'errorRouteUnknown');
});

test('two quick changes never lose a route; a refused save changes nothing', async () => {
  const { registry } = setup();
  await Promise.all([registry.add(BASE), registry.add({ ...BASE, days: 'fri' })]);
  assert.equal(registry.list().length, 2);
  const failing = createRegistry(
    {
      setConfig: async () => {
        throw new Error('down');
      },
    },
    { logger: silent },
  );
  await assert.rejects(failing.add(BASE), /down/);
  assert.deepEqual(failing.list(), []);
});

test(`${MAX_ROUTES} routes at most`, async () => {
  const { registry } = setup();
  for (let hour = 0; hour < MAX_ROUTES; hour += 1) {
    await registry.add({ ...BASE, after: hour, before: 24 });
  }
  await assert.rejects(
    registry.add({ ...BASE, days: 'fri' }),
    (err) => err.key === 'errorTooManyRoutes',
  );
});
