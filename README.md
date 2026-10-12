# 43 Stran — cleaning rota

A rota for four people and four areas, with shared ticks so you can see who
has actually done their bit. No build step and no dependencies to install.

```
index.html        structure
styles.css        the minimal monospaced look
rota.js           the rota and the accountability maths — no DOM, fully tested
script.js         storage, rendering and event wiring
config.js         the public settings (Firebase lives here)
rota.test.mjs     tests for rota.js
firebase-rules.json  database security rules, pasted into the Firebase console
SETUP.md          how to host it on GitHub Pages with shared ticks
```

## Running it locally

Double-clicking `index.html` opens it over `file://`, where Safari blocks
`localStorage` and ES modules. Serve it instead:

```sh
python3 -m http.server 8000
```

Then open <http://localhost:8000>. It works straight away, but ticks stay on
this device only until you connect a database — the header will say so.

## Tests

```sh
node --test rota.test.mjs
```

19 tests covering the two things that are easy to get subtly wrong: the
rotation, and the calendar maths across clock changes.

## How the rota works

The rota is never written down. It's calculated from two arrays in `rota.js`:

```js
const PEOPLE    = ['Theo', 'Sean Og', 'Sean', 'Conor'];
const QUADRANTS = ['Kitchen', 'Toilet & landing', 'Shower room', 'Living room, hallway & stairs'];
```

In week 1, `PEOPLE[0]` does `QUADRANTS[0]`, and so on. Every following week
shifts the pairing one step:

```js
QUADRANTS[(i + week) % 4]
```

Because everybody shifts by the *same* amount, no area is ever missed and
nobody is ever given two jobs. After four weeks everyone is back where they
started, having done each area once.

Nothing about this is stored. Each phone works it out from the real date, so
everyone sees the same rota without any syncing at all.

## How the accountability works

Being able to tidy a page is not the same as being held to it, so the design
aims at the **missing** tick rather than the present one:

- **Nothing vanishes on Monday.** Past weeks are kept, and the Record table
  counts done and missed for every week since tracking began.
- **A week where nobody ticked anything still counts.** That's what
  `meta.started` is for. Without it, the worst week of the lot would be the
  one that silently disappeared.
- **Ticks are timestamped** using the *server's* clock, not the phone's, so
  "done at 23:51 on Sunday" is trustworthy.
- **The week in progress is never judged.** An empty box on Wednesday is not
  a miss; it's Wednesday.

Ticking is locked to one housemate per device. Be clear that this is friction,
not security: clearing the browser storage gets round it. It stops accidents
and stops everyone ticking everyone else's row.

## Changing things

| Want to change | Where |
|---|---|
| When week 1 starts | `ROTA_START` at the top of `rota.js` — months are zero-indexed, so `9` means October |
| Who does what in week 1 | Reorder `PEOPLE` — whoever is first gets the kitchen first |
| The areas | `QUADRANTS` in `rota.js` |
| Add a fifth person or area | Add to both arrays. `% 4` isn't hardcoded; it reads the array length. The two arrays must stay the same length or the rotation breaks |
| How many past weeks to list | `HISTORY_LIMIT` in `script.js` |
| Dark mode | Delete the `@media (prefers-color-scheme: dark)` block in `styles.css` |

## Known limits

- `localStorage` is per browser and per device. Until you follow `SETUP.md`,
  ticks are not shared, and the header says so.
- Without a database there's no syncing; with one, there's no offline queue —
  a tick made with no signal fails and the box goes back.
- No reminders. On Firebase's free plan there are no scheduled functions, so
  weekly nudges would need a separate service poking the database on a timer.
