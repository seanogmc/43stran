How to add users to Realtime Database

1. Go to Firebase Console → Realtime Database → Data tab
2. Click the + button next to "rota" (or at root level) and add:
   - If first time: create `/users` as an object? Or just add children under it.

But easier: expand to see structure. You need:
- /users
  - {uid1}: { name: "Theo" }
  - {uid2}: { name: "Sean Og" }
  - {uid3}: { name: "Sean" }
  - {uid4}: { name: "Conor" } (when ready)

To get UIDs:
- Go to Authentication → Users tab. When someone signs in via Google for the first time, their entry appears there with User UID.

Steps:
1. Open the site in an incognito window and sign in as Theo (using his Google account). 
2. Check Authentication → Users — you'll see theo's UID (e.g. abc123...)
3. Go to Realtime DB → Data → click + on root → key "users" (if doesn't exist), then under users click + → key = UID from step 2, value = {"name":"Theo"}
4. Repeat for Sean Og, Sean. Add Conor later.

Rules enforce: only the mapped user can tick their own name. The /users write is false in rules (so you must set via console).
