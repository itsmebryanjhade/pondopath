# Google Sheet intake through n8n — design (Task 17)

**Status:** design approved section by section by Bryan on 6 November 2026; written spec awaiting review.
**Requirements:** [PRD](SoloForge_Cash-Flow_Action_Planner_PRD_v1.0.md) FR-12, FR-13, FR-14 and the connection-feasibility table; [Task 17](../plans/2026-10-27-cash-flow-action-planner.md).
**Boundary:** fictional data only. Real business Sheets wait for the separate real-data checks.

## 1. Goal

A business that keeps invoices and bills in its own Google Sheet should not re-type, export or upload them. Its staff keep editing the Sheet; new and changed rows arrive in PondoPath's Review Inbox for a quick human check, then flow into the cash plan through the normal authorized commands.

- **Faster:** no manual export or upload; unchanged rows never become review work; clean rows can be confirmed together.
- **Flexible:** works with the business's own Sheet layout (saved column mapping), Sheets that mix receivables and payables, and an optional row filter.
- **In control, simply:** the business chooses which rows are sent (row filter), can pause the connection, and still confirms everything before it touches financial records.
- **Vision:** PondoPath is the one place where a business's money information arrives, is checked and becomes a current cash plan. The connector endpoint is source-agnostic so Drive, OneDrive and accounting/POS exports (Tasks 18 and 21) reuse it with a new n8n workflow rather than new application logic.

### Decisions made during brainstorming

| Decision | Choice |
| --- | --- |
| Where n8n runs | Self-hosted on Bryan's laptop, like the Node-RED worker. Reads happen while the laptop is on and catch up after restart. |
| Google access | A Google **service account** (robot account). The business shares its Sheet with the robot email as **Viewer**. No OAuth consent screen and no expiring tokens. |
| Column mapping | Owner maps columns in PondoPath once, reusing the CSV/XLSX mapping; n8n sends raw rows only. |
| Receivable vs payable | Programmed, never AI: either one kind per Sheet, or a mapped **Type** column with owner-listed values. |
| Controls in v1 | Row filter, pause/resume, and **Confirm selected** in the Review Inbox. |
| Schedulers | Node-RED keeps the missed-commitment follow-up job; n8n handles intake only. No job runs in both. |
| Later (not in this spec) | "Sign in with Google and pick your Sheet" inside PondoPath, a "Check now" button, AI-suggested column mapping, Drive/OneDrive (Task 18). |

## 2. Architecture

```
Google Sheet ──(shared as Viewer with the robot account)──▶ n8n on the laptop (schedule, every 5–15 min)
   n8n: read the selected tab (service account, read-only) ─▶ POST raw rows + connection key
PondoPath  POST /api/intake/connectors/{sourceId}
   1. verify the key (hashed per source; owner can replace or disconnect)
   2. apply the saved mapping and row filter (same validation as CSV/XLSX)
   3. compare with existing items → only new/changed valid rows
   4. stage into the Review Inbox (shared staging rules) and record the run
Review Inbox ──▶ a person confirms (individually or "Confirm selected") ──▶ existing authorized commands
```

### Units

| Unit | Responsibility | Depends on |
| --- | --- | --- |
| `automation/n8n/google-sheet-intake.json` + `automation/n8n/README.md` | Importable workflow: schedule trigger → Google Sheets read (service account) → one HTTP POST. Failure branch reports the error to PondoPath. No mapping or money logic. Runbook covers install, credential setup, credential-free export. | n8n, Google Sheets API |
| `lib/domain/imports.ts` (extended) | Shared mapping: adds mixed-by-Type mapping and an optional row filter, used by CSV, XLSX and connectors. | existing `mapCsv`, `validateImportRows` |
| `lib/server/connector-auth.ts` | Resolve `sourceId` + bearer key to the source and business via the database's hash check. | admin Supabase client |
| `lib/server/connector-intake.ts` | Source-agnostic: header + rows in → mapped, filtered, compared candidates out → staged through the server-only RPC → run summary. | `imports.ts`, `stage_connector_rows` |
| `app/api/intake/connectors/[sourceId]/route.ts` | HTTP boundary: JSON only, size limit, key required, sessions ignored, safe error codes. | the two server modules above |
| Migration `supabase/migrations/<next applied-history version>_google_sheet_connector.sql` (version chosen from the actual applied history, per `supabase/AGENTS.md`) | Connector fields, run table, owner-only management functions, server-only staging function, shared staging core. | existing intake tables and `stage_intake` |
| Connection UI in the Imports page (`components/sheet-connection.tsx` + actions) | Connect, share step, key shown once, waiting for first read, map and filter, status line, pause/resume, replace key, disconnect. Owner manages; finance sees status. | management functions |
| Review Inbox "Confirm selected" (`components/intake-review*.tsx`, `lib/server/intake.ts`) | Select eligible items and confirm them one by one through the existing confirm command; per-item results. | existing `reviewIntake` |

