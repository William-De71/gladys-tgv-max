import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';

import {
  buildTrainsWidget,
  buildCalendarWidget,
  buildOverviewWidget,
  readCount,
  messageContent,
  BOOKING_URL,
} from '../src/widgets.js';
import { parseTrains, upcomingTrains, summarize, perDay } from '../src/trains.js';
import { LANGUAGES } from '../src/i18n.js';
import { ROUTES, NOW, DATASET } from './helpers/fixtures.js';

const ROUTE = {
  id: '0000000a',
  origin: 'PARIS (intramuros)',
  destination: 'LYON (intramuros)',
  days: 'all',
  dates: [],
  after: 0,
  before: 24,
};
const READ_AT = Date.parse(DATASET.metas.default.data_processed);
const upcoming = upcomingTrains(
  parseTrains(ROUTES['PARIS (intramuros)|LYON (intramuros)'], ROUTE),
  ROUTE,
  NOW,
);
const summary = summarize(upcoming, NOW);
const empty = summarize([], NOW);
const types = (content) => content.components.map((component) => component.type);

test('every widget fits the vocabulary and the budget, in every language', () => {
  for (const language of LANGUAGES) {
    const contents = [
      buildTrainsWidget({ route: ROUTE, summary, readAt: READ_AT, count: 8, language, now: NOW }),
      buildTrainsWidget({ route: ROUTE, summary: empty, readAt: READ_AT, language, now: NOW }),
      buildCalendarWidget({
        route: ROUTE,
        summary,
        days: perDay(upcoming, NOW, ROUTE),
        readAt: READ_AT,
        language,
        now: NOW,
      }),
      buildCalendarWidget({
        route: ROUTE,
        summary: empty,
        days: perDay([], NOW, ROUTE),
        readAt: READ_AT,
        language,
        now: NOW,
      }),
      buildOverviewWidget({
        rows: [
          { route: ROUTE, summary },
          { route: { ...ROUTE, id: '0000000b', days: 'fri', after: 17 }, summary: empty },
          { route: { ...ROUTE, id: '0000000c' }, summary: null },
        ],
        readAt: READ_AT,
        language,
      }),
      buildOverviewWidget({ rows: [], readAt: READ_AT, language }),
      messageContent('x'.repeat(400)),
    ];
    for (const content of contents) {
      assert.deepEqual(validateWidgetContent(content), [], `${language}: ${types(content)}`);
    }
  }
});

test('the trains widget: route, three tiles, the next trains, the time of the data, the booking link', () => {
  const content = buildTrainsWidget({
    route: ROUTE,
    summary,
    readAt: READ_AT,
    count: 3,
    language: 'fr',
    now: NOW,
  });
  assert.deepEqual(types(content), [
    'text',
    'value',
    'value',
    'value',
    'card-list',
    'text',
    'button',
  ]);
  assert.equal(content.components[0].text, 'Paris → Lyon');
  assert.equal(content.components[1].value, summary.count);
  const list = content.components[4];
  assert.equal(list.items.length, 3);
  assert.match(list.items[0].title, /^sam\. 31 oct\. · \d\d:\d\d → \d\d:\d\d · train \d+$/);
  assert.match(list.items[0].subtitle, /^Paris Gare de Lyon → Lyon (Part-Dieu|Perrache)$/);
  assert.deepEqual(list.items[0].badge, { text: 'demain', color: 'success' });
  assert.equal(content.components[5].text, 'Données SNCF du 30/10 à 06:23');
  assert.equal(content.components[6].link.url, BOOKING_URL);
  const none = buildTrainsWidget({
    route: ROUTE,
    summary: empty,
    readAt: READ_AT,
    language: 'en',
    now: NOW,
  });
  assert.equal(none.components[4].text, 'No MAX seats on these days and hours for now.');
});

test('the calendar widget: one bar per day of the route, the best day', () => {
  const content = buildCalendarWidget({
    route: { ...ROUTE, days: 'fri' },
    summary,
    days: perDay(upcoming, NOW, { ...ROUTE, days: 'fri' }),
    readAt: READ_AT,
    language: 'en',
    now: NOW,
  });
  const chart = content.components.find((component) => component.type === 'chart');
  assert.equal(chart.chart_type, 'bar');
  assert.deepEqual(
    chart.series[0].points.map((point) => point.t),
    ['2026-10-30', '2026-11-06', '2026-11-13', '2026-11-20', '2026-11-27'],
  );
  const status = content.components.find((component) => component.type === 'status');
  assert.equal(status.items[0].label, 'Most seats');
});

test('the overview: one line per route, sold out in grey, not read yet', () => {
  const content = buildOverviewWidget({
    rows: [
      { route: ROUTE, summary },
      { route: { ...ROUTE, days: 'fri', after: 17 }, summary: empty },
      { route: ROUTE, summary: null },
    ],
    readAt: READ_AT,
    language: 'en',
  });
  const [status] = content.components;
  assert.deepEqual(
    status.items.map((item) => [item.label, item.color]),
    [
      ['Paris → Lyon', 'success'],
      ['Paris → Lyon · Fridays, from 17:00', 'neutral'],
      ['Paris → Lyon', 'neutral'],
    ],
  );
  assert.equal(status.items[1].value, 'None');
  assert.equal(status.items[2].value, '…');
});

test('the number of trains of a list', () => {
  assert.equal(readCount('3'), 3);
  assert.equal(readCount(99), 8);
  assert.equal(readCount(0), 1);
  assert.equal(readCount(undefined), 5);
});
