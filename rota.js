/* ------------------------------------------------------------------
   43 Stran — the rota logic, and nothing else.

   No DOM, no storage, no network. Every function here is a plain
   input-to-output calculation, which is exactly what makes it possible to
   test: run `node --test rota.test.mjs`.

   Two ideas do all the work:

     • who cleans what is DERIVED from the date, never stored, because
       every phone can work it out for itself;

     • week numbers are counted in CALENDAR DAYS, not milliseconds,
       because a daylight-saving day is not 24 hours long.
   ------------------------------------------------------------------ */

/* ==== Who and what =============================================== */

// Week 1 begins at 00:00 on this date, in local time.
// Careful: JS months are zero-indexed, so 9 means October.
export const ROTA_START = new Date(2026, 9, 12);

// In week 1, PEOPLE[i] is given QUADRANTS[i]. Each later week shifts the two
// lists one step further out of line, which is what rotates the jobs.
export const PEOPLE = ['Theo', 'Sean Og', 'Sean', 'Conor'];

export const QUADRANTS = [
  'Kitchen',
  'Toilet & landing',
  'Shower room',
  'Living room, hallway & stairs',
];

/* ==== Date maths ================================================= */

const DAY_MS = 86_400_000;

// A stable day number for a local calendar date.
//
// The Date.UTC rebuild matters: it throws away the time of day, so a
// daylight-saving change (a 23- or 25-hour day) can't nudge the result off by
// one. That off-by-one-day bug is the classic trap in "days between two
// dates" code.
export function dayNumber(date) {
  return Math.floor(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS
  );
}

const START_DAY = dayNumber(ROTA_START);

// 0-based week index: 0 is week 1, 1 is week 2, and so on.
export function weekNumberFor(date) {
  return Math.floor((dayNumber(date) - START_DAY) / 7);
}

// The local date on which a given week begins, at midnight.
// setDate() rolls months and years over correctly, and stays on local time.
export function weekStartDate(week) {
  const date = new Date(ROTA_START);
  date.setDate(date.getDate() + week * 7);
  return date;
}

// A "true" modulo. JavaScript's % keeps the sign of the left operand, so
// (-1) % 4 is -1 rather than 3. We want the wrap-around behaviour.
export function mod(n, m) {
  return ((n % m) + m) % m;
}

// The storage key for a week. A date is used rather than the week number so
// the data stays readable in the Firebase console, and so it still means
// something if the rotation is ever reordered.
export function weekKeyFor(week) {
  const d = weekStartDate(week);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return d.getFullYear() + '-' + month + '-' + day;
}

export function weekFromKey(key) {
  const parts = key.split('-').map(Number);
  return weekNumberFor(new Date(parts[0], parts[1] - 1, parts[2]));
}

/* ==== The rota =================================================== */

// Who has what in a given week: [{ person, quadrant }, ...]
//
// The modulo is the whole trick. Everybody moves forward by the SAME offset,
// so no area is left unassigned and nobody can end up with two of them.
export function assignmentFor(week) {
  const count = QUADRANTS.length;
  return PEOPLE.map(function (person, i) {
    return { person: person, quadrant: QUADRANTS[mod(i + week, count)] };
  });
}

/* ==== Reading the evidence =======================================
   `weeks` looks like:

     { '2026-10-12': { Sean: { done: true, at: 1760000000000 } } }

   A person who isn't present simply has no entry, which reads as "not
   done". Unticking deletes the entry rather than storing done: false, so
   the absence of a record and the absence of a tick mean the same thing.
   ------------------------------------------------------------------ */

export function entryFor(weeks, week, person) {
  const weekData = weeks[weekKeyFor(week)];
  return (weekData && weekData[person]) || null;
}

export function personDone(weeks, week, person) {
  const entry = entryFor(weeks, week, person);
  return Boolean(entry && entry.done);
}

// Every week we can fairly judge, oldest first: from the week tracking began
// right up to (but not including) the one in progress.
//
// Tracking start comes from meta, falling back to the earliest week that has
// any data at all. The point of meta is so that a week where *nobody* ticked
// anything still counts as four misses instead of quietly vanishing — which
// is precisely the week you'd most want to know about.
export function trackedWeeks(weeks, meta, week) {
  const recorded = Object.keys(weeks)
    .filter((key) => /^\d{4}-\d{2}-\d{2}$/.test(key))
    .map(weekFromKey);

  const candidates = [];
  if (meta && meta.started) candidates.push(weekFromKey(meta.started));
  if (recorded.length) candidates.push(Math.min.apply(null, recorded));

  if (candidates.length === 0) return [];

  const first = Math.min.apply(null, candidates);
  const out = [];
  for (let w = first; w < week; w++) out.push(w);
  return out;
}

export function buildRecord(weeks, pastWeeks) {
  return PEOPLE.map(function (person) {
    let done = 0;
    for (const w of pastWeeks) if (personDone(weeks, w, person)) done++;
    return { person: person, done: done, missed: pastWeeks.length - done };
  });
}
