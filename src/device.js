// -----------------------------------------------------------------------------
// The devices of the integration, offered on the Discovery screen.
//
// "TGV MAX Paris → Lyon (Friday, 17:00–21:00)": one per followed route.
// Read-only features:
//   - `open_trains`  counter: the trains of the route with MAX seats open,
//                    over the 30 days of the dataset;
//   - `open_week`    counter: the same, within the next 7 days;
//   - `open_days`    counter: the dates with one open train at least;
//   - `next_train`   text: the first open train, "Fri 6 Nov · 06:20 → 08:22
//                    · TGV 6641", "None" when there is none.
//
// External ids: the random identifier the route got at creation
// (`ext:tgv-max:route:3f9a12c4`), never a station name. `should_poll`
// stays false: the integration reads on its own timer, once the dataset is
// rebuilt each morning.
// -----------------------------------------------------------------------------

import { DEVICE_FEATURE_CATEGORIES, DEVICE_FEATURE_TYPES } from '@gladysassistant/integration-sdk';
import { t, routeName, routeFilter, trainText } from './i18n.js';
import { daysBetween, parisClock } from './time.js';

const DEVICE_TYPE = 'route';
const FEATURE_KEYS = {
  OPEN_TRAINS: 'open_trains',
  OPEN_WEEK: 'open_week',
  OPEN_DAYS: 'open_days',
  NEXT_TRAIN: 'next_train',
};
// About 40 trains a day on the busiest routes, over 31 days.
const MAX_TRAINS = 2000;
const MAX_DAYS = 31;
const WEEK_DAYS = 7;
const TEXT_MAX = 250;

/**
 * @description The external ids of a route.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {string} id - The identifier of the route.
 * @returns {{ device: string, feature: Function }} The ids.
 */
const idsOf = (gladys, id) => gladys.externalIds(DEVICE_TYPE, id);

/**
 * @description The route a device external id stands for.
 * @param {unknown} externalId - A device (or feature) external id.
 * @returns {string|null} The identifier of the route.
 * @example
 * routeIdOf('ext:tgv-max:route:3f9a12c4'); // -> '3f9a12c4'
 */
function routeIdOf(externalId) {
  const match = /:route:([0-9a-f]{8})(?::[a-z_]+)?$/.exec(String(externalId ?? ''));
  return match ? match[1] : null;
}

/**
 * @description A read-only counter.
 * @param {object} feature - Its name, external id and max.
 * @returns {object} The feature.
 */
const counter = (feature) => ({
  category: DEVICE_FEATURE_CATEGORIES.COUNTER_SENSOR,
  type: DEVICE_FEATURE_TYPES.SENSOR.INTEGER,
  read_only: true,
  has_feedback: false,
  keep_history: true,
  min: 0,
  ...feature,
});

/**
 * @description The name of the device of a route.
 * @param {object} route - The route.
 * @param {string} language - The language.
 * @returns {string} "TGV MAX Paris → Lyon (Friday, 17:00–21:00)".
 */
function deviceName(route, language) {
  const filter = routeFilter(route, language);
  return t(filter ? 'deviceNameFiltered' : 'deviceName', language, {
    route: routeName(route),
    filter,
  });
}

/**
 * @description Build the device of a route.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {object} route - The route.
 * @param {string} [language] - Language of the names.
 * @returns {object} The discovered device.
 */
function buildRouteDevice(gladys, route, language = 'fr') {
  const ids = idsOf(gladys, route.id);
  return {
    name: deviceName(route, language).slice(0, 190),
    external_id: ids.device,
    model: 'MAX JEUNE / MAX SENIOR',
    should_poll: false,
    params: [
      { name: 'TGV_MAX_ORIGIN', value: route.origin },
      { name: 'TGV_MAX_DESTINATION', value: route.destination },
    ],
    features: [
      counter({
        name: t('featureOpenTrains', language),
        external_id: ids.feature(FEATURE_KEYS.OPEN_TRAINS),
        max: MAX_TRAINS,
      }),
      counter({
        name: t('featureOpenWeek', language),
        external_id: ids.feature(FEATURE_KEYS.OPEN_WEEK),
        max: MAX_TRAINS,
      }),
      counter({
        name: t('featureOpenDays', language),
        external_id: ids.feature(FEATURE_KEYS.OPEN_DAYS),
        max: MAX_DAYS,
      }),
      {
        name: t('featureNextTrain', language),
        external_id: ids.feature(FEATURE_KEYS.NEXT_TRAIN),
        category: DEVICE_FEATURE_CATEGORIES.TEXT,
        type: DEVICE_FEATURE_TYPES.TEXT.TEXT,
        read_only: true,
        has_feedback: false,
        keep_history: false,
        min: 0,
        max: 0,
      },
    ],
  };
}

/**
 * @description The states of a route.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {object} route - The route.
 * @param {object} summary - summarize() of its upcoming trains.
 * @param {object} options - `{ language, now }`.
 * @returns {object[]} `[{ device_feature_external_id, state }]`.
 */
function buildRouteStates(gladys, route, summary, { language, now }) {
  const ids = idsOf(gladys, route.id);
  const today = parisClock(now).date;
  const week = summary.open.filter((train) => daysBetween(today, train.date) < WEEK_DAYS).length;
  const next = summary.next
    ? trainText(summary.next, language, { today })
    : t('noOpenTrain', language);
  return [
    {
      device_feature_external_id: ids.feature(FEATURE_KEYS.OPEN_TRAINS),
      state: Math.min(summary.count, MAX_TRAINS),
    },
    {
      device_feature_external_id: ids.feature(FEATURE_KEYS.OPEN_WEEK),
      state: Math.min(week, MAX_TRAINS),
    },
    {
      device_feature_external_id: ids.feature(FEATURE_KEYS.OPEN_DAYS),
      state: Math.min(summary.days, MAX_DAYS),
    },
    {
      device_feature_external_id: ids.feature(FEATURE_KEYS.NEXT_TRAIN),
      text: next.slice(0, TEXT_MAX),
    },
  ];
}

export {
  DEVICE_TYPE,
  FEATURE_KEYS,
  MAX_TRAINS,
  MAX_DAYS,
  WEEK_DAYS,
  idsOf,
  routeIdOf,
  deviceName,
  buildRouteDevice,
  buildRouteStates,
};
