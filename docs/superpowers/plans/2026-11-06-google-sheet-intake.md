# Google Sheet Intake Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a business's own Google Sheet feed new and changed invoice/expense rows into PondoPath's Review Inbox through self-hosted n8n, with row filters, pause/resume and "Confirm selected".

**Architecture:** n8n reads one Sheet shared as Viewer with a Google service account and POSTs raw rows to a source-agnostic endpoint authenticated by a per-source key. PondoPath normalizes values, applies the saved mapping (now with mixed Type columns and a row filter), drops unchanged rows by fingerprint and stages the rest through a server-only database function that reuses the existing staging core and records each run.

**Tech Stack:** Next.js App Router 16.4.3, TypeScript, Zod 4, Supabase Postgres (plpgsql, RLS), Vitest 5, self-hosted n8n 2.46.6 on Node 24.

**Spec:** [docs/superpowers/specs/2026-11-06-google-sheet-intake-design.md](../specs/2026-11-06-google-sheet-intake-design.md)

## Global Constraints

- Fictional data only; real business Sheets wait for the separate real-data checks.
- Node 24 for the app checks and for n8n (use the existing Node 24.22.1 binary; n8n does not support Node 26).
- Read the relevant guide in `node_modules/next/dist/docs/` before any route or action change; follow root and nested `AGENTS.md` for each directory touched.
- Programmed rules own money: no AI decides receivable vs payable; imported rows never post cash; every financial write goes through the existing confirm command.
- n8n never touches the database; nothing is written back to the Sheet.
- Limits: 500 data rows and 24 columns per read; at most 100 rows staged per read; 512 KiB request body; key of at least 32 random bytes shown once, stored only as a SHA-256 hex hash.
- Connection management (create, map, pause/resume, replace key, disconnect) is owner-only; finance may read status and review items.
- Errors and logs never contain row content or the key.
- Each task keeps to roughly five files, uses red-green TDD, and is committed separately. Integration tests use the isolated fixture rules in `docs/testing.md`; missing test configuration is a failure.
- Sub-agents run at `medium` effort (see `docs/agents/subagents.md`).

## Review Focus

1. **Header edited after mapping** (a mapped column renamed, removed or duplicated in the Sheet): expect the whole read to fail with `MAPPING_HEADER_MISSING` and stage nothing, never a silent remap. Test owned by Task 5.
2. **Two runs overlapping** (the schedule fires while a slow previous run is still staging): expect each `runId` recorded once and no duplicate items, because staging locks the source row. Test owned by Task 4.
3. **Filter or Type values with odd spacing/case** (`" unpaid "`, `TRUE` vs `true`, checkbox booleans): expect case-insensitive, trimmed matching. Test owned by Task 1.
4. **Mapping saved, then the owner changes record kind or Type values**: expect earlier items untouched and only later reads to use the new mapping; already-applied rows whose kind changed return the existing "different record kind" error. Test owned by Task 1.
5. **A Sheet with more than 100 changed rows** (first connection of a large Sheet): expect 100 staged, the run marked `more_pending`, and the next read staging the next 100 without repeats. Test owned by Task 5.

---

### Task 0: Preflight go/no-go (no code)

**Files:**
- Create: `automation/n8n/README.md` (preflight section only; Task 7 completes it)

- [ ] **Step 1:** Guide Bryan through creating a Google Cloud project with the Google Sheets API and Google Drive API enabled, a service account with a JSON key, and a fictional test Sheet (headers `Source ID, Type, Invoice number, Customer ID, Label, Payee, Amount PHP, Original due, Status`, 5 rows mixing invoices and bills) shared with the service-account email as **Viewer**.
- [ ] **Step 2:** Start n8n 2.46.6 with the Node 24 binary first on `PATH` (`npx n8n@2.46.6`), create a Google service-account credential, and run a Google Sheets "Get row(s)" node with Output Formatting = Values (unformatted) and Date Formatting = Serial Number.
- [ ] **Step 3:** Record in the README: whether the read succeeded, the JSON type each column arrived as (especially checkbox, date and leading-zero text cells), and the decision "Node-RED keeps the missed-commitment job; n8n handles intake only".
- [ ] **Step 4: Gate.** If the read failed with an access error, stop and report the spec's fallback options to Bryan. Do not start Task 1 until he chooses.
- [ ] **Step 5: Commit** `docs: record the Task 17 n8n and Google preflight`.

