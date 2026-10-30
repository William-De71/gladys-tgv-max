# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for human
contributors.

## What this is

A Gladys Assistant **external integration** for the MAX JEUNE and MAX SENIOR
seats of SNCF: a Node.js service (Node 22+, ESM, no build step) that runs in
its own sandboxed Docker container and talks to Gladys through
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js),
its only runtime dependency. It reads the dataset `tgvmax` of SNCF Voyageurs
on the open data portal of SNCF (`https://ressources.data.sncf.com`, an
Opendatasoft portal, Explore API v2.1, no key, ODbL data): every MAX train
over the next 30 days, one record per train and per pair of stations, with
`od_happy_card` "OUI" while MAX seats are open. The dataset is rebuilt once a
day, early in the morning. Transport: cloud only.
Documentation of the dataset:
https://ressources.data.sncf.com/explore/dataset/tgvmax/information/

## Commands

```bash
npm install
npm test                                  # node --test, the built-in runner
node --test test/widgets.test.js          # one file
DEBUG=gladys-integration-sdk npm test     # with the SDK debug logs
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npm run format                            # Prettier, fix in place
npx github:GladysAssistant/integration-store . --skip-image-check   # store checks
scripts/build-cover.sh                    # cover.jpg from docs/assets/cover.svg
docs/illustrations/render.sh              # docs/assets/widgets.<lang>.png
node .github/scripts/release.mjs next     # the version the next release would get
```

## Architecture

```
index.js                SDK wiring only (new GladysIntegration + createApp)
src/app.js              every handler, registered before connect(); the timers
src/sncf-api.js         HTTP client of the portal: metadata, group_by, exports, quota headers
src/stations.js         the stations of the dataset, typed names -> dataset names
src/trains.js           records -> trains (merged per train), days and hours of a route
src/routes.js           the followed routes (setConfig registry), form readers
src/events.js           scene trigger transitions, payloads, scene action outputs
src/device.js           the route device and its states
src/widgets.js          trains, calendar and overview dashboard widgets
src/store.js            /data/tgv-max.json: stations, `seen`
src/time.js             Paris dates and times, typed dates
src/config.js           configuration (language) and internal keys
src/i18n.js             runtime texts, en / fr / de / es
gladys-assistant-integration.json   manifest
docs/{en,fr,de,es}.md   user documentation, re-hosted by the store
docs/illustrations/     generated widget images (render.sh, gen.mjs, render.js)
test/fixtures/          real answers of the SNCF portal, reduced (ODbL)
.github/scripts/release.mjs         version, changelog, bump (tested in test/)
```

## Rules

- **External ids are forever**, and so is every key users store: device and
  feature external ids (`route:<8 hex digits>`, the random identifier a
  route gets at creation, never a station name; features `open_trains`,
  `open_week`, `open_days`, `next_train`), feature `category` / `type` /
  `unit` / `min` / `max` / `step`, the keys of `config_schema`, `actions` and
  their fields, the widgets and their settings, scene triggers (fields,
  variables) and scene actions (fields, outputs), the day keys of the selects
  (`all`, `weekdays`, `weekend`, `fri_sun`, `mon` … `sun`), and the internal
  config keys `routes` (one object per route: `id`, `origin`, `destination`,
  `days`, `dates`, `after`, `before`; the station names as the dataset writes
  them) and `last_language`.
  `test/structure.test.js` compares them to
  `test/fixtures/discovery.baseline.json`: never update the baseline to make a
  test pass without a documented migration.
- **Category / type pairs.** The counts are `counter-sensor` / `integer`
  (trains 0-2000, days 0-31), the next train `text` / `text`.
- **`should_poll` stays false**: the integration reads on its own timer — the
  metadata every 30 minutes, the trains of the routes only when
  `data_processed` changed (once a day), the stations weekly; every 5 minutes
  the states are worked out again from memory, without a request.
- **Quota of the portal.** Without a key, the portal allows a daily number of
  calls per address (10 000 seen, `X-RateLimit-*` headers, 429 beyond). One
  request per route and per day of data, 48 for the metadata: never add a
  request per route and per tick. A scene action search is cached 15 minutes.
- **Filter on the portal.** The trains are read with an ODSQL `where` on the
  two station names and the dates, on the `exports/json` endpoint (no page
  limit), never the whole dataset.
- **Paris time.** Dates and times of the dataset are Paris time, whatever the
  timezone of the instance (`src/time.js`). A train that left today is no
  longer counted.
- **Events once.** `seen` (in /data) remembers the open trains of each route
  with the signature of its stations, days and hours. The first reading of a
  route, and the first after an edit, is a baseline: nothing fires. One
  `new_seats` event per route and per reading, never one per train. A scene
  action or a widget never fires an event.
- **The data date from the morning.** Every widget shows the time of the data
  and links to SNCF Connect; the docs say to book there, where seats are live.
- **Data licence.** ODbL: keep the source and the time of the data visible in
  the widgets, and the credit in the README, the docs and NOTICE. MAX JEUNE,
  MAX SENIOR and SNCF Connect are trademarks of SNCF: no logo of SNCF.
- **The container rootfs is read-only.** Write only under `/data`.
- **Four languages.** Every user-facing text (manifest, runtime messages in
  `src/i18n.js`, `docs/*.md`, README) exists in English, French, German and
  Spanish. `test/i18n.test.js` checks it. Station names stay as the dataset
  writes them.
- **Widget images.** After any change to the content of a widget, run
  `docs/illustrations/render.sh` again and look at the four PNG files.
- **Versions belong to the Release workflow**: never edit `version` in
  `package.json`, the lockfile or the manifest, nor the `docker_image` tag.
  The version stays below 1.0.0 until the maintainer runs the Release workflow
  with `release-as: 1.0.0`.
- **Changelog.** Never edit CHANGELOG.md by hand, it is generated at the
  release. Write the PR title as the line the user will read.
- **Commits and PR titles** follow Conventional Commits, in English: `feat` ->
  minor, `fix` / `perf` -> patch, `!` or `BREAKING CHANGE:` -> major (minor
  below 1.0.0); `docs`, `chore`, `ci`, `test`, `style`, `refactor`, `build`
  release nothing.
- **Manifest.** Texts are objects `{ "en", "fr", "de", "es" }`; the catalog
  `description` holds 10 to 100 characters per language; the file stays under
  100 KB. `gladys_version` is `>=5.3.0` (widgets, scene triggers, catalog
  `keywords` and `countries`). Transport: `["cloud"]`. No permission, no
  secret.
- **Forum drafts** (`.github/forum-*.md`) are never committed.
- **Style.** Prettier formats, ESLint catches mistakes. Comments explain why,
  in English. Tests never touch the network (the fake portal of
  `test/helpers/fixtures.js`).
