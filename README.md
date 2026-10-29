# PondoPath by SoloForge — Cash-Flow Action Planner

A one-business Philippine B2B hackathon MVP connecting collections, a 30-day cash forecast, and reviewed follow-up actions. Scope is defined in the [PRD](docs/superpowers/specs/SoloForge_Cash-Flow_Action_Planner_PRD_v1.0.md) and [implementation plan](docs/superpowers/plans/2026-10-27-cash-flow-action-planner.md).

PondoPath is the product; SoloForge is the builder brand. The transparent PP monogram is `public/brand/pondopath-monogram.png`; its simpler small-size companion is `public/brand/pondopath-icon.png`, used by notifications and the browser icon. Landing, sign-in, loading and workspace screens share the monogram through `ProductBrand`. The earlier blue mark remains as a historical asset. Sign-in errors appear beside the form; a dismissible successful sign-in notice is consumed on the first overview navigation.

## Private team access

Sign in at `/login`. New teammates join at `/signup` using a private owner-provided invitation; opening `/signup` without that link explains how to request access. This user-approved scope addition is recorded in the [onboarding plan](docs/superpowers/plans/2026-10-27-invite-only-onboarding.md).

Owners can choose **Invite a teammate** in the workspace, enter the recipient's name and work email, and copy the generated link. Share it privately with that person. No email is sent automatically. The invited account receives finance access in that owner's workspace; the invitation cannot transfer an existing membership or create an owner. Existing activated accounts should sign in instead.

Set `APP_URL` to the application's trusted origin (for example `http://localhost:3000` in development, an HTTPS origin in production). Invitation links use this address, so a localhost link works only on the same computer. Supabase Auth controls invitation expiry and one-use verification. The token is kept in the URL fragment, consumed only by the password setup POST, and never written to application logs. If setup is interrupted after verification, the same authenticated invited session can retry setting its password. Missing workspace membership still blocks access.

The core includes persistent financial records, verified partial payments, a 30-day forecast, reviewed commitments/reminders, follow-ups, history, what-if previews, English/Tagalog/Taglish AI assistance and the Node-RED missed-commitment flow. Some reminder UI checks and final MVP verification remain outstanding; full verification and demo/deployment preparation are paused at the owner's request.

[PRD revision 1.1](docs/superpowers/specs/SoloForge_Cash-Flow_Action_Planner_PRD_v1.0.md) and implementation tasks 13–21 now track the approved next-action worklist, shared Review Inbox, CSV/XLSX import, planned n8n spreadsheet/file connections, receipt-image extraction, supported inbound business messages and a conditional named accounting/POS adapter. These additions are not implemented. Deliver one reviewed slice at a time; keep manual operation and human confirmation before financial changes.

## Local setup

Use Node.js **24.x** and npm. Check `node --version` before running `npm ci`. Copy `.env.example` to `.env.local` only if a local file does not already exist. The Supabase URL and publishable key are public configuration; the service-role key, OpenRouter key and automation token must remain server-only.

The authorized development project is **soloforge-cashflow-dev** in Singapore, ref `vhdokiicswumirqxmbpn`. Apply the versioned SQL in `supabase/migrations/` through the documented Supabase migration workflow; do not recreate tables manually or apply development fixtures to a production database. The CLI-generated filenames are aligned with the actual hosted migration versions.

```sh
node scripts/seed-demo.mjs
npm run dev
```

The seed command refuses other projects and real businesses. It provisions two fictional, email-confirmed accounts without sending signup emails. It writes their `DEMO_OWNER_EMAIL` / `DEMO_OWNER_PASSWORD` and `DEMO_FINANCE_EMAIL` / `DEMO_FINANCE_PASSWORD` to ignored `.env.local`, together with the actual `AUTOMATION_BUSINESS_ID`. Re-running preserves existing records and credentials; it is not a data-reset command.

Open [localhost:3000](http://localhost:3000). Sign in with one of those local demo accounts. The demo clearly labels its fixed **2026-10-29** financial reference date and **2026-10-26** opening cutoff. Opening cash is PHP 40,000, an expected invoice is PHP 50,000 on October 29, and October 30 obligations total PHP 80,000. These are fictional values, not observed business results.

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

Confirming a receipt plan supersedes its previous expectation, retains the full customer message, and reuses or creates an assigned follow-up. Only one remaining amount/date is selected; a partial promise leaves the remainder visibly unplanned. Past dates need review and contribute no future cash. Completing an unpaid invoice's follow-up requires an outcome and a next assigned action/date. Invoice history retains the changes and links to actual payment records, including voids. What-if previews make no writes and clear when discarded or when leaving the page.

The production build downloads Google Fonts and needs network access. Next.js Cache Components and Partial Prefetching remain enabled. Node-RED will run separately from Next.js/Vercel. Read [AGENTS.md](AGENTS.md) before implementation.

## AI assistant

The workspace's **AI assistant** button opens English/Tagalog/Taglish explanations, customer-reply proposals and editable reminder drafts. It uses the server-only OpenRouter settings in `.env.example`, with `APP_URL` matching the browser origin (locally, `http://localhost:3000`). The current evaluated configuration is GPT-4.1 mini through the `openai` provider, with fallback routing disabled. Only fictional demo businesses are enabled; real-data use requires a separate privacy/operations review.

The assistant never posts payments, changes records, approves reminders or sends messages. Reviewed proposals use the existing receipt-plan/draft forms. A shared database allowance limits requests to the business's configured daily cap (at most 50), including failed attempts; upstream requests time out after 20 seconds. Manual forms and templates remain available without an AI key.

Run `node --env-file=.env.test.local scripts/evaluate-ai.mjs` against the local running app for the guarded live evaluation. It creates and removes its own isolated fictional fixture, signs in through normal session cookies, checks that no financial records changed, and writes `docs/ai-evaluation.json`. It makes real requests using the server's configured provider and may incur provider charges. See [AI verification](docs/ai-verification.md) for scope, results and limitations.