### Task 1: Mixed Type mapping and row filter in shared mapping

**Files:**
- Modify: `lib/domain/imports.ts`
- Test: `lib/domain/imports.test.ts`

**Interfaces:**
- Produces:
  - `csvMappingSchema` gains variant `{ kind: "mixed"; externalId; amount; dueDate; typeColumn: string; invoiceValues: string[]; expenseValues: string[]; number; customerId: uuid; customer?; label; payee; recordId?; currency? }` (value lists 1–10 items, each 1–100 chars, non-overlapping after trim + lowercase).
  - Every variant gains optional `filter: { column: string; value: string }`.
  - `CsvRow.status` gains `"filtered"`; filtered rows have no candidate and are ignored by the duplicate pass.
  - The identifier message becomes `"Store identifiers as text in the spreadsheet: <header>."`.

- [ ] **Step 1: Write failing tests** in `describe("mixed mapping and row filter")`:
  - `it("routes each row by its Type value")`: rows with `Invoice` and ` bill ` map to `save_invoice` and `save_expense` given `invoiceValues: ["Invoice","AR"]`, `expenseValues: ["Bill"]`.
  - `it("marks an unknown Type invalid")`: `Misc` → `status: "invalid"`, `message: "Unknown type 'Misc'."`.
  - `it("rejects overlapping Type value lists")`: `csvMappingSchema.safeParse` with `invoiceValues: ["AR"], expenseValues: ["ar"]` → `success: false`.
  - `it("skips rows that do not match the filter, trimming and ignoring case")`: filter `{ column: "Status", value: "Unpaid" }`; rows `" unpaid "` kept, `TRUE`/`Paid` → `status: "filtered"`; a duplicate source ID among filtered rows does not mark kept rows duplicate.
  - `it("keeps the existing kind error when an applied row's kind changes")`: binding `{ type: "save_invoice" }` + mixed row typed Bill → `"This source ID already belongs to a different record kind."`.
- [ ] **Step 2:** Run `npx vitest run lib/domain/imports.test.ts`; expect the new tests to FAIL.
- [ ] **Step 3:** Implement in `imports.ts`: extend the schema (with a `superRefine` for overlap), resolve the per-row kind before candidate building, apply the filter before validation, update the identifier message. Keep `mapCsv(file, mapping, context): CsvRow[]` unchanged.
- [ ] **Step 4:** Run `npx vitest run lib/domain/imports.test.ts lib/domain/xlsx.test.ts`; expect all PASS.
- [ ] **Step 5: Commit** `feat: map mixed receivable/payable sheets and filter rows`.

### Task 2: Mapping form options for CSV/XLSX

**Files:**
- Modify: `components/csv-import.tsx`
- Test: `lib/ui/intake-review.test.ts` (existing import-form tests live here)

**Interfaces:**
- Consumes: Task 1 schema.
- Produces: `ImportMappingFields({ headers, customers, kind, onKindChange })` exported from `components/csv-import.tsx`, returning the mapping inputs, reused by Task 6.

- [ ] **Step 1: Write failing tests:**
  - `it("offers Mixed (by Type column) with value lists")`: rendering shows a "Record kind" option `Mixed (by Type column)`, and choosing it shows `Type column`, `Values meaning invoice`, `Values meaning expense` plus both invoice and expense fields.
  - `it("offers an optional row filter")`: `Only include rows where` column select + `equals` text input, both optional.
- [ ] **Step 2:** Run `npx vitest run lib/ui/intake-review.test.ts`; expect FAIL.
- [ ] **Step 3:** Extract the mapping fields into `ImportMappingFields`, add the mixed and filter inputs (comma-separated value lists), and build the mapping object from them.
- [ ] **Step 4:** Run the UI test plus `npm run typecheck`; expect PASS.
- [ ] **Step 5: Commit** `feat: add mixed-kind and filter options to spreadsheet mapping`.