Unchanged: the session-only intake route, CSV/XLSX upload, individual review commands, financial commands and Node-RED.

## 3. Flow

### 3.1 One-time setup (owner)

1. **Imports → Connect a Google Sheet:** name, Sheet link (PondoPath stores the spreadsheet ID and tab name), and either a record kind (invoices or expenses) or "Mixed (by Type column)".
2. **Share step:** show `GOOGLE_SERVICE_ACCOUNT_EMAIL` with Copy: "Share your Sheet with this email as **Viewer**."
3. **Key step:** PondoPath shows the connection key once with Copy and the runbook link. The n8n operator imports the workflow file and enters the key, source ID and Sheet details.
4. **First read:** "Execute workflow" once in n8n. PondoPath stores the headers and up to five sample rows and stages nothing (status `awaiting_mapping`).
5. **Map and filter:** the owner maps columns against the real headers and samples, optionally sets the row filter, and saves. Status becomes `active`.

### 3.2 Each scheduled read

1. n8n reads the tab with **Output Formatting = Values (unformatted)** and **Date Formatting = Serial Number**, then a small Code node converts n8n's header-keyed row objects into `{ runId, headers, rows, rowNumbers }`, keeping JSON types (string, number, boolean). It posts that (or `{ runId, error }`) with `Authorization: Bearer <key>`. Formatted values are not used, because they add thousands separators and locale dates.
2. PondoPath checks: key valid and source not `disconnected`; `runId` not already recorded (a retry returns the stored result and stages nothing); limits of 500 data rows and 24 columns; mapped headers still present (otherwise the run fails with `MAPPING_HEADER_MISSING` and stages nothing).
3. `paused`: record the run as paused, stage nothing.
4. Map each row with the saved mapping and CSV validation; apply the row filter (non-matching rows count as `skippedByFilter`).
5. Compare: a row's fingerprint is the hash of its mapped candidate. A row whose external ID already has an item with that fingerprint (any status) is `unchanged`. New or changed rows continue, up to 100 per read; the rest wait for the next read and the run reports `more pending`.
6. Stage through the shared staging core with evidence `{ via: "google_sheet_connector", runId, sheetRow, fields }`.
7. Record the run in the same transaction: counts (read, staged, unchanged, skipped by filter, invalid with row numbers and reasons, missing since last read) and result. This is the checkpoint; a failed staging transaction records nothing and the next read retries.

### 3.3 Safe by design

- **Reordered or inserted rows:** no effect; identity is the mapped ID column.
- **Row removed from the Sheet:** counted as missing; never deletes or changes PondoPath records.
- **Row edited after being applied:** staged as a changed proposal through the existing changed-version flow.
- **Same rows imported by CSV/XLSX:** existing duplicate and record-match checks apply.
- **No write-back:** nothing is ever written to the Sheet.

## 4. Data and mapping

### 4.1 Shared mapping (`csvMappingSchema`)

- New variant `kind: "mixed"` with `typeColumn`, `invoiceValues[]`, `expenseValues[]` (1–10 values each, compared case-insensitively after trimming; the lists must not overlap), the invoice fields (`number`, fallback `customerId`, optional `customer`) and the expense fields (`label`, `payee` as the existing expense variant defines them), plus the shared fields (`externalId`, `amount`, `dueDate`, optional `recordId`, `currency`).
- A row whose type matches neither list is invalid: "Unknown type '<value>'".
- Optional `filter: { column, value }` on every variant; case-insensitive exact match after trimming.
- CSV and XLSX imports gain the same options in their mapping form.

### 4.1a Connector value rules

- Headers must be non-empty, unique and at most 24; the same row and record limits as CSV apply.
- Strings are used as-is. Numbers become their plain decimal text (no exponent; otherwise invalid) and pass through normal money parsing.
- In the mapped due-date column, a whole-number value is treated as a 1900-system date serial and converted to `YYYY-MM-DD`; fractional serials (hidden times) are invalid. Text dates must already be `YYYY-MM-DD`.
- As with XLSX, a numeric value in a mapped identifier column (row ID, record ID, invoice number) is invalid with "Store identifiers as text in the Sheet", so leading zeros are never silently lost.
- Booleans become `TRUE`/`FALSE` and are accepted only in the Type and filter columns.

### 4.2 Database (one migration)

