// -----------------------------------------------------------------------------
// Configuration of the TGV MAX integration.
//
// Field of the config_schema (the open data of SNCF need no key):
//   - `language`        language of the texts Gladys does not ask for in a
//                       language (device names, feature texts, scene
//                       summaries): `auto` follows the last widget request,
//                       French until then.
//
// Internal keys, outside the config_schema (never shown in the UI, stored by
// setConfig, so they live in the Gladys database and follow its backups):
//   - `routes`          the followed routes, added with the "Add a route"
//                       button (routes.js);
//   - `last_language`   language of the last widget request.
// -----------------------------------------------------------------------------

import { isLanguage } from './i18n.js';

const AUTO_LANGUAGE = 'auto';
const DEFAULT_LANGUAGE = 'fr';
const INTERNAL_KEYS = { routes: 'routes', language: 'last_language' };

/**
 * @description Normalize the raw config object from the host API.
 * @param {object} [rawConfig] - The raw config values.
 * @returns {{ language: string }} The settings.
 * @example
 * normalizeConfig({ language: 'de' }); // -> { language: 'de' }
 */
function normalizeConfig(rawConfig = {}) {
  const config = rawConfig ?? {};
  return { language: isLanguage(config.language) ? config.language : AUTO_LANGUAGE };
}

/**
 * @description Read the stored language of the last widget request.
 * @param {object} [rawConfig] - The raw config values.
 * @param {string} fallback - The language to keep when nothing valid is stored.
 * @returns {string} The language.
 * @example
 * readLanguage({ last_language: 'en' }, 'fr'); // -> 'en'
 */
function readLanguage(rawConfig, fallback) {
  const language = (rawConfig ?? {})[INTERNAL_KEYS.language];
  return isLanguage(language) ? language : fallback;
}

export { AUTO_LANGUAGE, DEFAULT_LANGUAGE, INTERNAL_KEYS, normalizeConfig, readLanguage };