### Task 3: Connector payload normalizer

**Files:**
- Create: `lib/domain/connector-rows.ts`
- Test: `lib/domain/connector-rows.test.ts`

**Interfaces:**
- Produces:
  - `connectorReadSchema`: Zod union of `{ runId: string(1–200); headers: string[](1–24); rows: (string|number|boolean|null)[][](0–500); rowNumbers: int[] }` (same length as rows) and `{ runId; error: "SHEET_ACCESS_DENIED"|"SHEET_NOT_FOUND"|"READ_FAILED" }`.
  - `type ConnectorRead = z.infer<typeof connectorReadSchema>`.
  - `normalizeConnectorRows(read: Extract<ConnectorRead, { headers: string[] }>, options: { dateColumns: string[] }): ConnectorFile` where `ConnectorFile = CsvFile & { booleanCells: boolean[][] }`: returns string cells, `rowNumbers`, `nonTextCells` (true for numbers) and `booleanCells` (true for booleans); runs `validateImportRows` limits for headers and row bytes, but allows up to 500 rows.

- [ ] **Step 1: Write failing tests:**
  - `it("converts whole-number serials in date columns to ISO dates")`: `46336` in `Original due` → `"2026-11-10"`.
  - `it("rejects fractional serials")`: `46336.5` → throws `"Use date-only cells without hidden times."`.
  - `it("renders numbers as plain decimal text and flags them as non-text")`: `12500` → `"12500"`, `7500.5` → `"7500.5"`, `nonTextCells` true; `1e21` → throws.
  - `it("renders booleans as TRUE/FALSE and null as empty")`.
  - `it("rejects duplicate or blank headers and more than 500 rows")`.
- [ ] **Step 2:** Run `npx vitest run lib/domain/connector-rows.test.ts`; expect FAIL.
- [ ] **Step 3:** Implement with the 1900 serial epoch `1899-12-30` (UTC, whole days only); relax only the row-count limit relative to `validateImportRows` (factor out its header and row-byte checks rather than copying them).
- [ ] **Step 4:** Run the test; expect PASS.
- [ ] **Step 5: Commit** `feat: normalize connector sheet values`.

### Task 4: Connector database migration

