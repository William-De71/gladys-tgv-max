// -----------------------------------------------------------------------------
// Dashboard widgets (core vocabulary, no HTML).
//
//   - `trains`    the next trains of a followed route with MAX seats open:
//                 three tiles (trains, within 7 days, days), the list, a
//                 button to SNCF Connect, the time of the data;
//   - `calendar`  the open trains of each day of a route over the 30 days of
//                 the dataset, in bars, and the day with the most seats;
//   - `overview`  every followed route in one card, with its open trains.
//
// The dataset is rebuilt once a day: every widget shows the time of the data
// it comes from (ODbL credit), and says to book on SNCF Connect, where the
// seats are read live.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import {
  t,
  routeName,
  routeFilter,
  dateText,
  numericDate,
  relativeDay,
  trainText,
} from './i18n.js';
import { daysBetween, parisClock } from './time.js';
import { WEEK_DAYS } from './device.js';

const WIDGETS = { TRAINS: 'trains', CALENDAR: 'calendar', OVERVIEW: 'overview' };
const LIST_COUNT = { min: 1, max: 8, default: 5 };
const OVERVIEW_MAX = 10;
const BOOKING_URL = 'https://www.sncf-connect.com/';
// The data of the day does not change before the next morning.
const TTL_SECONDS = 600;

/**
 * @description Read the number of trains a list shows.
 * @param {unknown} raw - The setting.
 * @returns {number} Within LIST_COUNT.
 */
function readCount(raw) {
  const value = Number(raw);
  if (!Number.isInteger(value)) {
    return LIST_COUNT.default;
  }
  return Math.min(LIST_COUNT.max, Math.max(LIST_COUNT.min, value));
}

/**
 * @description A widget content that only says something.
 * @param {string} text - The message.
 * @returns {object} The content.
 */
const messageContent = (text) => ({
  ttl_seconds: 60,
  components: [{ type: 'text', variant: 'body', text: text.slice(0, 300) }],
});

/**
 * @description The caption with the time of the data.
 * @param {number|null} readAt - When the dataset was rebuilt (ms).
 * @param {string} language - The language.
 * @returns {object|null} The caption component.
 */
function sourceCaption(readAt, language) {
  if (!Number.isFinite(readAt)) {
    return null;
  }
  const clock = parisClock(readAt);
  const time = `${String(Math.floor(clock.minutes / 60)).padStart(2, '0')}:${String(clock.minutes % 60).padStart(2, '0')}`;
  return {
    type: 'text',
    variant: 'caption',
    text: t('widgetSource', language, { date: numericDate(clock.date, language), time }).slice(
      0,
      80,
    ),
  };
}

/**
 * @description The tiles of a route.
 * @param {object} summary - summarize().
 * @param {string} language - The language.
 * @param {number} now - Now, in ms.
 * @returns {object[]} Three value tiles.
 */
function tiles(summary, language, now) {
  const today = parisClock(now).date;
  const week = summary.open.filter((train) => daysBetween(today, train.date) < WEEK_DAYS).length;
  const color = (value) => (value > 0 ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.NEUTRAL);
  return [
    {
      type: 'value',
      value: summary.count,
      label: t('widgetOpenTrains', language),
      icon: 'check-circle',
      color: color(summary.count),
    },
    {
      type: 'value',
      value: week,
      label: t('widgetWeek', language),
      icon: 'clock',
      color: color(week),
    },
    {
      type: 'value',
      value: summary.days,
      label: t('widgetOpenDays', language),
      icon: 'calendar',
      color: color(summary.days),
    },
  ];
}

/**
 * @description The `trains` widget.
 * @param {object} options - `{ route, summary, readAt, count, language, now }`.
 * @returns {object} The content.
 */
function buildTrainsWidget({ route, summary, readAt, count, language, now }) {
  const today = parisClock(now).date;
  const components = [
    { type: 'text', variant: 'heading', text: routeName(route).slice(0, 40) },
    ...tiles(summary, language, now),
  ];
  if (summary.open.length) {
    components.push({
      type: 'card-list',
      display: 'list',
      items: summary.open.slice(0, readCount(count)).map((train) => {
        const soon = daysBetween(today, train.date) < WEEK_DAYS;
        return {
          title: trainText(train, language, { date: true }).slice(0, 60),
          subtitle: `${train.from} → ${train.to}`,
          badge: {
            text: relativeDay(train.date, today, language).slice(0, 16),
            color: soon ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.INFO,
          },
        };
      }),
    });
  } else {
    components.push({ type: 'text', variant: 'body', text: t('widgetNoSeats', language) });
  }
  const caption = sourceCaption(readAt, language);
  if (caption && summary.open.length) {
    components.push(caption);
  }
  components.push({
    type: 'button',
    label: 'SNCF Connect',
    icon: 'external-link',
    style: 'primary',
    link: { url: BOOKING_URL },
  });
  return { ttl_seconds: TTL_SECONDS, components };
}

