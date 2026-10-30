// -----------------------------------------------------------------------------
// Entry point of the TGV MAX external integration.
//
// Follows the MAX JEUNE and MAX SENIOR seats of SNCF in Gladys, through the
// official open data of SNCF Voyageurs (no key):
//   - devices: one per followed route, with its trains with MAX seats open
//     over the next 30 days, within 7 days, its days with seats and the
//     next open train (src/device.js);
//   - scene triggers: new MAX seats on a route, route sold out;
//   - scene actions: search the MAX seats of a route on a date, read a
//     followed route;
//   - dashboard widgets: trains, calendar, overview.
//
// This file only wires the SDK client: the handlers are in src/app.js.
//
// Environment variables provided by the Gladys supervisor:
//   GLADYS_HOST_API_URL / GLADYS_INTEGRATION_TOKEN / GLADYS_INTEGRATION_SELECTOR
// The SDK reads them automatically: `new GladysIntegration()` is enough.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { createApp } from './src/app.js';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

const gladys = new GladysIntegration();
createApp(gladys);

// --- Startup -----------------------------------------------------------------------
logger.info(`Starting the TGV MAX integration ${version}...`);
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
