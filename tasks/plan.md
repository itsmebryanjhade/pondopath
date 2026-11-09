# PondoPath plan: hackathon demo first, then the full expansion

## Goal

**Decision, 6 November (Bryan):** finish a focused, reliable **hackathon demo** first, then continue the full expansion afterwards. This replaces the earlier "full scope before any demo" direction. The demo story is: *a business's money data lives in Sheets, Excel files and exports; PondoPath pulls it in with easy setup; a person confirms with a click; the 30-day cash plan updates.*

Setup must be easy for business owners: a familiar sign-in and file picker, not keys, connection IDs or manual credential pasting. **The fictional-data boundary is unchanged.** Real-business use still needs its separate operational and data-handling checks.

The active checklist is [todo.md](todo.md). The [PRD](../docs/superpowers/specs/SoloForge_Cash-Flow_Action_Planner_PRD_v1.0.md) (contents 1.1) and the [detailed implementation plan](../docs/superpowers/plans/2026-10-27-cash-flow-action-planner.md) remain authoritative for requirements and acceptance criteria. Connector evidence: [connector landscape research](../docs/research/connector-landscape-2026-11.md).

## Where we are (6 November)

| Area | Status |
| --- | --- |
| Core MVP: records, verified payments, 30-day forecast, commitments, reminders, scenarios, history, AI assistance, Node-RED follow-ups | Done (3 November gate; R2/R3 closed 6 November) |
| Next-action worklist and Review Inbox (Tasks 13–14) | Done |
| CSV and Excel import (Tasks 15–16) | Done |
| Google Sheet through n8n (Task 17) | About 80%. Connector endpoint, storage, connection screen, mapping, status, pause and the n8n workflow work end to end. A real read staged 4 rows and filtered 1; a repeat run staged nothing new; pause/resume was checked live. **Closing (6 November):** no more n8n runs; the edited-row and access-error proofs move to Connect Google, and "Confirm selected" becomes D3. Plan: [Google Sheet intake](../docs/superpowers/plans/2026-11-06-google-sheet-intake.md). |

## Demo scope (in order)

| Order | Deliverable | What the user sees | Notes |
| --- | --- | --- | --- |
| D1 | **Close Task 17** | Nothing new; n8n stays an optional operator / advanced route | Decided 6 November: no more n8n runs. Connect Google reuses the same connector pipeline, so the remaining edited-row and access-error proofs run through D2 instead. Write a short record of what the n8n route proved. |
| D2 | **Connect Google + selector and reader** (Sheets and Excel/CSV files in Drive) | Click *Connect Google* → sign in → pick the file → tick the columns/rows to bring in (**Select all**) → the reader labels each row invoice, expense or payment, even when mixed → confirm; **Sync now** and automatic syncs | Design: [Connect Google](../docs/superpowers/specs/2026-11-06-connect-google-design.md). The reader is the former smart-mapping item and also serves uploads. Payment rows are shown as "record it in Collections", never imported as cash. Comes first (Bryan, 6 November) because it carries the most risk. OAuth with the non-sensitive `drive.file` scope and the Google Picker; a Google project in **Testing** mode with Bryan's test account is enough for the demo. First prove that a picked Sheet can be read under `drive.file` (fallback: export the Sheet as .xlsx). Refresh tokens are stored encrypted and server-only. Syncs run on a schedule and when the inbox opens. Rows reuse the existing connector pipeline. |
| D3 | **Confirm selected** | Several clean inbox rows confirmed at once | Review Inbox feature shared by every source (formerly Task 17 plan Task 8). |
| D4 | **Demo preparation** (original Task 12, final candidate check R4) | Rehearsed fictional journey and recording | Starts after D1–D3. One justified full check run on Node 24 for the final candidate. |

Every source still stops at the Review Inbox. A person confirms before any invoice, expense or payment changes. Text or files saying "paid" never become recorded cash automatically. Manual forms remain available when a source fails.

