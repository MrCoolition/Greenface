# Greenface

Little choices. Big adventures. A playful React app for celebrating school behavior with stars, family rewards, and virtual geography adventures.

## Run locally

```sh
npm ci
npm run dev
```

Starts with a clearly labeled sample adventure. Choose **Make it yours** to set a device PIN, enter a nickname, and start with zero stars. Local progress survives reloads; no account is required for device storage.

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
- One face per school date; use kindness bonuses on weekends. Historical check-ins never recalculate stars already earned on later days.
- Bonuses and consequences require a reason and don't affect the school streak. Only the single most recent action can be undone.
- Rewards and first virtual visits spend stars after parent approval. Visits unlock a fact and passport stamp. Reopening an explored place is free. No travel bookings or purchases occur.
- Parent controls support custom rewards, settings, JSON backup/restore, and a confirmed fresh start.

The four-digit PIN is a device-level child interaction guard, hashed in browser storage. It is separate from the server's family passphrase and unlocks controls for ten minutes. PINs and session credentials are excluded from adventure backups. Save your family code and passphrase securely; there is no email recovery service.

## Assets and accessibility

The supplied animated Greenface GIF is the mascot; reduced motion uses its static first frame. Embedded geography comes from public-domain Natural Earth/US Census data distributed through `world-atlas` and `us-atlas` (ISC). Maps require no external service. Icons are Lucide; fonts are DM Sans and Fredoka with system fallbacks. Map markers support keyboards. Dialogs trap focus; optional celebration sounds, read-aloud encouragement, and live announcements support different ways of exploring.
