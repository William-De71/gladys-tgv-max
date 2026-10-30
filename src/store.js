// -----------------------------------------------------------------------------
// What the integration keeps across restarts, in /data/tgv-max.json (the only
// writable place of the container):
//   - `stations`  the stations of the dataset (`{ records, readAt }`), read
//                 again weekly, so a restart only reads the trains;
//   - `seen`      per route, the open trains of its last reading (`{ open:
//                 [keys], signature }`): the scene triggers compare the next
//                 reading to it, so a restart neither fires again nor misses
//                 what opened meanwhile. `signature` holds the stations, days
//                 and hours: an edited route starts from a new baseline.
// The trains themselves are not kept: they are read again at start.
// -----------------------------------------------------------------------------

import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

const DEFAULT_PATH = '/data/tgv-max.json';
const EMPTY = () => ({ stations: { records: null, readAt: 0 }, seen: {} });

/**
 * @description The store.
 * @param {object} [options] - `{ path, logger }`.
 * @returns {object} `{ data, load, save }`.
 */
function createStore({ path = DEFAULT_PATH, logger } = {}) {
  const store = {
    data: EMPTY(),
    /**
     * @description Read the file; an absent or broken file is an empty store.
     * @returns {Promise<void>}
     */
    async load() {
      try {
        const raw = JSON.parse(await readFile(path, 'utf8'));
        const base = EMPTY();
        const value = raw && typeof raw === 'object' ? raw : {};
        const part = (name) => (value[name] && typeof value[name] === 'object' ? value[name] : {});
        store.data = {
          stations: { ...base.stations, ...part('stations') },
          seen: { ...part('seen') },
        };
      } catch (err) {
        if (err.code !== 'ENOENT') {
          logger?.warn(`Unable to read ${path}: ${err.message}`);
        }
        store.data = EMPTY();
      }
    },
    /**
     * @description Write the file (atomically: a temporary file, then a rename).
     * @returns {Promise<void>}
     */
    async save() {
      try {
        await mkdir(dirname(path), { recursive: true });
        const temporary = `${path}.tmp`;
        await writeFile(temporary, JSON.stringify(store.data));
        await rename(temporary, path);
      } catch (err) {
        logger?.warn(`Unable to write ${path}: ${err.message}`);
      }
    },
  };
  return store;
}

export { DEFAULT_PATH, createStore };