## After the hackathon (agreed)

Kept in scope for later, in roughly this order; nothing here is part of the demo claim.

1. **Import presets** for common exports (GCash for Business, Maya, Shopee, Lazada, Loyverse, Xero/QuickBooks exports), building on D2.
2. **Connect Microsoft** (OneDrive/Excel): Picker v8 plus `Files.Read`, which covers all of the user's files, so disclose that clearly; free publisher verification.
3. **Google production readiness:** brand verification, production refresh tokens, privacy policy and home page.
4. **First accounting/POS sign-in:** Xero pilot (free for up to 5 connected businesses), then QuickBooks Online once fees are confirmed, and Loyverse for retail and F&B (original Task 21).
5. **Photo capture** of receipts and notebook pages, with editable AI-extracted fields and human review (original Task 19).
6. **Business messages:** Messenger Page, Viber business/bot, SMS (original Task 20). n8n webhooks remain useful here.
7. Later or partnership only: PayMongo/Xendit feeds, Shopee/Lazada/Shopify apps, unified accounting APIs (from about USD 599/month), Philippine tax tools.
8. Full completion verification and handoff (R5–R8) for the expanded scope.

## Rules that still apply

- Keep the existing Next.js/Supabase/programmed financial rules and bounded OpenRouter assistant. New sources stage proposals; they never write financial tables directly.
- One scheduler per job: Node-RED keeps missed-commitment follow-ups. n8n (operator route) and in-app sync handle intake only.
- Split each deliverable into small, tested slices (about five files each), with strict TDD and focused checks. Run one justified full check for the final candidate; never weaken checks.
- Sub-agents run at medium effort ([sub-agent routing](../docs/agents/subagents.md)). Applying migrations to the shared development database needs Bryan's approval in the session.

## Working environment and fictional data (R1, 6 November)

Recorded from the repository and local configuration; only variable names were inspected, never secret values.

| Area | Current state |
| --- | --- |
| Application | Local Next.js dev server at `http://localhost:3000` (`.claude/launch.json` → `npm run dev`). No Vercel project is linked in this checkout and nothing is deployed. |
| Node | Node 24 is required. The machine default is v26.12.0; the already-installed Node 24.22.1 binary is used for recorded checks without changing the global default. |
| Database | The authorized Supabase development project **soloforge-cashflow-dev** (Singapore), configured in `.env.local`. See [database](../docs/database.md). |
| Integration tests | `.env.test.local` (`TEST_ENVIRONMENT=isolated-development`) targets the same development project. Each run creates and removes its own unrelated test business and owner/finance accounts; shared workspaces are never reset. |
| Fictional workspaces | **SoloForge Demo Services** (`scripts/seed-demo.mjs`): Demo Owner/Demo Finance accounts, fixed reference date 2026-10-29, used for the scripted demo numbers; the Task 17 live proof also ran here (pending inbox items only). **Bryan's ordinary development workspace**: current date and fictional test records, used for the Task 16 and R2/R3 browser checks. |
| Sample files | `public/samples/pondopath-invoices.csv` and `.xlsx`, both fictional; a fictional Google test Sheet shared with the service account. |
| AI | OpenRouter is configured (key, model and provider names in `.env.local`). A `GEMINI_API_KEY` entry also exists locally but no application code reads it. |
| Workers | Node-RED in `automation/` with `.env.automation.local`, run manually. n8n 2.46.6 runs locally on Node 24 for the Sheet intake ([runbook](../automation/n8n/README.md)). |
| Google | Cloud project `pondopath-dev` with Sheets and Drive APIs enabled and the service account `pondopath-reader@…` (operator route). An OAuth client for **Connect Google** is still to be created for D3. |
| Not yet set up | Microsoft, message channels, receipt-image provider, accounting/POS accounts, final hosting target. |

No real customer data, public exposure, purchases or provider sign-ups are authorized by this record.
