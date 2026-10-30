// The manifest against the code: the keys it declares are the ones the code
// handles, the store limits hold, the transport and permissions are right.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';

import { TRIGGERS, SEARCH_OUTPUTS, ROUTE_OUTPUTS } from '../src/events.js';
import { SCENE_ACTIONS, ACTIONS } from '../src/app.js';
import { WIDGETS, LIST_COUNT } from '../src/widgets.js';
import { AUTO_LANGUAGE, INTERNAL_KEYS } from '../src/config.js';
import { DAY_KEYS } from '../src/trains.js';
import { KEEP } from '../src/routes.js';
import { LANGUAGES } from '../src/i18n.js';

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const manifest = read('../gladys-assistant-integration.json');
const pkg = read('../package.json');
const byKey = (list) => new Map(list.map((entry) => [entry.key, entry]));
const values = (field) => field.options.map((option) => option.value);
const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('a device integration, in lockstep with package.json, at 0.x until 1.0.0 is decided', () => {
  assert.equal(manifest.type, 'device');
  assert.equal(manifest.name, 'TGV MAX');
  assert.equal(manifest.version, pkg.version);
  assert.equal(manifest.docker_image, `ghcr.io/william-de71/gladys-tgv-max:${pkg.version}`);
  assert.equal(
    manifest.cover_image,
    'https://raw.githubusercontent.com/William-De71/gladys-tgv-max/main/cover.jpg',
  );
  assert.equal(pkg.license, 'Apache-2.0');
  assert.equal(pkg.name, 'gladys-tgv-max');
  assert.deepEqual(Object.keys(pkg.dependencies), ['@gladysassistant/integration-sdk']);
});

