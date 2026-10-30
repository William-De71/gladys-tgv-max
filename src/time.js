// -----------------------------------------------------------------------------
// Dates and times of the trains.
//
// The dataset writes dates (`2026-11-06`) and times of day (`06:20`) in Paris
// time, the time of the SNCF timetables, international trains included. Every
// computation here is done in Europe/Paris, whatever the timezone of the
// Gladys instance: a train "leaves at 06:20" for everyone.
// -----------------------------------------------------------------------------

const PARIS = 'Europe/Paris';
const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
// Monday first, as in France.
const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

/**
 * @description The Paris date and time of an instant.
 * @param {number} instant - The instant, in ms.
 * @returns {{ date: string, minutes: number }} `YYYY-MM-DD` and minutes since midnight.
 * @example
 * parisClock(Date.parse('2026-10-30T08:00:00Z')); // -> { date: '2026-10-30', minutes: 540 }
 */
function parisClock(instant) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: PARIS,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(instant))
      .map((part) => [part.type, part.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

/**
 * @description Whether a text is a real calendar date.
 * @param {unknown} value - The value.
 * @returns {boolean} True for `2026-11-06`, false for `2026-02-30`.
 */
function isDate(value) {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) {
    return false;
  }
  const day = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(day.getTime()) && day.toISOString().slice(0, 10) === value;
}

/**
 * @description A date some days later (or earlier).
 * @param {string} date - `YYYY-MM-DD`.
 * @param {number} days - Days to add.
 * @returns {string} `YYYY-MM-DD`.
 * @example
 * addDays('2026-10-30', 3); // -> '2026-11-02'
 */
function addDays(date, days) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/**
 * @description Days from a date to another.
 * @param {string} from - `YYYY-MM-DD`.
 * @param {string} to - `YYYY-MM-DD`.
 * @returns {number} Whole days, negative when `to` is before `from`.
 */
function daysBetween(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/**
 * @description The day of the week of a date.
 * @param {string} date - `YYYY-MM-DD`.
 * @returns {string} One of WEEKDAYS.
 */
function weekdayOf(date) {
  // getUTCDay: 0 for Sunday.
  return WEEKDAYS[(new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7];
}

/**
 * @description Minutes since midnight of a time of the dataset.
 * @param {unknown} time - `HH:MM`.
 * @returns {number|null} The minutes, null when not a time.
 * @example
 * minutesOf('06:20'); // -> 380
 */
function minutesOf(time) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(time ?? '').trim());
  if (!match) {
    return null;
  }
  const [hours, minutes] = [Number(match[1]), Number(match[2])];
  return hours < 24 && minutes < 60 ? hours * 60 + minutes : null;
}

// Words for today and tomorrow, in the four languages.
const TODAY_WORDS = new Set(['today', "aujourd'hui", 'aujourdhui', 'heute', 'hoy']);
const TOMORROW_WORDS = new Set(['tomorrow', 'demain', 'morgen', 'mañana', 'manana']);

/**
 * @description Read a date typed by a user or written by a scene: an ISO date
 * (`2026-11-06`), a French one (`06/11/2026`, `6/11`: the next 6 November),
 * today or tomorrow in one of the four languages, or `+3` (in three days).
 * @param {unknown} raw - The value.
 * @param {string} today - Today, `YYYY-MM-DD` (Paris).
 * @returns {string|null|undefined} `YYYY-MM-DD`, null when empty, undefined
 * when not understood.
 * @example
 * parseDateInput('6/11', '2026-10-30'); // -> '2026-11-06'
 */
function parseDateInput(raw, today) {
  if (raw === undefined || raw === null) {
    return null;
  }
  const text = String(raw).trim().toLowerCase().replace(/’/g, "'");
  if (!text) {
    return null;
  }
  if (TODAY_WORDS.has(text)) {
    return today;
  }
  if (TOMORROW_WORDS.has(text)) {
    return addDays(today, 1);
  }
  const offset = /^\+\s*(\d{1,2})$/.exec(text);
  if (offset) {
    return addDays(today, Number(offset[1]));
  }
  if (isDate(text)) {
    return text;
  }
  const french = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2}|\d{4}))?$/.exec(text);
  if (!french) {
    return undefined;
  }
  const [day, month] = [french[1].padStart(2, '0'), french[2].padStart(2, '0')];
  if (french[3]) {
    const year = french[3].length === 2 ? `20${french[3]}` : french[3];
    const date = `${year}-${month}-${day}`;
    return isDate(date) ? date : undefined;
  }
  // No year: the next such day, this year or the next one.
  const year = Number(today.slice(0, 4));
  for (const candidate of [`${year}-${month}-${day}`, `${year + 1}-${month}-${day}`]) {
    if (isDate(candidate) && candidate >= today) {
      return candidate;
    }
  }
  return undefined;
}

export {
  PARIS,
  MINUTE_MS,
  DAY_MS,
  WEEKDAYS,
  parisClock,
  isDate,
  addDays,
  daysBetween,
  weekdayOf,
  minutesOf,
  parseDateInput,
};
