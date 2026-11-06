# Development setup

Run these commands from the repository root.

## Local setup

Use Node.js **24.x** and npm. Check `node --version` before running `npm ci`. Copy `.env.example` to `.env.local` only if a local file does not already exist. The Supabase URL and publishable key are public configuration; the service-role key, OpenRouter key and automation token must remain server-only.

See [database configuration and migration boundaries](database.md) before changing the development database.

```sh
node scripts/seed-demo.mjs
npm run dev
```

The seed command refuses other projects and real businesses. It provisions two fictional, email-confirmed accounts without sending signup emails. It writes their `DEMO_OWNER_EMAIL` / `DEMO_OWNER_PASSWORD` and `DEMO_FINANCE_EMAIL` / `DEMO_FINANCE_PASSWORD` to ignored `.env.local`, together with the actual `AUTOMATION_BUSINESS_ID`. Re-running preserves existing records and credentials; it is not a data-reset command.

Open [localhost:3000](http://localhost:3000). Sign in with one of those local demo accounts. The demo clearly labels its fixed **2026-10-29** financial reference date and **2026-10-26** opening cutoff. Opening cash is PHP 40,000, an expected invoice is PHP 50,000 on October 29, and October 30 obligations total PHP 80,000. These are fictional values, not observed business results.

## Connect Google (optional)

Connect Google needs a Google Cloud **Web application** OAuth client (Testing mode is enough for development and the demo), the Google Picker API, and a browser API key restricted to the Picker and this site's origins. Register `http://localhost:3000` as a JavaScript origin and `http://localhost:3000/api/google/callback` as a redirect URI; add the deployed address the same way. Server-only `.env.local` values: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_TOKEN_ENCRYPTION_KEY` (32 random bytes, base64) and `GOOGLE_SYNC_CRON_SECRET`; `GOOGLE_PICKER_API_KEY` and `GOOGLE_PROJECT_NUMBER` are public by design. Keep the encryption key identical everywhere: a different key cannot open stored sign-ins. Never commit downloaded `client_secret_*.json` files (they are git-ignored). After deployment, schedule the sync with [supabase/cron/google-sync.sql](../supabase/cron/google-sync.sql).

Next: [testing and isolated fixtures](testing.md), or the separate [worker runbook](../automation/README.md).
