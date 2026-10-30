// -----------------------------------------------------------------------------
// The stations of the dataset, and the names users type.
//
// The dataset names every origin and destination as SNCF sells them, in
// capitals without accents ("MARSEILLE ST CHARLES"), and groups the stations
// of Paris, Lyon and Lille under one name each ("PARIS (intramuros)"), every
// station keeping its own code ("FRPLY" for Paris Gare de Lyon). A followed
// route is a pair of those names: "Paris → Lyon" covers every train between
// any Paris station and Part-Dieu or Perrache.
//
// The list of the names comes from the dataset itself (`group_by` on the
// origins and the destinations, two requests), kept in /data and read again
// every week: there is no other list of the stations of MAX.
// -----------------------------------------------------------------------------

// The stations behind a city name, as the dataset codes them. Only the codes
// whose station is certain are named: the others show the city.
const STATION_NAMES = {
  FRPLY: 'Paris Gare de Lyon',
  FRPMO: 'Paris Montparnasse',
  FRPNO: 'Paris Nord',
  FRPST: 'Paris Est',
  FRPAZ: 'Paris Austerlitz',
  FRPBE: 'Paris Bercy',
  FRLPD: 'Lyon Part-Dieu',
  FRLPE: 'Lyon Perrache',
};
const CITY_SUFFIX = /\s*\(intramuros\)\s*$/i;
// Words kept in lower case inside a name, and acronyms kept in capitals.
const SMALL_WORDS = new Set([
  'de',
  'des',
  'du',
  'la',
  'le',
  'les',
  'en',
  'sur',
  'sous',
  'et',
  'aux',
  'au',
  'l',
  'd',
]);
const ACRONYMS = new Set([
  'TGV',
  'CDG',
  'HBF',
  'SNCF',
  'AV',
  'IC',
  'TER',
  'MLV',
  'SNCB',
  'SBB',
  'HB',
]);
const SEARCH_MAX = 8;
// The French, English, German and Spanish names of the cities the dataset
// writes in their own language, folded.
const ALIASES = {
  BARCELONE: 'BARCELONA',
  MILAN: 'MILANO',
  MAILAND: 'MILANO',
  TURIN: 'TORINO',
  BALE: 'BASEL',
  BASILEA: 'BASEL',
  MUNICH: 'MUNCHEN',
  MUNIQUE: 'MUNCHEN',
  FRANCFORT: 'FRANKFURT',
  FRIBOURG: 'FREIBURG',
  SARREBRUCK: 'SAARBRUECKEN',
  SAARBRUCKEN: 'SAARBRUECKEN',
  GENEVA: 'GENEVE',
  GENF: 'GENEVE',
  GINEBRA: 'GENEVE',
  BRUSSELS: 'BRUXELLES',
  BRUSSEL: 'BRUXELLES',
  BRUSELAS: 'BRUXELLES',
  GERONE: 'GIRONA',
  FIGUERAS: 'FIGUERES',
  ZURICHE: 'ZURICH',
};

/**
 * @description Fold a name for comparisons: no accents, capitals, "Saint" as
 * the dataset writes it ("ST"), no "(intramuros)", no punctuation.
 * @param {unknown} name - The name.
 * @returns {string} "ST PIERRE DES CORPS".
 * @example
 * fold('Saint-Pierre-des-Corps'); // -> 'ST PIERRE DES CORPS'
 */
