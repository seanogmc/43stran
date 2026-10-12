/* ------------------------------------------------------------------
   Tests for rota.js.  Run with:  node --test rota.test.mjs

   These cover the two things that are easy to get subtly wrong and very
   hard to notice by eye: the rotation (does everyone actually get every
   area?) and the calendar maths (does a week boundary survive a clock
   change?).
   ------------------------------------------------------------------ */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  PEOPLE,
  QUADRANTS,
  assignmentFor,
  buildRecord,
  dayNumber,
  personDone,
  trackedWeeks,
  weekFromKey,
  weekKeyFor,
  weekNumberFor,
  weekStartDate,
} from './rota.js';

/* Small helpers so the tests below read as sentences. */

function quadrantsFor(week) {
  return assignmentFor(week).map((a) => a.quadrant);
}

function quadrantOf(week, person) {
  return assignmentFor(week).find((a) => a.person === person).quadrant;
}

/* ==== The rotation =============================================== */

test('week 1 matches the pairing the house agreed', () => {
  assert.equal(quadrantOf(0, 'Theo'), 'Kitchen');
  assert.equal(quadrantOf(0, 'Sean Og'), 'Toilet & landing');
  assert.equal(quadrantOf(0, 'Sean'), 'Shower room');
  assert.equal(quadrantOf(0, 'Conor'), 'Living room, hallway & stairs');
});

test('every week assigns all four areas, exactly once, nobody doubled up', () => {
  for (let w = 0; w < 200; w++) {
    const quadrants = quadrantsFor(w);
    assert.equal(quadrants.length, PEOPLE.length, 'week ' + w + ' row count');
    assert.equal(new Set(quadrants).size, PEOPLE.length, 'week ' + w + ' duplicates');
    for (const q of quadrants) assert.ok(QUADRANTS.includes(q), 'week ' + w + ' unknown area');
  }
});

test('over any 4-week cycle everybody cleans every area exactly once', () => {
  for (let start = 0; start < 8; start++) {
    for (const person of PEOPLE) {
      const seen = new Set();
      for (let w = start; w < start + 4; w++) seen.add(quadrantOf(w, person));
      assert.equal(seen.size, QUADRANTS.length, person + ' from week ' + start);
    }
  }
});

test('the rotation returns to its starting point after four weeks', () => {
  assert.deepEqual(quadrantsFor(4), quadrantsFor(0));
  assert.deepEqual(quadrantsFor(37), quadrantsFor(1));
});

test('weeks before the start date do not produce undefined areas', () => {
  // A visitor whose clock is wrong, or who opens the page early.
  const earlier = assignmentFor(-1);
  assert.equal(earlier.length, PEOPLE.length);
  for (const row of earlier) assert.ok(QUADRANTS.includes(row.quadrant));
});

/* ==== Calendar maths ============================================= */

test('week numbers land on the right days, including the boundaries', () => {
  const at = (y, m, d) => weekNumberFor(new Date(y, m - 1, d));

  assert.equal(at(2026, 10, 12), 0); // the Monday itself
  assert.equal(at(2026, 10, 18), 0); // the Sunday, still week 1
  assert.equal(at(2026, 10, 19), 1); // next Monday flips it
  assert.equal(at(2026, 10, 25), 1);
  assert.equal(at(2026, 10, 26), 2);
});

test('every week is exactly 7 calendar days, across both clock changes', () => {
  // UK clocks go forward on 29 Mar 2026 and back on 25 Oct 2026. In the
  // naive "subtract the milliseconds" approach these weeks come out as 6 or
  // 8 days and the rota silently skips or repeats. Covering 3 years of weeks
  // crosses several of them.
  let previous = dayNumber(weekStartDate(0));
  for (let w = 1; w < 160; w++) {
    const current = dayNumber(weekStartDate(w));
    assert.equal(current - previous, 7, 'week ' + w + ' is not 7 days');
    previous = current;
  }
});

test('week number and week start date agree with each other', () => {
  for (let w = 0; w < 120; w++) {
    assert.equal(weekNumberFor(weekStartDate(w)), w);
  }
});

