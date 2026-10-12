/* ------------------------------------------------------------------
   43 Stran — cleaning rota

   This file is the plumbing: storage, the DOM, and event wiring. The rota
   arithmetic and the accountability tallies live in rota.js, kept free of
   any DOM so they can be tested on their own.

   The page never talks to localStorage or Firebase directly. It talks to a
   "store" (section 2), so nothing below cares which one is in use.
   ------------------------------------------------------------------ */

import { FIREBASE_CONFIG } from './config.js';
import {
  PEOPLE,
  assignmentFor,
  buildRecord,
  entryFor,
  personDone,
  trackedWeeks,
  weekKeyFor,
  weekNumberFor,
  weekStartDate,
} from './rota.js';

/* ==== 1. Settings ================================================ */

// Pinned on purpose. "Latest" changes under you and breaks the site without
// warning; a specific version keeps working forever.
const FIREBASE_SDK = 'https://www.gstatic.com/firebasejs/12.6.0';

const LOCAL_DATA_KEY = 'rota43.data';
const ME_KEY = 'rota43.me';

// How many past weeks to list. The Record counts all of them regardless.
const HISTORY_LIMIT = 8;

function currentWeek() {
  return weekNumberFor(new Date());
}

/* ==== 2. Stores ==================================================
   A store has exactly three jobs:

     subscribe(fn)                 call fn(data) whenever the data changes
     write(weekKey, person, done)  change one tick
     startTracking(weekKey)        note the week we began keeping score

   Both stores hand back data in the same shape:

     data.weeks = { '2026-10-12': { Sean: { done: true, at: 1760000000000 } } }
     data.meta  = { started: '2026-10-12' }
   ------------------------------------------------------------------ */

const EMPTY_DATA = { weeks: {}, meta: {} };

// ---- The offline store: this device only -------------------------

function createLocalStore() {
  const listeners = new Set();
  let data = read();

  function read() {
    try {
      const raw = JSON.parse(localStorage.getItem(LOCAL_DATA_KEY));
      if (raw && typeof raw.weeks === 'object' && raw.weeks !== null) {
        return { weeks: raw.weeks, meta: raw.meta || {} };
      }
    } catch {
      // Corrupt JSON, or storage blocked in private browsing.
    }
    return EMPTY_DATA;
  }

  function persist() {
    try {
      localStorage.setItem(LOCAL_DATA_KEY, JSON.stringify(data));
    } catch {
      // Storage unavailable — changes just won't survive a refresh.
    }
  }

  function emit() {
    for (const fn of listeners) fn(data);
  }

  return {
    mode: 'local',

    subscribe(fn) {
      listeners.add(fn);
      fn(data);
    },

    // async so it hands back a promise, exactly like the Firebase store's.
    // Callers can then treat both stores identically and use .catch().
    async write(weekKey, person, done) {
      const week = Object.assign({}, data.weeks[weekKey]);
      if (done) {
        // Date.now() is fine here: there's no server to ask, and this data
        // never leaves the device anyway.
        week[person] = { done: true, at: Date.now() };
      } else {
        delete week[person];
      }
      data = {
        weeks: Object.assign({}, data.weeks, { [weekKey]: week }),
        meta: data.meta,
      };
      persist();
      emit();
    },

    async startTracking(weekKey) {
      if (data.meta.started) return;
      data = { weeks: data.weeks, meta: { started: weekKey } };
      persist();
      emit();
    },
  };
}

// ---- The shared store: everybody's ticks -------------------------

async function createFirebaseStore(config) {
  // Loaded with a dynamic import rather than a plain one at the top of the
  // file. That way, if config.js is still empty, the browser never downloads
  // the Firebase SDK at all.
  const { initializeApp } = await import(FIREBASE_SDK + '/firebase-app.js');
  const { getAuth, signInAnonymously } = await import(FIREBASE_SDK + '/firebase-auth.js');
  const { getDatabase, ref, onValue, set, runTransaction, serverTimestamp } =
    await import(FIREBASE_SDK + '/firebase-database.js');

  const app = initializeApp(config);

  // Anonymous sign-in. Nobody ever sees a login screen — this exists purely
  // so the security rules can say "signed-in clients only", which keeps a
  // stranger who stumbles on the URL from wiping the rota.
  await signInAnonymously(getAuth(app));

  const db = getDatabase(app);

  return {
    mode: 'shared',

    // One listener on the whole tree. Four ticks a week is a tiny amount of
    // data, and subscribing to all of it at once means there is exactly one
    // place the UI gets its truth from.
    subscribe(fn) {
      onValue(
        ref(db, 'rota'),
        function (snapshot) {
          const value = snapshot.val() || {};
          fn({ weeks: value.weeks || {}, meta: value.meta || {} });
        },
        function (error) {
          console.error('Could not read the database:', error);
        }
      );
    },

    async write(weekKey, person, done) {
      // null deletes the node, which is what "untick" means here.
      await set(
        ref(db, 'rota/weeks/' + weekKey + '/' + person),
        done ? { done: true, at: serverTimestamp() } : null
      );
    },

    async startTracking(weekKey) {
      // runTransaction re-runs if another device writes at the same moment.
      // Without it, two phones opening the page on either side of midnight
      // could disagree about when tracking started.
      await runTransaction(ref(db, 'rota/meta/started'), function (stored) {
        return stored || weekKey;
      });
    },
  };
}

