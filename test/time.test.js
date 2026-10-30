import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parisClock,
  isDate,
  addDays,
  daysBetween,
  weekdayOf,
  minutesOf,
  parseDateInput,
} from '../src/time.js';

test('Paris time, whatever the timezone of the instance, summer and winter', () => {
  assert.deepEqual(parisClock(Date.parse('2026-10-30T08:00:00Z')), {
    date: '2026-10-30',
    minutes: 540,
  });
  assert.deepEqual(parisClock(Date.parse('2026-07-01T22:30:00Z')), {
    date: '2026-07-02',
    minutes: 30,
  });
});

test('calendar dates: checks, sums, differences and days of the week', () => {
  assert.ok(isDate('2026-11-06'));
  assert.ok(!isDate('2026-02-30'));
  assert.ok(!isDate('06/11/2026'));
  assert.equal(addDays('2026-10-30', 3), '2026-11-02');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(daysBetween('2026-10-30', '2026-11-06'), 7);
  assert.equal(weekdayOf('2026-10-30'), 'fri');
  assert.equal(weekdayOf('2026-11-01'), 'sun');
  assert.equal(weekdayOf('2026-11-02'), 'mon');
});

test('times of the dataset', () => {
  assert.equal(minutesOf('06:20'), 380);
  assert.equal(minutesOf('6:05'), 365);
  assert.equal(minutesOf('24:00'), null);
  assert.equal(minutesOf(''), null);
});

test('dates typed by users or written by scenes', () => {
  const today = '2026-10-30';
  assert.equal(parseDateInput('2026-11-06', today), '2026-11-06');
  assert.equal(parseDateInput('06/11/2026', today), '2026-11-06');
  assert.equal(parseDateInput('6/11/26', today), '2026-11-06');
  assert.equal(parseDateInput('06.11.2026', today), '2026-11-06');
  assert.equal(parseDateInput('6/11', today), '2026-11-06');
  // Without a year: the next one.
  assert.equal(parseDateInput('15/01', today), '2027-01-15');
  assert.equal(parseDateInput('30/10', today), '2026-10-30');
  for (const word of ['today', "Aujourd'hui", 'aujourd’hui', 'heute', 'hoy']) {
    assert.equal(parseDateInput(word, today), today, word);
  }
  for (const word of ['tomorrow', 'demain', 'Morgen', 'mañana']) {
    assert.equal(parseDateInput(word, today), '2026-10-31', word);
  }
  assert.equal(parseDateInput('+3', today), '2026-11-02');
  assert.equal(parseDateInput('', today), null);
  assert.equal(parseDateInput(undefined, today), null);
  assert.equal(parseDateInput('31/02', today), undefined);
  assert.equal(parseDateInput('vendredi', today), undefined);
});