test('week start dates roll over months and years', () => {
  // 52 weeks from Mon 12 Oct 2026 is Mon 11 Oct 2027.
  const d = weekStartDate(52);
  assert.equal(d.getFullYear(), 2027);
  assert.equal(d.getMonth(), 9);
  assert.equal(d.getDate(), 11);
});

test('week keys round-trip through their string form', () => {
  for (let w = 0; w < 120; w++) {
    assert.equal(weekFromKey(weekKeyFor(w)), w);
  }
  assert.equal(weekKeyFor(0), '2026-10-12');
  // Zero-padded, so the keys also sort correctly as plain strings.
  assert.equal(weekKeyFor(3), '2026-11-02');
  assert.ok(weekKeyFor(3) < weekKeyFor(4), 'keys must sort chronologically');
});

/* ==== The record ================================================= */

const week = { Sean: { done: true, at: 1 } };

test('an absent entry reads as not done', () => {
  assert.equal(personDone({}, 0, 'Sean'), false);
  assert.equal(personDone({ [weekKeyFor(0)]: week }, 0, 'Sean'), true);
  assert.equal(personDone({ [weekKeyFor(0)]: week }, 0, 'Conor'), false);
});

test('nothing is judged until tracking has actually started', () => {
  assert.deepEqual(trackedWeeks({}, {}, 3), []);
});

test('a week where nobody ticked anything still counts as four misses', () => {
  // This is the whole reason meta.started exists.
  const meta = { started: weekKeyFor(0) };
  assert.deepEqual(trackedWeeks({}, meta, 3), [0, 1, 2]);

  const record = buildRecord({}, [0, 1, 2]);
  for (const row of record) {
    assert.equal(row.done, 0);
    assert.equal(row.missed, 3);
  }
});

test('a gap in the data is not skipped over', () => {
  const weeks = {
    [weekKeyFor(0)]: { Theo: { done: true, at: 1 } },
    [weekKeyFor(2)]: { Theo: { done: true, at: 1 } },
  };
  const meta = { started: weekKeyFor(0) };

  assert.deepEqual(trackedWeeks(weeks, meta, 4), [0, 1, 2, 3]);
});

test('the week in progress is never judged', () => {
  const meta = { started: weekKeyFor(0) };
  const past = trackedWeeks({}, meta, 5);
  for (const w of past) assert.ok(w < 5, 'week ' + w + ' should not be judged yet');
});

test('tracking falls back to the first week with data when meta is missing', () => {
  const weeks = { [weekKeyFor(3)]: { Sean: { done: true, at: 1 } } };
  assert.deepEqual(trackedWeeks(weeks, {}, 6), [3, 4, 5]);
});

test('junk keys in the data are ignored rather than crashing', () => {
  const weeks = {
    nonsense: { Sean: { done: true, at: 1 } },
    '2026-10-12': { Sean: { done: true, at: 1 } },
  };
  assert.deepEqual(trackedWeeks(weeks, {}, 2), [0, 1]);
});

test('the tally counts done and missed correctly', () => {
  const weeks = {
    [weekKeyFor(0)]: {
      Sean: { done: true, at: 1 },
      Theo: { done: true, at: 1 },
      Conor: { done: true, at: 1 },
      'Sean Og': { done: true, at: 1 },
    },
    // week 1: Conor and Sean Og never ticked
    [weekKeyFor(1)]: {
      Sean: { done: true, at: 1 },
      Theo: { done: true, at: 1 },
    },
    // week 2: nobody ticked anything
  };

  const record = buildRecord(weeks, [0, 1, 2]);
  const by = Object.fromEntries(record.map((r) => [r.person, r]));

  assert.deepEqual(by['Sean'], { person: 'Sean', done: 2, missed: 1 });
  assert.deepEqual(by['Theo'], { person: 'Theo', done: 2, missed: 1 });
  assert.deepEqual(by['Conor'], { person: 'Conor', done: 1, missed: 2 });
  assert.deepEqual(by['Sean Og'], { person: 'Sean Og', done: 1, missed: 2 });
});

test('the record always covers every housemate in a stable order', () => {
  const record = buildRecord({}, [0, 1]);
  assert.deepEqual(record.map((r) => r.person), PEOPLE);
});
