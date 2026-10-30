import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  fold,
  stationLabel,
  stationOf,
  buildCatalog,
  findStation,
  searchStations,
} from '../src/stations.js';
import { ORIGINS, DESTINATIONS } from './helpers/fixtures.js';

const catalog = buildCatalog([...ORIGINS, ...DESTINATIONS]);

test('the catalogue: one entry per name of the dataset, the cities with their stations', () => {
  assert.equal(catalog.length, 313);
  const paris = catalog.find((station) => station.name === 'PARIS (intramuros)');
  assert.deepEqual(paris.codes, ['FRPAZ', 'FRPBE', 'FRPLY', 'FRPMO', 'FRPNO', 'FRPST']);
  assert.equal(paris.label, 'Paris');
  assert.ok(paris.trains > 10000);
});

test('names as people read them', () => {
  assert.equal(stationLabel('MARSEILLE ST CHARLES'), 'Marseille St Charles');
  assert.equal(stationLabel('AIX EN PROVENCE TGV'), 'Aix en Provence TGV');
  assert.equal(stationLabel('LYON ST EXUPERY TGV.'), 'Lyon St Exupery TGV');
  assert.equal(stationLabel('AEROPORT ROISSY CDG 2 TGV'), 'Aeroport Roissy CDG 2 TGV');
  assert.equal(stationLabel('SAARBRUECKEN/SARREBRUCK'), 'Saarbruecken/Sarrebruck');
  assert.equal(stationLabel('LILLE (intramuros)'), 'Lille');
  assert.equal(stationOf('FRPLY', 'PARIS (intramuros)'), 'Paris Gare de Lyon');
  assert.equal(stationOf('FRLLE', 'LILLE (intramuros)'), 'Lille', 'unsure stations show the city');
  assert.equal(fold('Saint-Pierre-des-Corps'), 'ST PIERRE DES CORPS');
  assert.equal(fold('Genève'), 'GENEVE');
});

test('finding the station a user means', () => {
  const found = (query) => findStation(catalog, query).station?.name;
  assert.equal(found('Paris'), 'PARIS (intramuros)');
  assert.equal(found('lyon'), 'LYON (intramuros)', 'the city, not Saint-Exupéry');
  assert.equal(found('lyon st exupery'), 'LYON ST EXUPERY TGV.');
  assert.equal(found('Saint-Pierre-des-Corps'), 'ST PIERRE DES CORPS');
  assert.equal(found('aix tgv'), 'AIX EN PROVENCE TGV');
  assert.equal(found('Bordeaux'), 'BORDEAUX ST JEAN');
  assert.equal(found('FRPLY'), 'PARIS (intramuros)');
  assert.equal(found('Barcelone'), 'BARCELONA SANTS');
  assert.equal(found('Genève'), 'GENEVE CORNAVIN');
  assert.equal(found('Bâle'), 'BASEL SBB');
  const marseille = findStation(catalog, 'Marseille');
  assert.equal(marseille.status, 'ambiguous');
  assert.deepEqual(
    marseille.candidates.map((station) => station.label),
    ['Marseille St Charles', 'Marseille Blancarde'],
    'the busiest first',
  );
  assert.equal(findStation(catalog, 'Nimes').status, 'ambiguous', 'NIMES is a name, not a code');
  assert.equal(findStation(catalog, 'Atlantide').status, 'none');
  assert.equal(findStation(catalog, '  ').status, 'empty');
});

test('"Find a station" lists the busiest matches', () => {
  assert.deepEqual(
    searchStations(catalog, 'valence').map((station) => station.label),
    ['Valence TGV Auvergne Rhone Alpes', 'Valence Ville'],
  );
  assert.equal(searchStations(catalog, 'st', 5).length, 5);
  assert.deepEqual(searchStations(catalog, ''), []);
});
