// Builds the widget contents of the illustrations with the integration's own
// code: node gen.mjs <repo> <out.json> (run by render.sh)
//
// The three widgets on a real Friday morning: the trains of Paris → Lyon,
// Lyon → Paris and Bordeaux → Paris read on the SNCF portal on 2026-10-30
// and kept in test/fixtures go through the real parsers (src/trains.js) and
// the real widget builders (src/widgets.js). The fixtures stop on
// 8 November: the calendar shows its first ten days.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const [repo, out] = process.argv.slice(2);
const load = (path) => import(pathToFileURL(`${repo}/${path}`).href);
const { buildTrainsWidget, buildCalendarWidget, buildOverviewWidget } =
  await load('src/widgets.js');
const { parseTrains, upcomingTrains, summarize, perDay } = await load('src/trains.js');
const { LANGUAGES } = await load('src/i18n.js');
const fixture = (name) => JSON.parse(readFileSync(`${repo}/test/fixtures/${name}`, 'utf8'));
const manifest = JSON.parse(readFileSync(`${repo}/gladys-assistant-integration.json`, 'utf8'));

// Friday 30 October 2026, 09:00 in Paris; the data of 06:23.
const NOW = Date.parse('2026-10-30T08:00:00Z');
const READ_AT = Date.parse(fixture('dataset.json').metas.default.data_processed);

const route = (id, origin, destination, fields = {}) => ({
  id,
  origin,
  destination,
  days: 'all',
  dates: [],
  after: 0,
  before: 24,
  ...fields,
});
const PARIS = 'PARIS (intramuros)';
const LYON = 'LYON (intramuros)';
const routes = [
  { route: route('0000000a', PARIS, LYON), file: 'paris-lyon.json' },
  {
    route: route('0000000b', LYON, PARIS, { days: 'fri_sun', after: 17 }),
    file: 'lyon-paris.json',
  },
  {
    route: route('0000000c', 'BORDEAUX ST JEAN', PARIS, { days: 'weekend' }),
    file: 'bordeaux-paris.json',
  },
].map(({ route: entry, file }) => {
  const upcoming = upcomingTrains(parseTrains(fixture(file), entry), entry, NOW);
  return { route: entry, upcoming, summary: summarize(upcoming, NOW) };
});
const [main] = routes;
const days = perDay(main.upcoming, NOW, main.route).slice(0, 10);

const contents = {};
for (const language of LANGUAGES) {
  contents[language] = {
    trains: buildTrainsWidget({
      route: main.route,
      summary: main.summary,
      readAt: READ_AT,
      count: 5,
      language,
      now: NOW,
    }),
    calendar: buildCalendarWidget({
      route: main.route,
      summary: main.summary,
      days,
      readAt: READ_AT,
      language,
      now: NOW,
    }),
    overview: buildOverviewWidget({
      rows: routes.map(({ route: entry, summary }) => ({ route: entry, summary })),
      readAt: READ_AT,
      language,
    }),
  };
}
const widgets = Object.fromEntries(
  manifest.widgets.map((w) => [w.key, { icon: w.icon, label: w.label }]),
);
writeFileSync(out, JSON.stringify({ now: NOW, widgets, contents }));