test('declares the cloud transport only: the SNCF open data portal', () => {
  assert.deepEqual(manifest.transports, ['cloud']);
  assert.doesNotMatch(source('../src/app.js'), /publishTransports|GLADYS_PREFER_LOCAL/);
  assert.match(source('../src/sncf-api.js'), /https:\/\/ressources\.data\.sncf\.com\//);
});

test('requires the Gladys of widgets and scenes; no permission', () => {
  assert.equal(manifest.gladys_version, '>=5.3.0');
  assert.deepEqual(manifest.categories, ['transport']);
  for (const key of ['location', 'network_wake', 'containers', 'network_discovery', 'webhooks']) {
    assert.equal(manifest[key], undefined, key);
  }
});

test('declares exactly the scene triggers, actions and widgets the code handles', () => {
  assert.deepEqual(
    manifest.scene_triggers.map((trigger) => trigger.key).sort(),
    Object.values(TRIGGERS).sort(),
  );
  assert.deepEqual(
    manifest.scene_actions.map((action) => action.key).sort(),
    Object.values(SCENE_ACTIONS).sort(),
  );
  assert.deepEqual(
    manifest.widgets.map((widget) => widget.key).sort(),
    Object.values(WIDGETS).sort(),
  );
  const app = source('../src/app.js');
  for (const key of Object.keys(WIDGETS)) {
    assert.match(app, new RegExp(`onWidgetGet\\(WIDGETS\\.${key}`), key);
  }
  for (const key of Object.keys(SCENE_ACTIONS)) {
    assert.match(app, new RegExp(`onSceneAction\\(SCENE_ACTIONS\\.${key}`), key);
  }
  assert.deepEqual(
    manifest.actions.map((action) => action.key),
    Object.values(ACTIONS),
  );
  for (const key of Object.keys(ACTIONS)) {
    assert.match(app, new RegExp(`onAction\\(ACTIONS\\.${key}`), key);
  }
  const actions = byKey(manifest.scene_actions);
  assert.deepEqual(
    actions.get(SCENE_ACTIONS.SEARCH_SEATS).outputs.map((output) => output.key),
    SEARCH_OUTPUTS,
  );
  assert.deepEqual(
    actions.get(SCENE_ACTIONS.GET_ROUTE).outputs.map((output) => output.key),
    ROUTE_OUTPUTS,
  );
});

test('the configuration: no key, no secret, the routes kept outside the form', () => {
  assert.deepEqual(
    manifest.config_schema.map((field) => field.key),
    ['intro', 'language'],
  );
  assert.ok(manifest.config_schema.every((field) => field.type !== 'secret'));
  for (const key of Object.values(INTERNAL_KEYS)) {
    assert.equal(byKey(manifest.config_schema).get(key), undefined, `${key}: internal key`);
  }
  for (const field of manifest.config_schema) {
    assert.ok(!['text', 'password', 'number'].includes(field.type), `${field.key}: ${field.type}`);
    assert.equal(field.display_if, undefined, field.key);
  }
});

test('the forms offer the days and hours the code reads', () => {
  const actions = byKey(manifest.actions);
  const add = byKey(actions.get(ACTIONS.ADD_ROUTE).fields);
  assert.deepEqual(values(add.get('days')), DAY_KEYS);
  assert.equal(add.get('days').default, 'all');
  assert.deepEqual([add.get('depart_after').min, add.get('depart_after').max], [0, 23]);
  assert.deepEqual([add.get('depart_before').min, add.get('depart_before').max], [1, 24]);
  assert.equal(add.get('return_trip').type, 'boolean');
  const edit = byKey(actions.get(ACTIONS.EDIT_ROUTE).fields);
  assert.deepEqual(values(edit.get('days')), [KEEP, ...DAY_KEYS]);
  assert.equal(edit.get('days').default, KEEP);
  // Empty hours keep the current ones: no default in the edit form.
  assert.equal(edit.get('depart_after').default, undefined);
  assert.equal(edit.get('depart_before').default, undefined);
  for (const trigger of manifest.scene_triggers) {
    const route = byKey(trigger.fields).get('route');
    assert.equal(route.source, 'devices', trigger.key);
  }
  const count = byKey(byKey(manifest.widgets).get(WIDGETS.TRAINS).settings).get('count');
  assert.deepEqual(
    [count.min, count.max, count.default],
    [LIST_COUNT.min, LIST_COUNT.max, LIST_COUNT.default],
  );
});

test('limits of the store: counts, timeouts, sizes, no secret in widget settings', () => {
  assert.ok(manifest.widgets.length >= 1 && manifest.widgets.length <= 5);
  assert.ok(manifest.scene_triggers.length <= 20);
  assert.ok(manifest.scene_actions.length <= 20);
  for (const trigger of manifest.scene_triggers) {
    assert.ok((trigger.fields ?? []).length <= 10 && trigger.variables.length <= 20, trigger.key);
    assert.ok(trigger.key.length <= 40);
  }
  for (const action of [...manifest.scene_actions, ...manifest.actions]) {
    assert.ok(action.timeout_seconds >= 5 && action.timeout_seconds <= 120, action.key);
    assert.ok(
      (action.fields ?? []).length <= 10 && (action.outputs ?? []).length <= 20,
      action.key,
    );
  }
  for (const widget of manifest.widgets) {
    assert.ok((widget.settings ?? []).length <= 10);
    for (const setting of widget.settings ?? []) {
      assert.ok(!['secret', 'oauth2', 'account_link'].includes(setting.type));
    }
  }
  const size = statSync(new URL('../gladys-assistant-integration.json', import.meta.url)).size;
  assert.ok(size < 100 * 1024, `${size} bytes`);
  const cover = readFileSync(new URL('../cover.jpg', import.meta.url));
  assert.ok(cover.length < 150 * 1024, `cover.jpg: ${cover.length} bytes`);
  assert.equal(cover.readUInt16BE(0), 0xffd8, 'cover.jpg is a JPEG');
});

test('offers the languages of the code, automatic by default', () => {
  const field = byKey(manifest.config_schema).get('language');
  assert.deepEqual(values(field), [AUTO_LANGUAGE, ...LANGUAGES]);
  assert.equal(field.default, AUTO_LANGUAGE);
});

test('catalog keywords and countries of Gladys 5.3.0', () => {
  const keywords = manifest.keywords.map((keyword) => keyword.trim().toLowerCase());
  assert.ok(keywords.length >= 1 && keywords.length <= 10, 'one to ten keywords');
  keywords.forEach((keyword) => assert.ok(keyword.length >= 2 && keyword.length <= 30, keyword));
  assert.equal(new Set(keywords).size, keywords.length, 'unique once trimmed and lowercased');
  // MAX is sold in France: hidden from the browse views of the catalog elsewhere.
  assert.deepEqual(manifest.countries, ['FR']);
});