**Files:**
- Create: `supabase/migrations/<next applied version>_google_sheet_connector.sql` (choose the version from the applied history per `supabase/AGENTS.md`)
- Modify: `lib/database.types.ts` (regenerate with the project's existing Supabase type command)
- Test: `tests/integration/connector.test.ts`

**Interfaces:**
- Produces (SQL):
  - `intake_sources` columns `mapping jsonb`, `connector_key_hash text`, `connector_status text check (in 'awaiting_first_read','awaiting_mapping','active','paused','disconnected')`, `connector_settings jsonb`, `last_run_at timestamptz`, `last_run_summary jsonb`.
  - `intake_connector_runs(id uuid pk, business_id, source_id, run_id text, received_at, result text check (in 'staged','paused','awaiting_mapping','failed','first_read'), counts jsonb, error_code text, unique(source_id, run_id))`, member read via RLS, latest 200 kept per source.
  - Owner-only (security definer, `private.require_membership()` + role owner): `create_sheet_connection(p_label text, p_settings jsonb, p_key_hash text) returns uuid`; `save_connector_mapping(p_source_id uuid, p_mapping jsonb)`; `set_connector_paused(p_source_id uuid, p_paused boolean)`; `replace_connector_key(p_source_id uuid, p_key_hash text)`; `disconnect_connector(p_source_id uuid)`.
  - Service-role only: `connector_source(p_source_id uuid, p_key text) returns jsonb` (`{ businessId, status, mapping, settings }` or `UNAUTHENTICATED`), and `connector_ingest(p_source_id uuid, p_key text, p_run jsonb) returns jsonb` (`{ replayed, results }`), where `p_run = { runId, result, counts, errorCode?, firstRead?: { headers, samples }, rows?: intakeBatchSchema rows }`.
  - `private.stage_intake_core(business_id, actor uuid, source, row…)` extracted from `stage_intake`; `stage_intake` and `connector_ingest` both call it.

- [ ] **Step 1: Write failing integration tests** with the isolated fixture:
  - `it("lets only the owner create and manage a sheet connection")`: finance calls to the five owner functions → `FORBIDDEN`.
  - `it("rejects a wrong, replaced or disconnected key")`: `connector_source` → `UNAUTHENTICATED`.
  - `it("records a runId once even when sent twice or concurrently")`: two parallel `connector_ingest` calls with the same runId → one run row, one item, the second `replayed: true`.
  - `it("stages connector rows as pending without posting cash")`: no `cash_movements` row; the item's evidence has `via: "google_sheet_connector"` and `staged_by` = the connecting owner.
  - `it("never stages into another business with this business's key")`.
  - `it("stores first-read headers and moves to awaiting_mapping, then active after mapping")`.
  - `it("keeps existing CSV staging behavior")`: rerun `tests/integration/intake.test.ts` unchanged.
- [ ] **Step 2:** Run `npm run test:integration -- tests/integration/connector.test.ts`; expect FAIL.
- [ ] **Step 3:** Write the migration (key check `encode(sha256(convert_to(p_key,'UTF8')),'hex') = connector_key_hash`; `connector_ingest` locks the source row `for update` before the runId check; revoke from `public, anon, authenticated` and grant the service functions to `service_role` only). Apply it to the development project through the documented migration path, then regenerate types.
- [ ] **Step 4:** Run `npm run test:integration -- tests/integration/connector.test.ts tests/integration/intake.test.ts`; expect all PASS.
- [ ] **Step 5: Commit** `feat: add sheet connector storage and staging functions`.

### Task 5: Connector service, auth and endpoint

**Files:**
- Create: `lib/server/connector-intake.ts`
- Create: `app/api/intake/connectors/[sourceId]/route.ts`
- Test: `lib/server/connector-intake.test.ts`
- Test: `lib/server/connector-route.test.ts`

**Interfaces:**
- Consumes: `connectorReadSchema`, `normalizeConnectorRows` (Task 3); `mapCsv` (Task 1); `connector_source`, `connector_ingest`, `get_intake_bindings` (Task 4).
- Produces:
  - `candidateFingerprint(candidate: IntakeCandidate): string`: SHA-256 hex of `JSON.stringify(candidate)`, the same as today's CSV `sourceVersion`.
  - `ingestConnectorRead(sourceId: string, key: string, read: ConnectorRead): Promise<ConnectorRunSummary>` where `ConnectorRunSummary = { result: "staged"|"paused"|"awaiting_mapping"|"first_read"|"failed"; read: number; staged: number; unchanged: number; skippedByFilter: number; invalid: { row: number; reason: string }[]; missing: number; morePending: boolean; replayed: boolean; errorCode?: string }`.
  - `POST /api/intake/connectors/{sourceId}` → `200 { ok: true, summary }`; `401 UNAUTHENTICATED`; `400 INVALID_REQUEST`; `413 PAYLOAD_TOO_LARGE`; `503 CONNECTOR_UNAVAILABLE`.

- [ ] **Step 1: Write failing service tests** (admin client mocked):
  - `it("stores headers and samples on the first read and stages nothing")`.
  - `it("stages only new and changed rows by fingerprint")`: 3 rows, one with an existing identical fingerprint → `staged: 2, unchanged: 1`.
  - `it("ignores reordered and inserted rows")`, `it("counts rows missing since the last read without deleting anything")`.
  - `it("fails the whole read when a mapped header is missing")` → `result: "failed", errorCode: "MAPPING_HEADER_MISSING"`, `connector_ingest` called with no rows.
  - `it("stages at most 100 rows and reports more pending")`: 150 new rows → 100 staged, `morePending: true`; a second read with the first 100 already present stages the remaining 50.
  - `it("records paused reads without staging")`, `it("records n8n error payloads as failed runs")`.
  - `it("accepts checkbox values only in the Type and filter columns")`: a boolean in the mapped Label column → that row invalid with `"Use text, not a checkbox, in Label."`; a boolean in the filter column works.
- [ ] **Step 2: Write failing route tests** (mirroring `lib/server/automation-route.test.ts`): no or wrong bearer → 401; a session cookie without a bearer → 401; `text/plain` → 400; body over 512 KiB → 413; error bodies contain neither row values nor the key.
- [ ] **Step 3:** Run `npx vitest run lib/server/connector-intake.test.ts lib/server/connector-route.test.ts`; expect FAIL.
- [ ] **Step 4:** Implement: the route reads the bearer key and uses `readLimitedJson(request, 524_288)` from `lib/server/ai-provider`; the service loads the source via `connector_source`, loads `ImportContext` with the admin client scoped by `businessId` (customers, invoices, expenses and `get_intake_bindings`), normalizes, maps, fingerprints, checks existing `(external_id, source_version)` pairs for the source, then calls `connector_ingest` once. Evidence per row: `{ via: "google_sheet_connector", runId, sheetRow, fields }`.
- [ ] **Step 5:** Run both test files plus `npm run typecheck`; expect PASS.
- [ ] **Step 6: Commit** `feat: accept connector reads through a per-source key`.

### Task 6: Connect-a-Sheet screen

**Files:**
- Create: `components/sheet-connection.tsx`
- Create: `app/(workspace)/imports/connector-actions.ts`
- Modify: `app/(workspace)/imports/page.tsx` (render the section), `.env.example` (`GOOGLE_SERVICE_ACCOUNT_EMAIL=`)
- Test: `lib/ui/sheet-connection.test.ts`

**Interfaces:**
- Consumes: Task 4 owner functions; `ImportMappingFields` (Task 2).
- Produces: actions `createSheetConnectionAction(label: string, sheetUrl: string): ActionResult<{ sourceId: string; key: string }>` (generates the key with `randomBytes(32).toString("base64url")`, stores only its hash, parses the spreadsheet ID and `gid` tab from the URL, and saves `intervalMinutes: 10` in the settings, matching the workflow schedule and used for the "No read since" check), `saveConnectorMappingAction(sourceId, mapping)`, `setConnectorPausedAction(sourceId, paused)`, `replaceConnectorKeyAction(sourceId): ActionResult<{ key: string }>`, `disconnectConnectorAction(sourceId)`.

- [ ] **Step 1: Write failing UI tests:**
  - owner sees "Connect a Google Sheet"; finance sees status only and no manage controls;
  - the share step shows the service-account email with a Copy button;
  - the key is shown once after creation, with the warning "Copy this key now. It will not be shown again.";
  - `awaiting_first_read` shows "Waiting for the first read from n8n…"; `awaiting_mapping` shows the mapping form with the stored headers and samples;
  - an `active` status line reads "Last read <time> · <n> sent to review · <n> unchanged · <n> skipped by filter"; failures show the spec's messages (access denied, header missing, no read for 3× the interval);
  - pause, replace key and disconnect controls (disconnect asks for confirmation).
- [ ] **Step 2:** Run `npx vitest run lib/ui/sheet-connection.test.ts`; expect FAIL.
- [ ] **Step 3:** Implement the component and server actions (owner check server-side through the database functions; `revalidatePath("/imports")`).
- [ ] **Step 4:** Run the test, `npm run typecheck` and lint on the changed files; expect PASS. Check the screen in the browser at desktop and 390px widths.
- [ ] **Step 5: Commit** `feat: add the connect-a-Google-Sheet screen`.

### Task 7: n8n workflow, runbook and real proof

**Files:**
- Create: `automation/n8n/google-sheet-intake.json`
- Modify: `automation/n8n/README.md`
- Modify: `docs/mvp-runtime-evidence.json` (add `task17SheetProof`)

- [ ] **Step 1:** Build the workflow: Schedule Trigger (every 10 minutes) → Google Sheets Get row(s) (service-account credential, unformatted values, serial-number dates, Return All) → Code node building `{ runId: $execution.id, headers, rows, rowNumbers }` → HTTP Request POST to `{{APP_URL}}/api/intake/connectors/{{SOURCE_ID}}` with `Authorization: Bearer {{CONNECTOR_KEY}}`. An error branch posts `{ runId, error }`. Export without credentials.
- [ ] **Step 2:** Complete the runbook: start n8n with Node 24, import the workflow, set the credential and the three values, the "Execute workflow" first read, the credential-free export, and the planned Docker move before n8n 3.0.
- [ ] **Step 3: Real proof** with the fictional test Sheet, recording each result in `task17SheetProof`:
  - the first read maps and stages the rows;
  - one edited row produces exactly one changed proposal;
  - re-running the same execution stages nothing new;
  - pausing records "Paused";
  - un-sharing shows the access error;
  - the Sheet's version history shows no edits by the service account.
- [ ] **Step 4: Commit** `feat: add the n8n Google Sheet workflow with real-read evidence`.

### Task 8: Review Inbox "Confirm selected"

**Files:**
- Create: `components/intake-bulk-confirm.tsx`
- Modify: `lib/server/intake.ts`, `app/(workspace)/imports/actions.ts`, `app/(workspace)/imports/page.tsx`
- Test: `lib/ui/intake-bulk-confirm.test.ts`, plus a case in `tests/integration/intake.test.ts`

**Interfaces:**
- Produces:
  - `isBulkConfirmable(item: IntakeItem): boolean`: `status === "pending"` and the candidate parses and has no duplicate or stale warning.
  - `confirmSelectedIntake(items: { id: string; reviewVersion: number }[], revision: number): Promise<{ confirmed: string[]; failed: { id: string; reason: string }[] }>` (1–50 items), applying sequentially via `apply_intake`: the first uses `revision`, each later one uses the `revision` returned by the previous successful apply. A failure records its mapped `CommandError` message and continues.
  - Action `confirmSelectedIntakeAction(input)`.

- [ ] **Step 1: Write failing tests:**
  - UI: checkboxes appear only on confirmable items; "Confirm selected (N)" stays disabled at 0; the result reads "5 confirmed, 1 needs attention" and lists the reason.
  - Integration: `it("confirms selected items independently and isolates a stale one")`: three items, one with an outdated `reviewVersion` → two applied, one failed `STALE_VERSION`, no extra cash movement.
  - Integration: `it("stops chaining when another session changes the business mid-batch")`: a concurrent finance change makes the next apply fail as stale.
- [ ] **Step 2:** Run the new tests; expect FAIL.
- [ ] **Step 3:** Implement the server function, action and component; render the bar above the inbox list.
- [ ] **Step 4:** Run the UI test, `npm run test:integration -- tests/integration/intake.test.ts` and typecheck; expect PASS. Check in the browser.
- [ ] **Step 5: Commit** `feat: confirm selected Review Inbox items together`.

### Task 9: Review, evidence and Task 17 close-out

**Files:**
- Modify: `docs/superpowers/plans/2026-10-27-cash-flow-action-planner.md` (Task 17 checkboxes), `docs/testing.md`, `docs/product-guide.md`, `tasks/todo.md`

- [ ] **Step 1:** Dispatch one combined `code-reviewer` review (medium effort) over the Task 1–8 diff, with the security focus points from spec section 5; fix confirmed findings with tests first.
- [ ] **Step 2:** On Node 24, run `npx vitest run` for the changed unit/UI files, `npm run test:integration -- tests/integration/connector.test.ts tests/integration/intake.test.ts`, `npm run typecheck` and lint of project source; record exact results in `docs/testing.md`.
- [ ] **Step 3:** Update the product guide (Google Sheet connection, mixed Type, filter, pause, Confirm selected), tick the Task 17 criteria that have evidence, and mark the `tasks/todo.md` row done or blocked.
- [ ] **Step 4: Commit** `docs: record Task 17 evidence`.