- `intake_sources` gains connector-only columns: `mapping jsonb`, `connector_key_hash text`, `status text` (`awaiting_first_read`, `awaiting_mapping`, `active`, `paused`, `disconnected`), `settings jsonb` (spreadsheet ID, tab name, first-read headers and samples), and last-run summary fields. Manual CSV/XLSX sources leave them null.
- New `intake_connector_runs (id, business_id, source_id, run_id, received_at, result, counts jsonb, error_code)` with `unique (source_id, run_id)`; keep the latest 200 runs per source. Members can read their business's runs.
- `create_intake_source` allows `google_sheet` for owners only, generates the key (returned once, stored as a hash) and sets `awaiting_first_read`.
- Owner-only functions: `save_connector_mapping`, `set_connector_paused`, `replace_connector_key` (returns the new key once), `disconnect_connector`. Finance can read status only.
- `stage_connector_rows(p_source_id, p_key, p_run jsonb)`: service-role only. Verifies the key hash in constant time and the source state, then calls the shared private staging core extracted from `stage_intake` (one implementation for both paths), with the connecting owner as `staged_by` and connector provenance in the evidence. Writes the run row in the same transaction.
- Disconnecting keeps all items and history; it only stops new reads.

### 4.3 Configuration

- `GOOGLE_SERVICE_ACCOUNT_EMAIL` in `.env.local` / `.env.example` (shown on the share step; not secret).
- The service account's private key lives only in n8n's encrypted credential store, never in PondoPath or the repository.

## 5. Errors, status and security

| Situation | Owner sees | Behaviour |
| --- | --- | --- |
| Normal read | "Last read 10:42 · 3 sent to review · 40 unchanged · 2 skipped by filter" | Checkpoint saved |
| Some invalid rows | "2 rows invalid" with row numbers and reasons | Valid rows still staged |
| Sheet not shared / un-shared | "n8n can't open the Sheet — share it with the robot email as Viewer" | n8n reports `SHEET_ACCESS_DENIED`; nothing staged |
| Mapped header renamed or removed | "Column '<name>' not found — update the mapping" | Nothing staged until remapped |
| No read for 3× the interval | "No read since 09:15" | Catches up on the next read |
| Limits | "500-row limit reached" or "100 sent, more next read" | Partial progress is safe |
| Paused | "Paused by owner" | Runs recorded, nothing staged |
| Wrong, replaced or disconnected key | (n8n receives 401) | Nothing staged |

- n8n's failure branch posts `{ runId, error: "SHEET_ACCESS_DENIED" | "SHEET_NOT_FOUND" | "READ_FAILED" }`; Google rate limits use n8n's retry plus the next schedule.
- The key is random (at least 32 bytes), shown once, stored only as a hash and compared in constant time. Replacement and disconnection revoke the old key immediately.
- The endpoint ignores cookies and sessions, accepts `application/json` up to 512 KiB, and never echoes row content or the key in errors or logs.
- Source and business always come from the key's source, never from request fields, so one business's key cannot stage into another.
- Row content is retained only as item evidence (as for CSV). The runbook explains exporting the workflow without credentials.
- The service account can read only Sheets explicitly shared with it, and only as Viewer.

## 6. Review Inbox: Confirm selected

- Eligible items: `pending`, a resolved record match (or a clean new record), no duplicate or stale warning, no unsaved edits. Others show no checkbox and still need individual review.
- "Confirm selected (N)" confirms each item sequentially through the existing confirm command with its own review version, revision and permission checks. Failures stay unconfirmed with their reason; others continue. Result: "5 confirmed, 1 needs attention".
- Works for CSV, XLSX and connector items alike. No new financial write path.

## 7. Testing and proof

**Automated (red first, fictional data):**
- Mapping unit tests: mixed Type values (case/space, overlap rejected, unknown type), row filter, the same mixed sheet giving equivalent candidates via CSV, XLSX and connector input.
- Connector service unit tests: new/changed/unchanged, reordered and inserted rows, missing rows, renamed header, limits and `more pending`, paused, awaiting mapping.
- Endpoint tests: missing/wrong/replaced key → 401; cookies ignored; non-JSON and oversize rejected; errors contain no row data or key.
- Integration tests (isolated test business, owner and finance accounts): owner-only management; duplicate `runId` stages once; cross-business key rejected; connector rows never post cash and apply only through confirmation; edited-after-apply row returns as a changed proposal; CSV overlap caught; Confirm selected confirms independently and isolates a stale item.

**Real proof (required; a fixture is not integration proof):** a fictional test Sheet shared with the robot account; an n8n read reaching the Review Inbox after mapping; one edited row producing exactly one changed proposal; re-running the same execution producing no duplicate; un-sharing producing the access error; the Sheet unmodified throughout. If Google or n8n access is unavailable, the connector is labelled **blocked**, not complete.

