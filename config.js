/* ------------------------------------------------------------------
   Public configuration for 43 Stran.

   THIS FILE IS PUBLIC. It is served to every visitor's browser and
   anyone can read it with "View source".

   That is fine, and it is deliberate: a Firebase config is an
   *identifier*, not a password. It tells the browser which database to
   talk to. What actually stops strangers writing to that database is the
   security rules — see SETUP.md.

   So: never put a password, an API token or a private key in this file,
   because there is nowhere on a static site to hide it.
   ------------------------------------------------------------------ */

// Paste your project's config object here in place of null.
// Firebase console -> Project settings -> Your apps -> SDK setup and config.
//
// If this stays null the site still works, but ticks are kept only on the
// device that made them and nothing is shared. The header will say so.

export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBS7jNXQlwtXnsXN5CThKibVJYXiwaeReo",
  authDomain: "stran-rota.firebaseapp.com",
  databaseURL:
    "https://stran-rota-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "stran-rota",
  storageBucket: "stran-rota.firebasestorage.app",
  messagingSenderId: "164303512153",
  appId: "1:164303512153:web:4c67c5981afe9e30588748",
};

/*
export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSy...',
  authDomain: 'your-project.firebaseapp.com',
  databaseURL: 'https://your-project-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'your-project',
  storageBucket: 'your-project.firebasestorage.app',
  messagingSenderId: '1234567890',
  appId: '1:1234567890:web:abcdef123456',
};
*/
