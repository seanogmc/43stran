/* ------------------------------------------------------------------
   43 Stran — cleaning rota

   This file is the plumbing: storage, the DOM, and event wiring. The rota
   arithmetic and the accountability tallies live in rota.js, kept free of
   any DOM so they can be tested on their own.
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

const HISTORY_LIMIT = 8;

function currentWeek() {
  return weekNumberFor(new Date());
}

/* ==== 2. People mapping ========================================== */

const PERSON_EMAILS = {
  Theo: "tmcaleer2k18@gmail.com",
  'Sean Og': "seanogmc@yahoo.com",
  Sean: "seanmcgold1@gmail.com",
  Conor: "cjp.casey05@gmail.com",
};

const EMAIL_TO_PERSON = Object.fromEntries(
  Object.entries(PERSON_EMAILS).map(([name, email]) => [email.toLowerCase(), name])
);

/* ==== 3. Stores ==================================================
   Keep the same shape as before for compatibility with existing logic.
   ------------------------------------------------------------------ */

const EMPTY_DATA = { weeks: {}, meta: {} };

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
      // ignore
    }
    return EMPTY_DATA;
  }

  function persist() {
    try {
      localStorage.setItem(LOCAL_DATA_KEY, JSON.stringify(data));
    } catch {
      // ignore
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

    async write(weekKey, person, done) {
      const week = Object.assign({}, data.weeks[weekKey]);
      if (done) {
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

async function createFirebaseStore(config) {
  const { initializeApp } = await import(FIREBASE_SDK + '/firebase-app.js');
  const {
    getAuth,
    onAuthStateChanged,
    signInWithPopup,
    GoogleAuthProvider,
    signOut,
  } = await import(FIREBASE_SDK + '/firebase-auth.js');
  const {
    getDatabase,
    ref,
    onValue,
    set,
    runTransaction,
    serverTimestamp,
  } = await import(FIREBASE_SDK + '/firebase-database.js');

  const app = initializeApp(config);
  const auth = getAuth(app);
  const db = getDatabase(app);
  const provider = new GoogleAuthProvider();

  const listeners = new Set();
  let user = null;
  let me = null;

  onAuthStateChanged(auth, async (u) => {
    user = u;
    if (u && u.email) {
      me = EMAIL_TO_PERSON[u.email.toLowerCase()] || null;
    } else {
      me = null;
    }
    emitAuth();
    if (u) {
      onValue(ref(db, 'rota'), (snapshot) => {
        const value = snapshot.val() || {};
        for (const fn of listeners) {
          fn({ weeks: value.weeks || {}, meta: value.meta || {} });
        }
      });
    }
  });

  const authListeners = new Set();
  function emitAuth() {
    for (const fn of authListeners) fn({ user, me });
  }

  return {
    mode: 'shared',

    subscribe(fn) {
      listeners.add(fn);
    },

    onAuth(fn) {
      authListeners.add(fn);
      fn({ user, me });
    },

    async signIn() {
      await signInWithPopup(auth, provider);
    },

    async signOut() {
      await signOut(auth);
    },

    async write(weekKey, person, done) {
      if (!user) throw new Error('Not signed in');
      const myName = me;
      if (myName !== person) throw new Error('Not allowed to write other person');
      await set(
        ref(db, 'rota/weeks/' + weekKey + '/' + person),
        done ? { done: true, at: serverTimestamp() } : null
      );
    },

    async startTracking(weekKey) {
      await runTransaction(ref(db, 'rota/meta/started'), (stored) => {
        return stored || weekKey;
      });
    },

    getMe() {
      return me;
    },
  };
}

/* ==== 4. Rendering =============================================== */

const el = {
  mode: document.querySelector('#mode'),
  authSection: document.querySelector('#auth-section'),
  signIn: document.querySelector('#sign-in'),
  authError: document.querySelector('#auth-error'),
  whoamiSection: document.querySelector('#whoami-section'),
  meName: document.querySelector('#me-name'),
  signOut: document.querySelector('#sign-out'),
  mainSection: document.querySelector('#main-section'),
  upnextSection: document.querySelector('#upnext-section'),
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
  me: null,
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

function renderAuth({ user, me }) {
  if (user) {
    el.authSection.hidden = true;
    el.whoamiSection.hidden = false;
    el.mainSection.hidden = false;
    el.upnextSection.hidden = false;
    state.me = me;
    el.meName.textContent = me || user.email;
  } else {
    el.authSection.hidden = false;
    el.whoamiSection.hidden = true;
    el.mainSection.hidden = true;
    el.upnextSection.hidden = true;
    state.me = null;
    el.meName.textContent = '';
  }
  renderRota();
  renderProgress();
  renderRecordAndHistory();
}

function renderAll() {
  renderHead();
  renderRota();
  renderUpNext();
  renderProgress();
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

el.rota.addEventListener('change', function (event) {
  const check = event.target.closest('.task__check');
  if (!check || check.disabled) return;
  store
    .write(weekKeyFor(state.week), check.dataset.person, check.checked)
    .catch(function (error) {
      console.error('Could not save that tick:', error);
      check.checked = !check.checked;
    });
});

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
      renderMode(store);

      el.signIn.addEventListener('click', async () => {
        try {
          el.authError.textContent = '';
          await store.signIn();
        } catch (e) {
          el.authError.textContent = e.message;
        }
      });
      el.signOut.addEventListener('click', async () => {
        try {
          await store.signOut();
        } catch (e) {
          el.authError.textContent = e.message;
        }
      });

      store.onAuth(renderAuth);
      store.subscribe((data) => {
        state.weeks = data.weeks;
        state.meta = data.meta;
        state.week = currentWeek();
        renderAll();
      });

      store.startTracking(weekKeyFor(currentWeek())).catch((e) => {
        console.error('startTracking failed:', e);
      });
    } catch (error) {
      console.error('Could not reach Firebase, falling back to this device only:', error);
      renderMode(store);
      setupLocalOnly();
    }
  } else {
    renderMode(store);
    setupLocalOnly();
  }

  renderCountdown();
  setInterval(tick, 30_000);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) tick();
  });
}

function setupLocalOnly() {
  el.authSection.hidden = true;
  el.whoamiSection.hidden = false;
  el.mainSection.hidden = false;
  el.upnextSection.hidden = false;
  state.me = null;
  el.meName.textContent = 'local only (no auth)';
  el.rota.querySelectorAll('.task__check').forEach((c) => (c.disabled = true));
  store.subscribe((data) => {
    state.weeks = data.weeks;
    state.meta = data.meta;
    state.week = currentWeek();
    renderAll();
  });
  renderAll();
}

main();