/**
 * @description The `calendar` widget.
 * @param {object} options - `{ route, summary, days, readAt, language, now }`:
 * `days` from perDay().
 * @returns {object} The content.
 */
function buildCalendarWidget({ route, summary, days, readAt, language, now }) {
  const components = [
    { type: 'text', variant: 'heading', text: routeName(route).slice(0, 40) },
    ...tiles(summary, language, now),
    {
      type: 'chart',
      chart_type: 'bar',
      title: t('widgetChartTitle', language),
      series: [
        {
          name: t('widgetChartSeries', language),
          points: days.map((day) => ({ t: day.date, v: day.open })),
        },
      ],
    },
  ];
  const best = [...days].sort((a, b) => b.open - a.open || a.date.localeCompare(b.date))[0];
  const items = [];
  if (best?.open > 0) {
    items.push({
      label: t('widgetBestDay', language),
      value: `${dateText(best.date, language, { short: true })} · ${best.open}`.slice(0, 40),
      icon: 'star',
      color: WIDGET_COLORS.SUCCESS,
    });
  }
  if (summary.next) {
    items.push({
      label: t('widgetNextTrain', language),
      value:
        `${dateText(summary.next.date, language, { short: true })} · ${summary.next.departure}`.slice(
          0,
          40,
        ),
      icon: 'navigation',
      color: WIDGET_COLORS.PRIMARY,
    });
  }
  if (items.length) {
    components.push({ type: 'status', items });
  }
  // Two texts at most: without seats, the message replaces the time of the data.
  const caption = sourceCaption(readAt, language);
  if (!summary.open.length) {
    components.splice(1, 0, { type: 'text', variant: 'body', text: t('widgetNoSeats', language) });
  } else if (caption) {
    components.push(caption);
  }
  return { ttl_seconds: TTL_SECONDS, components };
}

/**
 * @description The `overview` widget.
 * @param {object} options - `{ rows, readAt, language }`: `rows` are `{
 * route, summary }`, `summary` null for a route not read yet.
 * @returns {object} The content.
 */
function buildOverviewWidget({ rows, readAt, language }) {
  if (!rows.length) {
    return messageContent(t('widgetNoRoutes', language));
  }
  // The days and hours only tell apart two routes between the same stations:
  // the status rows are narrow.
  const shown = rows.slice(0, OVERVIEW_MAX);
  const twice = (route) =>
    shown.filter((row) => routeName(row.route) === routeName(route)).length > 1;
  const items = shown.map(({ route, summary }) => {
    const filter = twice(route) ? routeFilter(route, language) : '';
    const label = `${routeName(route)}${filter ? ` · ${filter}` : ''}`;
    if (!summary) {
      return {
        label: label.slice(0, 40),
        value: '…',
        color: WIDGET_COLORS.NEUTRAL,
      };
    }
    return {
      label: label.slice(0, 40),
      value: summary.count || t('widgetSoldOut', language),
      icon: summary.count ? 'check-circle' : 'x-circle',
      color: summary.count ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.NEUTRAL,
    };
  });
  const components = [{ type: 'status', items }];
  const caption = sourceCaption(readAt, language);
  if (caption) {
    components.push(caption);
  }
  components.push({
    type: 'button',
    label: 'SNCF Connect',
    icon: 'external-link',
    style: 'primary',
    link: { url: BOOKING_URL },
  });
  return { ttl_seconds: TTL_SECONDS, components };
}

export {
  WIDGETS,
  LIST_COUNT,
  OVERVIEW_MAX,
  BOOKING_URL,
  TTL_SECONDS,
  readCount,
  messageContent,
  sourceCaption,
  buildTrainsWidget,
  buildCalendarWidget,
  buildOverviewWidget,
};
