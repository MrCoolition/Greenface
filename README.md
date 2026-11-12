# Greenface

Little choices. Big adventures. A playful React app for celebrating school behavior with stars, family rewards, and virtual geography adventures.

## Run locally

```sh
npm ci
npm run dev
```

Starts empty: zero stars, no school faces, and no streak. Only a parent-approved saved check-in awards a face or its stars. Set a device PIN in the grown-up zone, then use **Make it personal** to enter a nickname. Local progress survives reloads; no account is required for device storage. Older preloaded sample faces and stars are removed automatically while genuine parent-entered records are preserved.

```sh
npm test
npm run build
```

## Vercel and Neon

The existing **greenface** Vercel project deploys pushes to `main`. `vercel.json` selects Vite and publishes `dist`. Root `api/*.js` endpoints run as Vercel Node Functions.

Production needs these **server-only** environment variables:

- `neon_connect` (existing setting), `DATABASE_URL`, or `POSTGRES_URL`: a Neon PostgreSQL connection string beginning with `postgresql://` or `postgres://`.
- `SESSION_SECRET`: a random signing secret of at least 32 characters. Preview and development should use separate secrets and databases.

Never prefix credentials with `VITE_` or commit environment files. For local cloud development, link the Vercel project, provide development-scoped secrets, and use `vercel dev` to run functions alongside Vite. `npm run dev` alone uses device storage.

The first account request safely creates the tables in `database/schema.sql`; no manual migration is needed. `/api/status` reports configuration availability. Creating a family verifies the connection. The browser never receives database credentials. Family accounts use salted scrypt passphrase hashes, signed HttpOnly cookies, same-origin mutation checks, database-backed account rate limits, and revision checks to prevent lost updates. Sessions last eight hours.

Choose **Grown-up zone → Family cloud** to create a family or join on another device. Creation uploads the current adventure; login loads that family's cloud adventure. Other-device changes appear on refocus/reload; concurrent writes trigger a refresh instead of silently overwriting data.

## Star rules

- Green starts at **+10**. Three consecutive green school days earn **2×** stars; five or more earn **3×**. Weekends don't break a streak; missing weekdays do.
- Yellow starts at **0**, red at **−5**. Both reset the streak. Losses stop at zero. Grown-ups can adjust these values.
- One face per school date; use kindness bonuses on weekends. **Grown-up zone → School grades** opens a calendar to add, edit, or remove any school day's grade. Corrections recalculate affected green-day streaks and bonuses.
- Bonuses and consequences require a reason and don't affect the school streak. Only the single most recent action can be undone; the School grades calendar can correct any saved grade at any time.
- Rewards and first virtual visits spend stars after parent approval. Visits unlock a fact and passport stamp. Reopening an explored place is free. No travel bookings or purchases occur.
- Parent controls support custom rewards, settings, JSON backup/restore, and a confirmed fresh start.

## Add your own places

Choose **Adventure map → Add a place** (or **Grown-up zone → Add a place**) and enter your parent PIN. Give the place a name, country or area, star cost, and stamp. Select USA for mainland destinations or World for islands and international places, then tap the map to drop a pin. The map also supports Enter and arrow keys; **Enter exact coordinates** allows a precise location. Add an optional little discovery to read aloud during the virtual visit.

Custom places appear on the map and in the destination cards. They use the same parent-approved star spending and passport stamps as built-in places. Family cloud, local storage, and backups preserve them. Adding a place doesn't spend stars. Existing adventures and backups continue to work. Turks & Caicos and Holmes Beach, Florida are also included as built-in destinations.

## Destination prices

Everyday treats and travel have different scales: ice cream remains 30 stars; Holmes Beach starts at 1,500, Yellowstone at 6,000, and international trips range into the tens of thousands. These are adjustable family goals, not monetary quotes or travel bookings.

Open **Grown-up zone → Place prices**, choose any destination, and set its cost. You can also choose **Set this place’s star price** inside a destination. Each change requires a fresh PIN approval. Custom places support costs up to 100,000 stars. Changes apply to future unlocks and preserve existing stars and passport receipts.

## Reset faces and unapproved trips

Open **Grown-up zone → Reset progress**. **Reset all faces** clears every school grade and streak and recalculates stars without awarding or refunding stars. It preserves the passport and redeemed rewards. **Clear faces, stars & trips** also empties the star jar, passport, redeemed rewards, and progress history. Both keep the child's name, point settings, rewards menu, and custom destinations. Confirm your selection and enter your PIN to apply it.

There is no timed parent unlock. Every grade save/correction/removal, star adjustment, reward, trip, undo, and reset requires a new PIN approval. Sound can be toggled by the child. Closing the approval dialog cancels the pending action. Refresh tabs opened before this update; older cloud clients are prevented from saving progress until refreshed.

The four-digit PIN is a device-level child interaction guard, hashed in browser storage. Each change to school grades, stars, rewards, visits, places, settings, resets, or restored progress requires a fresh PIN approval. It is separate from the server's family passphrase. PINs and session credentials are excluded from adventure backups. Save your family code and passphrase securely; there is no email recovery service.

Refresh any Greenface tabs opened before this parent-control update. Cloud saves from older tabs are rejected with `UPDATE_REQUIRED` until refreshed. This version check blocks outdated controls; family-session authentication remains separate.

## Assets and accessibility

The supplied animated Greenface GIF is the mascot; reduced motion uses its static first frame. Embedded geography comes from public-domain Natural Earth/US Census data distributed through `world-atlas` and `us-atlas` (ISC). Maps require no external service. Icons are Lucide; fonts are DM Sans and Fredoka with system fallbacks. Map markers support keyboards. Dialogs trap focus; optional celebration sounds, read-aloud encouragement, and live announcements support different ways of exploring.
