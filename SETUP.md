# Hosting it for free, with shared ticks

Two pieces:

- **GitHub Pages** serves the files. Free, but public-only on a free account.
- **Firebase Realtime Database** holds the ticks. Free, no card needed.

The rota itself doesn't need any of this — every phone works out who does
what from the date. Only the ticks need a shared home.

Do the parts in order. Nothing here costs money, and nothing asks for a
payment method.

---

## Part 1 — Put the files on GitHub Pages

1. Create a **public** repository on GitHub. Name it whatever, e.g. `43stran`.
   It has to be public: on a free personal account, GitHub Pages only works
   from public repositories.

2. Upload every file in this folder to the repo, at the top level:

   ```
   index.html   styles.css   script.js
   rota.js      config.js    rota.test.mjs
   ```

   (`README.md`, `SETUP.md` and `firebase-rules.json` are just documentation —
   harmless to include, not needed by the site.)

3. In the repo: **Settings → Pages**.
   - Source: **Deploy from a branch**
   - Branch: **main**, folder **/ (root)**
   - **Save**

4. Wait a minute, then reload that page. It'll show your URL:

   ```
   https://YOUR-USERNAME.github.io/43stran/
   ```

5. Open it. It should work immediately — you'll see the rota with an
   orange "local only · not shared" note in the corner. That's correct so
   far; there's no database yet.

**Comments in the page are public.** Anyone can read `config.js`. That's
expected and fine — see the note at the bottom.

---

## Part 2 — Create the Firebase project

1. Go to <https://console.firebase.google.com> and sign in with a Google
   account. **Create a project.** Any name. You can turn Google Analytics
   off.

2. In the left sidebar, **Build → Realtime Database → Create Database**.

   > Make sure it says **Realtime Database**, not **Firestore**. They're
   > different products that look similar in the menu, and this code only
   > talks to Realtime Database.

3. Pick a location near you (e.g. `europe-west1`).

4. When it asks about security rules, choose **Start in locked mode**.
   Locked mode denies everything, which is the right starting point — we
   paste the real rules in the next step.

---

## Part 3 — Paste the security rules

This is the step that actually protects the data. The rules in
`firebase-rules.json` mean:

- nobody can read or write anything, **except**
- signed-in clients can read the rota, and
- signed-in clients can write a tick, but only in the right shape and only
  under a well-formed week key.

1. Open `firebase-rules.json` from this folder and copy the whole thing.

2. In the Firebase console, go to the **Rules** tab of your Realtime Database.

3. Replace what's there with your copy, then **Publish**.

Without this step the site will show a `permission_denied` error in the
browser console and no ticks will save.

---

## Part 4 — Turn on sign-in, and allow your site

Anonymous sign-in exists purely so the rules can say "signed-in clients
only". Nobody ever sees a login screen — it happens silently on page load.

1. **Build → Authentication → Get started**.

2. **Sign-in method** tab → **Anonymous** → enable it → **Save**.

3. **Settings** tab → **Authorized domains** → **Add domain** → enter:

   ```
   YOUR-USERNAME.github.io
   ```

   `localhost` is already on the list, so local testing keeps working.

   **This step is easy to forget and it fails confusingly.** Without it,
   sign-in is rejected, the page silently falls back to local-only mode,
   and you'll swear the sharing is broken.

---

## Part 5 — Connect the site to the database

1. In the Firebase console, click the **gear icon → Project settings**.

2. Scroll to **Your apps** → click the **`</>`** (Web) button → give it a
   nickname → **Register app**.

3. It shows you a `firebaseConfig` object. Copy the values.

4. Open `config.js` in this folder and replace `null` with that object:

   ```js
   export const FIREBASE_CONFIG = {
     apiKey: 'AIzaSy...',
     authDomain: 'your-project.firebaseapp.com',
     databaseURL: 'https://your-project-default-rtdb.europe-west1.firebasedatabase.app',
     projectId: 'your-project',
     storageBucket: 'your-project.firebasestorage.app',
     messagingSenderId: '1234567890',
     appId: '1:1234567890:web:abcdef123456',
   };
   ```

5. **Check `databaseURL` is there.** If you created the Realtime Database
   *after* registering the web app, Firebase often leaves this line out. If
   it's missing, copy it from the top of the Realtime Database page in the
   console (it looks like `https://your-project-default-rtdb.europe-west1.firebasedatabase.app`).

6. Commit and push. GitHub Pages redeploys in a minute or two.

Reload the page. The corner should now read **"shared with the house"**.

---

## Part 6 — Prove it's actually shared

1. Open the site on your phone. Pick yourself when it asks. Tick your job.
2. Open the same URL on someone else's phone. Pick them. Tick theirs.
3. Both phones should show **both** ticks within about a second.

You can also watch it happen live: Firebase console → Realtime Database →
**Data** tab. You'll see the tree fill in as people tick.

Every device stores only *which housemate it is*, in that browser's
`localStorage`. The ticks themselves come from the database.

---

## Something not working?

Open the browser's developer console (right-click → Inspect → Console) and
look for these:

| What you see | What it means |
|---|---|
| Page still says "local only" | `FIREBASE_CONFIG` is still `null`, or the SDK failed to load |
| `auth/unauthorized-domain` | Part 4, step 3 — add your `github.io` domain |
| `permission_denied` | The rules didn't get published (Part 3) |
| `databaseURL` is undefined | Part 5, step 5 — add it by hand |
| Ticks save here but not there | Both devices on the same URL? Both saying "shared with the house"? |
| Nothing works, opened by double-clicking | Safari blocks `localStorage` on `file://`. Use GitHub Pages, or `python3 -m http.server` locally |
| Ticked, then it vanished on refresh | Private/incognito window — `localStorage` is cleared each session |

---

## Is this secure enough?

Be clear-eyed about what you've built:

- **The rota is readable by anyone who has the URL.** Reading requires a
  signed-in client, but any visitor to the page is silently signed in. It's
  a house rota, not a bank. Don't put anything private in it.
- **Any visitor can write ticks.** Nothing on a static site can stop that,
  because the page runs on the visitor's own machine.
- What the rules *do* prevent is a stranger finding your database's URL and
  wiping it without going through the page, plus any malformed or
  junk data.

If you ever want it genuinely locked down, the next step is mapping each
housemate's Firebase user ID to their name and having the rules enforce
"you may only write your own row". That means real user accounts rather than
anonymous ones. Worth doing as a learning exercise; overkill for a cleaning
rota.

---

## What it costs

Nothing. Firebase's free Spark plan gives 1 GB of storage, 10 GB/month of
downloads and 100 simultaneous connections, and does not require a payment
method. Four people ticking four boxes a week will use a rounding error's
worth of that — roughly 200 bytes a week, against 1,000,000,000 available.

One thing to know about Spark: if you *did* somehow exceed a limit, Firebase
turns that product off for the rest of the month rather than billing you.
You cannot accidentally run up a bill.

GitHub Pages is free with no usage limits for a static site this size.