/* ==== 3. Which housemate is this device? ========================= */

function loadMe() {
  let name = null;
  try {
    name = localStorage.getItem(ME_KEY);
  } catch {
    name = null;
  }
  // Guard against a stale name left over from an edited PEOPLE list.
  return PEOPLE.includes(name) ? name : null;
}

function saveMe(name) {
  try {
    localStorage.setItem(ME_KEY, name);
  } catch {
    // Not fatal: they'll just be asked again next time.
  }
}

/* ==== 4. Rendering =============================================== */

const el = {
  mode: document.querySelector('#mode'),
  meName: document.querySelector('#me-name'),
  changeMe: document.querySelector('#change-me'),
  weekNumber: document.querySelector('#week-number'),
  weekDates: document.querySelector('#week-dates'),
  rota: document.querySelector('#rota'),
  progress: document.querySelector('#progress'),
  upnext: document.querySelector('#upnext'),
  recordSection: document.querySelector('#record-section'),
  record: document.querySelector('#record'),
  recordNote: document.querySelector('#record-note'),
  historySection: document.querySelector('#history-section'),
  history: document.querySelector('#history'),
  resets: document.querySelector('#resets'),
  picker: document.querySelector('#picker'),
  pickerList: document.querySelector('#picker-list'),
};

const shortDate = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});

const longDate = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

const atTime = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

const state = {
  weeks: {},
  meta: {},
  me: loadMe(),
  week: currentWeek(),
};

function weekRangeLabel(week) {
  const start = weekStartDate(week);
  const end = weekStartDate(week + 1);
  end.setDate(end.getDate() - 1);
  return shortDate.format(start) + ' – ' + longDate.format(end);
}

function buildRow(person, quadrant, entry, isMine) {
  const item = document.createElement('li');
  item.className = 'task';
  if (!isMine) item.classList.add('task--locked');

  const label = document.createElement('label');
  label.className = 'task__label';

  const check = document.createElement('input');
  check.type = 'checkbox';
  check.className = 'task__check';
  check.checked = Boolean(entry && entry.done);
  check.disabled = !isMine;
  check.dataset.person = person;
  if (!isMine) item.title = 'Only ' + person + ' can tick this one';

  const body = document.createElement('span');
  body.className = 'task__body';

  const personEl = document.createElement('span');
  personEl.className = 'task__person';
  personEl.textContent = person;

  const quadrantEl = document.createElement('span');
  quadrantEl.className = 'task__quadrant';
  quadrantEl.textContent = quadrant;

  // The timestamp is the evidence: it says when the box was ticked, which is
  // the difference between "done" and "done at 23:51 on Sunday night".
  const atEl = document.createElement('span');
  atEl.className = 'task__at';
  if (entry && entry.done && Number.isFinite(entry.at)) {
    const when = new Date(entry.at);
    const time = document.createElement('time');
    time.dateTime = when.toISOString();
    time.textContent = atTime.format(when);
    atEl.append(time);
  }

  body.append(personEl, quadrantEl, atEl);
  label.append(check, body);
  item.append(label);

  if (entry && entry.done) item.classList.add('task--done');
  return item;
}

function renderHead() {
  el.weekNumber.textContent = String(state.week + 1);
  el.weekDates.textContent = weekRangeLabel(state.week);
}

function renderRota() {
  el.rota.replaceChildren();
  for (const { person, quadrant } of assignmentFor(state.week)) {
    const entry = entryFor(state.weeks, state.week, person);
    el.rota.append(buildRow(person, quadrant, entry, person === state.me));
  }
}

function renderUpNext() {
  el.upnext.replaceChildren();
  for (const { person, quadrant } of assignmentFor(state.week + 1)) {
    const item = document.createElement('li');
    item.textContent = person + ' → ' + quadrant;
    el.upnext.append(item);
  }
}

function renderProgress() {
  const done = PEOPLE.filter((p) => personDone(state.weeks, state.week, p)).length;
  const complete = done >= PEOPLE.length;

  el.progress.textContent = complete
    ? 'All four done. Nice one.'
    : done + ' of ' + PEOPLE.length + ' done this week';
  el.progress.classList.toggle('progress--complete', complete);
}

function renderWho() {
  el.meName.textContent = state.me || 'nobody yet';
  el.changeMe.textContent = state.me ? 'not you?' : 'choose';
}

function renderMode(store) {
  const shared = store.mode === 'shared';
  el.mode.textContent = shared ? 'shared with the house' : 'local only · not shared';
  el.mode.classList.toggle('masthead__status--warn', !shared);
}

