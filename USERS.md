# Adding users to the Realtime Database

The rules require a mapping: `/users/{uid}` must store the housemate name for that Google account. This is how the app knows who you are, and more importantly, how Firebase enforces "you can only tick your own row".

You have to set this in the Firebase console (rules block direct writes from the site). Here's exactly how to do it, step by step.

## Step 1: Get each person's UID (one per person)

1. Open the site in an Incognito/Private window: [https://seanogmc.github.io/43stran/](https://seanogmc.github.io/43stran/)
2. Click "Sign in with Google"
3. Sign in as **Theo** (using his Google account)
4. Go to [Firebase Console → Authentication → Users](https://console.firebase.google.com/u/0/project/stran-rota/authentication/users)
5. You'll see Theo appear in the list. Copy his **User UID** (long string like `Ab9XfY2k...`). Keep it safe.
6. Sign out on the site, close that incognito window. Repeat 1-5 for Sean Og, Sean (and Conor when ready). You'll end up with 3 UIDs.

## Step 2: Create the `/users` structure in the database

1. Go to [Realtime Database → Data](https://console.firebase.google.com/u/0/project/stran-rota/database/stran-rota-default-rtdb/data)
2. If you see nothing, or just `rota` exists, click the **+** (Add data) button at the root level.
3. For **Name** (key), type `users` and leave **Value** as an empty object `{}` (or just create it). Click Add.
4. Expand `users` so it's visible.

## Step 3: Add each person under their UID

For each person:

1. Under `users`, click the **+** button (to add a child)
2. **Name (key)**: paste the full UID you copied for that person (e.g. `Ab9XfY2kR...`)
3. **Value (JSON/object)**: paste this exact JSON for Theo:

   ```json
   {"name": "Theo"}
   ```

   For Sean Og:
   ```json
   {"name": "Sean Og"}
   ```

   For Sean:
   ```json
   {"name": "Sean"}
   ```

   For Conor (when added):
   ```json
   {"name": "Conor"}
   ```

4. Click **Add**.

When you're done, the structure should look like:

```json
{
  "rota": { ... },
  "users": {
    "UID_FOR_THEO": { "name": "Theo" },
    "UID_FOR_SEANOG": { "name": "Sean Og" },
    "UID_FOR_SEAN": { "name": "Sean" }
  }
}
```

(Conor can be added later - no code changes needed, just add his mapping once you have his UID.)

## Notes

- You must do this in the Firebase console. The rules set `.write: "false"` on `/users` to prevent anyone from self-assigning a name (that would break the security model).
- Once mapped, when that person signs in with Google, the site will know who they are and only unlock their own tick box.
- If someone signs in with a Google account that isn't mapped, they'll be signed in but won't be able to tick anything (the boxes stay locked). That's by design.