## 8. Build order

0. **Preflight (no code, a go/no-go gate):** Bryan creates the Google Cloud project (Sheets and Drive APIs enabled), the service account and a fictional test Sheet shared with it as Viewer (guided). Run n8n with the Node 24 binary and confirm one real read of that Sheet through the service-account credential, including how checkbox and date cells arrive. Record that Node-RED keeps its job. **If the shared-Sheet read fails** (see the service-account caveat in section 9), stop and return to Bryan with the fallback options before writing code.
1. Mixed-type mapping and row filter in the shared mapping, plus CSV/XLSX form options.
2. Migration: connector fields, run table, management functions, shared staging core.
3. Connector endpoint and service.
4. Connection UI: share step, key, first read, map and filter, status, pause, replace, disconnect.
5. n8n workflow file and runbook; real proof.
6. Review Inbox "Confirm selected".
7. Focused code and security review (medium effort), evidence records, Task 17 checkboxes.

Each slice keeps to roughly five files, ships with its owning tests and is committed separately.

## 9. Verified external facts

Checked on 6 November 2026 from official sources before implementation; re-check in slice 0 if more than a few weeks pass.

| Topic | Finding | Effect on this design |
| --- | --- | --- |
| n8n release | Latest stable n8n@2.46.6 (4 November 2026). [Releases](https://github.com/n8n-io/n8n/releases) | Pin the version in the runbook. |
| Node support | n8n supports Node 20.19–24.x; Node 26 is not supported. [npm install docs](https://docs.n8n.io/hosting/installation/npm/) | Run n8n with the existing Node 24.22.1 binary, never the machine's Node 26 default. |
| Install method | The docs present `npx n8n` as a way to try n8n; npm-based installs are deprecated from n8n 3.0, and other options (typically Docker) are recommended for ongoing use. | Use `npx` on Node 24 for development and the proof; plan a move to Docker before n8n 3.0 or longer-running use. |
| License | Sustainable Use License: free use for your own internal business purposes or non-commercial use. [LICENSE.md](https://github.com/n8n-io/n8n/blob/master/LICENSE.md) | Fine for the owner's own development and fictional-data demo. Offering n8n-backed intake to outside businesses as a product feature needs a license review before the real-data pilot. |
| Service-account credential | n8n's Google service-account credential (client email + private key) works with the Google Sheets node; the Sheets and Drive APIs must be enabled; files must be shared with the service-account email. [n8n credential docs](https://docs.n8n.io/integrations/builtin/credentials/google/service-account/) | Matches the design. No scope is chosen in the Sheets node itself. |
| **Service-account caveat** | n8n's docs state that service accounts created after 15 April 2025 cannot access My Drive files except through domain-wide delegation. It is not confirmed whether this blocks reading a Sheet shared directly with the account. | **Main risk.** Slice 0 must prove a real read first. Fallbacks if it fails: (a) an n8n Google OAuth credential (in Google's Testing mode its refresh token expires every 7 days and must be re-authorized), (b) a Google Workspace account with domain-wide delegation, or (c) bringing the planned "Sign in with Google" upgrade forward. Bryan chooses. |
| OAuth limits | External apps in Testing status get 7-day refresh tokens; `spreadsheets.readonly` is a sensitive scope that needs app verification for production. [OAuth 2.0](https://developers.google.com/identity/protocols/oauth2), [Sheets scopes](https://developers.google.com/workspace/sheets/api/scopes) | Do not apply to the service-account path; they apply to fallback (a) and the later sign-in upgrade. |
| Get row(s) output | First row is treated as headers; rows return as header-keyed objects; Output Formatting defaults to unformatted values (numbers stay numeric); Date Formatting defaults to locale text, with Serial Number as an option. [Sheets node docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googlesheets/sheet-operations/) | Workflow uses unformatted values and serial-number dates; PondoPath applies the value rules in 4.1a. Checkbox output is unverified and is checked in slice 0. |

The page wording above was summarized by a research tool; treat it as paraphrase and re-check the linked pages in slice 0.

## Update — 6 November 2026

- **Read method:** the workflow reads through the Sheets API (`values.get`, unformatted values, serial-number dates) with the read-only service account instead of the Google Sheets node's *Get Row(s)*, which merges duplicate headers and emits nothing for an empty Sheet. See the [n8n runbook](../../../automation/n8n/README.md).
- **Role:** with the hackathon-demo-first order, this n8n route becomes the optional **operator / advanced** path. The owner-facing path is the planned in-app **Connect Google** (sign-in and the Google Picker), which reuses this design's connector pipeline, mapping, dedupe and run history. See the [plan](../../../tasks/plan.md) and PRD 1.3 (FR-14).
