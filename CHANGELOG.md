# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions
follow [Semantic Versioning](https://semver.org/). This file is generated at
each release from the Conventional Commits: do not edit it by hand.

## [0.1.0] - unreleased

### Added

- One device per followed route of MAX JEUNE and MAX SENIOR (up to 20, added with the "Add a route" button: a city such as "Paris" covers every station of the city, a station such as "Aix en Provence TGV" only itself), filtered by days (every day, weekdays, weekends, one day of the week, or up to ten dates) and departure hours: the trains with MAX seats open over the next 30 days, within 7 days, the days with seats and the next open train.
- Scene triggers: new MAX seats on a followed route (one event per route each morning, with the trains that opened) and no more MAX seats on a route.
- Scene actions: search the MAX seats between two stations on a date, and read a followed route, each with a ready-made summary.
- Dashboard widgets: the next trains of a route with MAX seats, a 30-day calendar of the open trains per day, and every followed route in one card, with a link to SNCF Connect.
- Configuration actions: test the connection, find a station, add (with the return trip), edit, remove and list routes.
- Cloud transport: the official open data of SNCF Voyageurs, no account and no key; the metadata of the dataset read every 30 minutes, the trains of the routes once a day when it is rebuilt.
- English, French, German and Spanish everywhere: settings, devices, widgets, scenes and documentation.

[0.1.0]: https://github.com/William-De71/gladys-tgv-max/releases/tag/v0.1.0