function renderRecordAndHistory() {
  const past = trackedWeeks(state.weeks, state.meta, state.week);

  if (past.length === 0) {
    el.recordSection.hidden = true;
    el.historySection.hidden = true;
    return;
  }

  el.recordSection.hidden = false;
  el.historySection.hidden = false;

  // ---- the tally ----
  const rows = buildRecord(state.weeks, past);

  const table = document.createElement('table');
  table.className = 'record__table';

  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  for (const heading of ['', 'done', 'missed']) {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = heading;
    headRow.append(th);
  }
  thead.append(headRow);

  const tbody = document.createElement('tbody');
  for (const row of rows) {
    const tr = document.createElement('tr');

    const name = document.createElement('th');
    name.scope = 'row';
    name.textContent = row.person;

    const done = document.createElement('td');
    done.textContent = String(row.done);

    const missed = document.createElement('td');
    missed.textContent = String(row.missed);
    if (row.missed > 0) missed.className = 'record__missed';

    tr.append(name, done, missed);
    tbody.append(tr);
  }

  table.append(thead, tbody);
  el.record.replaceChildren(table);
  el.recordNote.textContent =
    past.length === 1
      ? 'Counting the 1 completed week so far.'
      : 'Counting the ' + past.length + ' completed weeks so far.';

  // ---- recent weeks, newest first ----
  const recent = past.slice(-HISTORY_LIMIT).reverse();

  el.history.replaceChildren();
  for (const week of recent) {
    const missed = PEOPLE.filter((p) => !personDone(state.weeks, week, p));

    const row = document.createElement('li');
    row.className = 'history__row';

    const label = document.createElement('span');
    label.className = 'history__week';
    label.textContent = 'Week ' + (week + 1) + ' · ' + weekRangeLabel(week);

    const result = document.createElement('span');
    result.className = 'history__result';
    if (missed.length) {
      result.classList.add('history__result--missed');
      result.textContent = 'missed: ' + missed.join(', ');
    } else {
      result.textContent = 'all done';
    }

    row.append(label, result);
    el.history.append(row);
  }
}

function renderAll() {
  renderHead();
  renderRota();
  renderUpNext();
  renderProgress();
  renderWho();
  renderRecordAndHistory();
}

/* ==== 5. Countdown =============================================== */

function renderCountdown() {
  const msLeft = weekStartDate(state.week + 1).getTime() - Date.now();

  if (msLeft <= 0) {
    el.resets.textContent = 'New week starting…';
    return;
  }

  const minutes = Math.floor(msLeft / 60_000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const next = 'Week ' + (state.week + 2) + ' starts in ';

  el.resets.textContent =
    days > 0
      ? next + days + 'd ' + hours + 'h'
      : next + hours + 'h ' + (minutes % 60) + 'm';
}

/* ==== 6. Interaction ============================================= */

function openPicker() {
  el.pickerList.replaceChildren();
  for (const person of PEOPLE) {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'submit'; // inside <form method="dialog">
    button.value = person; // becomes picker.returnValue
    button.className = 'picker__choice';
    button.textContent = person;
    item.append(button);
    el.pickerList.append(item);
  }
  if (!el.picker.open) el.picker.showModal();
}

// One listener on the whole list rather than one per checkbox. 'change'
// bubbles, so this catches every tick, including ones that don't exist yet.
el.rota.addEventListener('change', function (event) {
  const check = event.target.closest('.task__check');
  if (!check || check.disabled) return;

  // No local mutation here on purpose. The store is the single source of
  // truth, so we change it and let the redraw come back from the data.
  store
    .write(weekKeyFor(state.week), check.dataset.person, check.checked)
    .catch(function (error) {
      console.error('Could not save that tick:', error);
      check.checked = !check.checked; // put the box back how it was
    });
});

el.changeMe.addEventListener('click', openPicker);

el.picker.addEventListener('close', function () {
  const chosen = el.picker.returnValue;
  if (!PEOPLE.includes(chosen)) return;
  state.me = chosen;
  saveMe(chosen);
  renderAll();
});

/* ==== 7. Start ===================================================
   `store` is declared out here because the change handler above needs it.
   ------------------------------------------------------------------ */

let store = createLocalStore();

function checkForNewWeek() {
  const week = currentWeek();
  if (week === state.week) return;
  state.week = week;
  renderAll();
}

function tick() {
  checkForNewWeek();
  renderCountdown();
}

async function main() {
  if (FIREBASE_CONFIG) {
    try {
      store = await createFirebaseStore(FIREBASE_CONFIG);
    } catch (error) {
      console.error('Could not reach Firebase, falling back to this device only:', error);
    }
  }

  renderMode(store);

  store.subscribe(function (data) {
    state.weeks = data.weeks;
    state.meta = data.meta;
    state.week = currentWeek();
    renderAll();
  });

  // Tells the database the week we started judging from, so a week where
  // nobody ticked anything still shows up as four misses. Not awaited — the
  // page shouldn't sit blank while this lands.
  store.startTracking(weekKeyFor(currentWeek())).catch(function (error) {
    console.error('Could not record the tracking start week:', error);
  });

  renderCountdown();
  setInterval(tick, 30_000);

  // Browsers throttle timers in background tabs, so also re-sync the moment
  // the tab comes back to the front.
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) tick();
  });

  // First time on this device: ask who they are before they can tick.
  if (!state.me) openPicker();
}

main();