function fold(name) {
  return String(name ?? '')
    .replace(CITY_SUFFIX, '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\bSAINTE\b/g, 'STE')
    .replace(/\bSAINT\b/g, 'ST')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * @description A folded query, with the foreign city names the dataset uses.
 * @param {string} folded - fold() of the query.
 * @returns {string} "BARCELONA" for "BARCELONE".
 */
const unalias = (folded) =>
  folded
    .split(' ')
    .map((word) => ALIASES[word] ?? word)
    .join(' ');

/**
 * @description The name of a station as people read it: "Marseille St
 * Charles", "Paris" for "PARIS (intramuros)".
 * @param {string} name - The name of the dataset.
 * @returns {string} The label.
 * @example
 * stationLabel('AIX EN PROVENCE TGV'); // -> 'Aix en Provence TGV'
 */
function stationLabel(name) {
  const words = String(name ?? '')
    .replace(CITY_SUFFIX, '')
    .replace(/\.$/, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return words
    .map((word, index) => {
      if (ACRONYMS.has(word.toUpperCase()) || /\d/.test(word)) {
        return word.toUpperCase();
      }
      const lower = word.toLowerCase();
      if (index > 0 && SMALL_WORDS.has(lower)) {
        return lower;
      }
      return lower.replace(
        /(^|[-'/(])(\p{L})/gu,
        (whole, before, letter) => `${before}${letter.toUpperCase()}`,
      );
    })
    .join(' ');
}

/**
 * @description The name of one station of a train: "Paris Gare de Lyon" for
 * the codes of STATION_NAMES, the label of its name otherwise.
 * @param {string} code - The code of the dataset ("FRPLY").
 * @param {string} name - The name of the dataset.
 * @returns {string} The name.
 */
const stationOf = (code, name) => STATION_NAMES[code] ?? stationLabel(name);

/**
 * @description The catalogue of the stations.
 * @param {object[]} records - Records `{ origine, origine_iata }` and `{
 * destination, destination_iata }` (the two `group_by` answers).
 * @returns {object[]} `[{ name, label, folded, codes, trains }]`, by label.
 */
function buildCatalog(records) {
  const byName = new Map();
  for (const record of records ?? []) {
    const name = record?.origine ?? record?.destination;
    const code = record?.origine_iata ?? record?.destination_iata;
    if (typeof name !== 'string' || !name.trim()) {
      continue;
    }
    const entry = byName.get(name) ?? {
      name,
      label: stationLabel(name),
      folded: fold(name),
      codes: [],
      trains: 0,
    };
    if (typeof code === 'string' && code && !entry.codes.includes(code)) {
      entry.codes.push(code);
    }
    entry.trains += Number(record['count(*)']) || 0;
    byName.set(name, entry);
  }
  return [...byName.values()]
    .map((entry) => ({ ...entry, codes: entry.codes.sort() }))
    .sort((a, b) => a.label.localeCompare(b.label, 'fr'));
}

/**
 * @description Find the station a user means.
 * @param {object[]} catalog - buildCatalog().
 * @param {unknown} query - What the user typed: a name ("Lyon", "Saint
 * Pierre des Corps", "aix tgv") or a code ("FRPLY").
 * @returns {{ status: string, station?: object, candidates?: object[] }}
 * `found` with the station, `ambiguous` with up to eight candidates (the
 * busiest first), `none`, or `empty`.
 * @example
 * findStation(catalog, 'Lyon'); // -> { status: 'found', station: { name: 'LYON (intramuros)', … } }
 */
function findStation(catalog, query) {
  const folded = unalias(fold(query));
  if (!folded) {
    return { status: 'empty' };
  }
  const list = catalog ?? [];
  // A code of the dataset ("FRPLY"); "NIMES" is a name.
  const coded = list.find((entry) => entry.codes.includes(folded));
  if (coded) {
    return { status: 'found', station: coded };
  }
  const exact = list.filter((entry) => entry.folded === folded || fold(entry.label) === folded);
  if (exact.length === 1) {
    return { status: 'found', station: exact[0] };
  }
  // Every typed word starts a word of the name, in any order.
  const words = folded.split(' ');
  const matches = list.filter((entry) => {
    const own = entry.folded.split(' ');
    return words.every((word) => own.some((part) => part.startsWith(word)));
  });
  if (matches.length === 1) {
    return { status: 'found', station: matches[0] };
  }
  if (matches.length === 0) {
    return { status: 'none' };
  }
  const candidates = [...matches].sort((a, b) => b.trains - a.trains).slice(0, SEARCH_MAX);
  return { status: 'ambiguous', candidates };
}

/**
 * @description The stations whose name holds what the user typed, for "Find
 * a station".
 * @param {object[]} catalog - buildCatalog().
 * @param {unknown} query - What the user typed.
 * @param {number} [max] - How many.
 * @returns {object[]} The stations, the busiest first.
 */
function searchStations(catalog, query, max = 12) {
  const folded = unalias(fold(query));
  if (!folded) {
    return [];
  }
  const words = folded.split(' ');
  return (catalog ?? [])
    .filter((entry) =>
      words.every((word) => entry.folded.split(' ').some((part) => part.startsWith(word))),
    )
    .sort((a, b) => b.trains - a.trains)
    .slice(0, max);
}

export { STATION_NAMES, fold, stationLabel, stationOf, buildCatalog, findStation, searchStations };
