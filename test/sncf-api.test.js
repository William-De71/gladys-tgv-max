import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createSncfClient, quote, SncfError, USER_AGENT } from '../src/sncf-api.js';
import { fakeSncf, NOW } from './helpers/fixtures.js';

test('the metadata, the stations and the trains of a route, filtered on the portal', async () => {
  const api = fakeSncf();
  const client = createSncfClient({
    fetch: api,
    now: () => NOW,
    baseUrl: 'https://portal.test/datasets',
  });
  const meta = await client.dataset();
  assert.deepEqual(meta, {
    processedAt: Date.parse('2026-10-30T05:23:06+00:00'),
    modifiedAt: Date.parse('2026-10-30T05:23:06+00:00'),
    records: 490563,
  });
  const stations = await client.stations();
  assert.equal(stations.length, 638);
  const trains = await client.trains(
    'PARIS (intramuros)',
    'LYON (intramuros)',
    '2026-11-06',
    '2026-11-06',
  );
  assert.ok(trains.length > 20 && trains.every((record) => record.date === '2026-11-06'));
  assert.deepEqual(Object.keys(trains[0]).sort(), [
    'axe',
    'date',
    'destination_iata',
    'heure_arrivee',
    'heure_depart',
    'od_happy_card',
    'origine_iata',
    'train_no',
  ]);
  const last = api.calls.at(-1);
  assert.equal(
    last.params.where,
    `origine = "PARIS (intramuros)" and destination = "LYON (intramuros)" and date >= date'2026-11-06' and date <= date'2026-11-06'`,
  );
  assert.equal(client.requests.total, 4);
  assert.equal(client.quota.limit, 10000);
  assert.match(USER_AGENT, /^gladys-tgv-max\/\d+\.\d+\.\d+ /);
});

test('errors: quota, unreachable, invalid answers', async () => {
  const api = fakeSncf();
  const client = createSncfClient({ fetch: api });
  api.state.fail = 429;
  await assert.rejects(client.dataset(), (err) => err instanceof SncfError && err.kind === 'quota');
  api.state.fail = 'network';
  await assert.rejects(
    client.dataset(),
    (err) => err.kind === 'unreachable' && err.message === 'ECONNREFUSED',
  );
  api.state.fail = 503;
  await assert.rejects(client.dataset(), (err) => err.kind === 'unreachable' && err.status === 503);
  api.state.fail = null;
  api.state.dataset = { metas: null };
  await assert.rejects(client.dataset(), (err) => err.kind === 'invalid');
  assert.equal(quote('a "b" \\ c'), '"a \\"b\\" \\\\ c"');
});
