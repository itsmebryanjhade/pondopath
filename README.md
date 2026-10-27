# PondoPath by SoloForge — Cash-Flow Action Planner

A one-business Philippine B2B hackathon MVP connecting collections, a 30-day cash forecast, and reviewed follow-up actions. Scope is defined in the [PRD](docs/superpowers/specs/SoloForge_Cash-Flow_Action_Planner_PRD_v1.0.md) and [implementation plan](docs/superpowers/plans/2026-10-27-cash-flow-action-planner.md).

PondoPath is the product; SoloForge is the builder brand. The transparent logo mark is in `public/brand/pondopath-mark.png`. Sign-in and the workspace share this identity. Login feedback uses accessible, dismissible notifications; a successful sign-in notice is consumed on the first overview navigation.

Tasks 1–5 establish the money/date and forecast engines, authenticated persistence, atomic record-saving and actual-payment commands, and a minimal protected workspace. Record-entry screens, reminder review, AI assistance, and automation remain subsequent tasks.

## Local setup

Use Node.js **24.x** and npm. Check `node --version` before running `npm ci`. Copy `.env.example` to `.env.local` only if a local file does not already exist. The Supabase URL and publishable key are public configuration; the service-role key, OpenRouter key and automation token must remain server-only.

The authorized development project is **soloforge-cashflow-dev** in Singapore, ref `vhdokiicswumirqxmbpn`. Apply the versioned SQL in `supabase/migrations/` through the documented Supabase migration workflow; do not recreate tables manually or apply development fixtures to a production database. The CLI-generated filenames are aligned with the actual hosted migration versions.

```sh
node scripts/seed-demo.mjs
npm run dev
```

The seed command refuses other projects and real businesses. It provisions two fictional, email-confirmed accounts without sending signup emails. It writes their `DEMO_OWNER_EMAIL` / `DEMO_OWNER_PASSWORD` and `DEMO_FINANCE_EMAIL` / `DEMO_FINANCE_PASSWORD` to ignored `.env.local`, together with the actual `AUTOMATION_BUSINESS_ID`. Re-running preserves existing records and credentials; it is not a data-reset command.

Open [localhost:3000](http://localhost:3000). Sign in with one of those local demo accounts. The demo clearly labels its fixed **2026-10-26** financial reference date. Opening cash is PHP 40,000, an expected invoice is PHP 50,000 on October 29, and October 30 obligations total PHP 80,000. These are fictional values, not observed business results.

## Checks

```sh
npm run test:unit
npm run test:integration
npm run typecheck
npm run lint
npm run build
```

Integration tests require a separate ignored `.env.test.local`:

```dotenv
TEST_ENVIRONMENT=isolated-development
TEST_SUPABASE_URL=https://vhdokiicswumirqxmbpn.supabase.co
TEST_SUPABASE_PUBLISHABLE_KEY=<development publishable key>
TEST_SUPABASE_SERVICE_ROLE_KEY=<development server key>
```

Missing test configuration fails the integration command. The suite signs in actual isolated owner/finance accounts and creates a separate unrelated test business. Cleanup is restricted to the IDs and ownership marker created by each fixture. It does not reset the project or delete the seeded business.

All exposed tables have RLS and explicitly denied direct application writes. Authorized RPC reads derive the business and current role from database membership. Public RPC wrappers run as the invoker; their narrowly scoped private implementations reauthorize and use an empty search path. Financial reads use the signed-in user's client, not the administrative key.

Actual receipts and expense payments update balances together. Exact request retries replay the original result. Nonempty payment references are normalized and reserved even after an owner voids a mistaken entry; replacements require a new reference. A same-record, same-date, same-amount entry requires a reasoned duplicate review. Voids retain history, preserve the latest customer promise for review, and restore the unpaid balance without treating it as expected cash.

Money uses safe integer centavos; promises are distinct from actual cash. Forecasts use Asia/Manila date-only values. Actual audit, session and automation timestamps remain real wall-clock time.

The production build downloads Google Fonts and needs network access. Next.js Cache Components and Partial Prefetching remain enabled. Node-RED will run separately from Next.js/Vercel. Read [AGENTS.md](AGENTS.md) before implementation.
