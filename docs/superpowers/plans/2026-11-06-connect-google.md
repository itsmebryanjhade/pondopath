# Connect Google, Selector and Reader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An owner clicks *Connect Google*, signs in, picks a Google Sheet or an Excel/CSV file in Drive, ticks the columns and rows to bring in, and gets mixed rows auto-labelled invoice, expense or payment. Labelled rows then sync into the Review Inbox on a schedule, when the inbox opens, and on **Sync now**.

**Architecture:**
- **Part B, the reader:** pure programmed rules in `lib/domain/reader.ts`. They turn a sheet into column suggestions and per-row labels. An `auto` mapping kind feeds labelled rows into the existing `mapCsv` mixed path through a synthetic type column. Uploads use it first.
- **Part A, Connect Google:** server-only token handling (AES-256-GCM) and a single Google client module, added to the existing connector pipeline through a second, key-less, `service_role`-only door. The Task 17 n8n door stays unchanged.

**Tech Stack:** Next.js App Router 16.4.3, TypeScript, Zod 4, Supabase Postgres (plpgsql, RLS, `pg_cron`/`pg_net` after deployment), Vitest 5, `read-excel-file`, `csv-parse`, Google OAuth 2.0, Google Picker, Drive API v3, Sheets API v4, Node 24.

**Spec:** [docs/superpowers/specs/2026-11-06-connect-google-design.md](../specs/2026-11-06-connect-google-design.md)

## Global Constraints

- Fictional data only. Google project `pondopath-dev` stays in **Testing** mode with Bryan's test users. Localhost first; Vercel/subdomain origins are added at deployment.
- Node 24 for all checks (existing Node 24.22.1 binary; the machine default is Node 26). Read the relevant guide in `node_modules/next/dist/docs/` before any route handler, server action, `after()` or `cookies()` change. Follow root and nested `AGENTS.md` (`app/`, `components/`, `lib/`, `supabase/`).
- Scopes are exactly `openid`, `email` and `https://www.googleapis.com/auth/drive.file`; nothing broader. Files are read, never written.
- Server-only environment variables: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_TOKEN_ENCRYPTION_KEY` (base64, 32 bytes) and `GOOGLE_SYNC_CRON_SECRET`. Public by design: `GOOGLE_PICKER_API_KEY` and `GOOGLE_PROJECT_NUMBER`. Missing configuration fails with `GOOGLE_NOT_CONFIGURED`, never a crash or a partial connection.
- Refresh tokens are never sent to the browser, logged, put in errors, run history or cron payloads, or readable by `authenticated`. Only a short-lived access token goes to the browser, for the Picker.
- Owner only: connect, reconnect, disconnect, create a file connection, save the setup. Owner or finance: **Sync now**. Every action re-checks business and role.
- Programmed rules own money:
  - no AI labels;
  - `payment` and `choose` rows are never staged;
  - "paid" text never posts cash;
  - every financial change goes through the existing confirm command.
- Limits: existing `CONNECTOR_LIMITS` (500 rows read, 100 staged per read), 24 columns, file download cap of **5 MiB**, preview of the first **100** rows, reader sample of **20** rows, sync batch of at most **5** due files per cron call, due after **10 minutes**, lease of **3 minutes**.
- Each task: about five files, red-green TDD, its own commit. Integration tests follow the isolated fixture rules in `docs/testing.md`. Migrations to the shared development database are applied only after Bryan approves in the session. Sub-agents run at `medium` effort (`docs/agents/subagents.md`).

## Review Focus

1. **The owner re-sorts or inserts rows after setup.** Exclusions and label overrides must follow the row ID, not the position. Test owned by Task 2.
2. **Duplicate row IDs in the file.** Both rows are reported invalid by the existing duplicate rule, and an override for that ID labels neither as staged. Test owned by Task 2.
3. **One of several due files fails mid-batch** (token refused, file gone). Only that file or connection changes state; the other files in the cron call still sync, and nothing is partly staged. Test owned by Task 9.
4. **The Picker returns a file that is not allowed** (wrong MIME, a Google Doc, over 5 MiB, a trashed file, or a forged ID the account cannot open). Creation is refused with a clear message, and no source row is created. Test owned by Task 8.
5. **Reconnect with a different Google account.** The new email is stored and shown. Files the new account cannot open show "PondoPath can't open this file anymore" on their next sync; nothing is silently dropped. Test owned by Task 7.

---

### Task 1: Reader — column detection

**Files:**
- Create: `lib/domain/reader.ts`
- Test: `lib/domain/reader.test.ts`

**Interfaces:**
- Produces:
  - `type ColumnRole = "externalId" | "date" | "dueDate" | "customer" | "supplier" | "amount" | "type" | "description" | "number" | "ignore"`
  - `type ColumnSuggestion = { header: string; role: ColumnRole; confidence: "high" | "low" }`
  - `suggestColumns(headers: string[], samples: string[][]): ColumnSuggestion[]`, which returns one entry per header in order. Each role is used at most once, except `ignore`; the higher-confidence match wins a tie.

- [ ] **Step 1: Write the failing tests**
  - `matches English headers`: `["Invoice No","Customer","Amount","Due Date","Type"]` → `number/high`, `customer/high`, `amount/high`, `dueDate/high`, `type/high`.
  - `matches Filipino and Taglish headers`: `["Petsa","Kliyente","Halaga","Supplier","Uri","Paliwanag"]` → `date`, `customer`, `amount`, `supplier`, `type`, `description`.
  - `uses value shapes when the header is unknown`: header `"Col7"` with samples `["15000","8250.50"]` → `amount/low`; samples `["2026-11-20","2026-12-01"]` → `date/low`.
  - `leaves unknown text columns as ignore`: `"Notes"` → `ignore`.
  - `never assigns a role twice`: two headers matching `amount` (for example "Amount" and "Total") → one `amount`, the other `ignore`.
  - `picks a stable ID column`: `"Ref"` / `"ID"` / `"SRC-ID"` with unique samples → `externalId/high`.
- [ ] **Step 2:** Run `npm run test:unit -- lib/domain/reader.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement `suggestColumns`** in `lib/domain/reader.ts`. Approach: a word table per role covering English, Taglish and Filipino; case and accents are folded; matching uses whole words or prefixes. Value-shape checks reuse `parseMoney` (`lib/domain/money.ts`) and `assertLocalDate` (`lib/domain/dates.ts`) inside try/catch; do not write new parsers. Keep the word table near the top as exported `ROLE_WORDS` so Task 2 and tests can share it.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: suggest import column roles from headers and samples`.

### Task 2: Reader — row labels and the `auto` mapping

**Files:**
- Modify: `lib/domain/reader.ts`, `lib/domain/imports.ts` (`csvMappingSchema`)
- Test: `lib/domain/reader.test.ts`, `lib/domain/imports.test.ts`

**Interfaces:**
- Consumes: Task 1 (`ColumnSuggestion`, `ROLE_WORDS`).
- Produces:
  - `type RowLabel = "invoice" | "expense" | "payment" | "choose"`
  - `labelRows(file: CsvFile, mapping: AutoMapping): { row: number; externalId: string; label: RowLabel; reason: string }[]`
  - `AutoMapping`: the new `csvMappingSchema` variant `{ kind: "auto", externalId, amount, dueDate, number, customerId: uuid, customer?, label, payee, recordId?, currency?, typeColumn?, columns: string[] (1–24), excludedIds: string[] (≤500), overrides: Record<string, "invoice" | "expense"> (≤500 keys), filter? }`
  - `applyReader(file: CsvFile, mapping: AutoMapping): { file: CsvFile; mixed: Extract<CsvMapping, { kind: "mixed" }>; payments: number[]; choose: number[]; excluded: number }`. The returned `file` keeps only the `columns` plus a synthetic `"__pondopath_type"` column, and drops excluded and `payment`/`choose` rows. `mixed` targets that synthetic column with `invoiceValues: ["invoice"]` and `expenseValues: ["expense"]`.

- [ ] **Step 1: Write the failing tests** (in `reader.test.ts` unless noted)
  - `labels by Type words`: Type `"Invoice"`/`"Benta"` → invoice; `"Bill"`/`"Gastos"` → expense; `"Payment"`/`"Bayad"` → payment.
  - `labels by party column`: customer filled and supplier empty → invoice; the reverse → expense.
  - `negative amount means expense` when no other signal applies.
  - `payment words in the description` (`"Resibo"`, `"paid via GCash"`) with no Type → payment.
  - `conflicting signals become choose`: Type `"Invoice"` with only the supplier filled → `choose`, with a reason naming both.
  - `overrides win and follow the ID after re-sorting` (Review Focus 1): override `{ "SRC-0003": "expense" }`; shuffle the rows → `SRC-0003` is still expense; `excludedIds: ["SRC-0002"]` still drops it after the shuffle.
  - `duplicate IDs` (Review Focus 2): two rows with `SRC-0005` → `applyReader` keeps both, so that `mapCsv` reports both as `duplicate`; an override for `SRC-0005` does not make either one staged.
  - `applyReader never passes payment or choose rows`: the output file has no such rows, and `payments`/`choose` hold their row numbers.
  - (`imports.test.ts`) `auto mapping parses and older mappings still parse`: invoice, expense and mixed fixtures from existing tests still parse; `auto` with 25 columns or 501 `excludedIds` is rejected.
- [ ] **Step 2:** Run `npm run test:unit -- lib/domain/reader.test.ts lib/domain/imports.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement**
  - Add the `auto` variant to `csvMappingSchema` (keep it a discriminated union; `mapCsv` keeps rejecting `auto` directly with "Use the reader first.").
  - Implement `labelRows` with the rule order from spec §3: Type words → party columns → negative amount → payment words; conflicts → `choose`.
  - Implement `applyReader`.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: label mixed rows and map them through the reader`.

### Task 3: Selector screen for uploads

**Files:**
- Create: `components/import-selector.tsx`
- Modify: `components/csv-import.tsx` (`readMappingForm`, `MappingKind` gains `"auto"`), `app/(workspace)/imports/actions.ts` (`inspectCsvAction` returns suggestions and labels; preview/stage apply `applyReader` for `auto`), `app/globals.css` (selector table, phone-width scroll only inside the table)
- Test: `lib/ui/import-selector.test.ts`

**Interfaces:**
- Consumes: Tasks 1–2.
- Produces:
  - `<ImportSelector headers samples suggestions labels defaults onChange />`, controlled. It emits the `columns`, `excludedIds`, `overrides` and column-role fields of an `AutoMapping`.
  - `readSelectorForm(data: FormData): AutoMapping` in `components/import-selector.tsx`, reused by Task 8.

- [ ] **Step 1: Write the failing tests** (`lib/ui/import-selector.test.ts`, same style as `lib/ui/sheet-connection.test.ts`)
  - `select all ticks every row and column`, then `unticking a column removes it from columns`.
  - `unticking a row adds its ID to excludedIds`.
  - `changing a label to expense records an override`; labels can only be set to invoice or expense, while payment and choose rows show their reason.
  - `choose rows block saving` with the message "Pick Invoice or Expense for 2 rows, or untick them."
  - `no ID column blocks saving` with the message "Choose the column that stays the same when a row is edited (for example an invoice or reference number). Without it, an edited row would look new and could be imported twice."
  - `payment rows show` "Payment — record it in Collections".
  - `checkboxes and label selects have accessible names` naming the row ID and column.
- [ ] **Step 2:** Run `npm run test:unit -- lib/ui/import-selector.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the component. Wire it into the upload flow as the default kind (`auto`), keeping the existing invoice, expense and mixed forms under "Set columns manually". In actions, call `applyReader` and then `mapCsv` for `auto`; the action response adds the counts `payments` and `choose`.
- [ ] **Step 4:** Run the Step 2 command plus `npm run test:unit -- lib/domain` and `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Browser check (localhost)**
  - Upload a new fictional mixed CSV, `public/samples/pondopath-mixed.csv` (create it: 8 rows including 2 invoices, 2 bills, 1 payment, 1 conflicting, 1 duplicate ID and 1 negative amount).
  - Confirm the labels, ticks and blocks, both at full width and at 390 px.
- [ ] **Step 6:** Commit: `feat: add the column and row selector with reader labels to uploads`.

### Task 4: Token safe and Google client

**Files:**
- Create: `lib/server/token-safe.ts`, `lib/server/google.ts`
- Test: `lib/server/token-safe.test.ts`, `lib/server/google.test.ts`

**Interfaces:**
- Produces:
  - `sealToken(plain: string): string` returns `"v1.<nonce b64url>.<ciphertext+tag b64url>"`. `openToken(sealed: string): string` throws `TOKEN_UNREADABLE`. Both read `GOOGLE_TOKEN_ENCRYPTION_KEY`; a missing key or one that is not 32 bytes throws `GOOGLE_NOT_CONFIGURED`.
  - `googleConfig(): { clientId; clientSecret; pickerKey; projectNumber }`, which throws `GOOGLE_NOT_CONFIGURED`.
  - `type GoogleError = "GOOGLE_RECONNECT" | "FILE_ACCESS_LOST" | "FILE_TOO_LARGE" | "FILE_NOT_SUPPORTED" | "GOOGLE_UNAVAILABLE"`, thrown as `new Error(code)`.
  - `exchangeCode(code: string, verifier: string, redirectUri: string): Promise<{ refreshToken: string; scopes: string[]; email: string }>`
  - `accessToken(refreshToken: string): Promise<string>`
  - `revoke(refreshToken: string): Promise<void>`, best effort; never throws.
  - `fileInfo(token: string, fileId: string): Promise<{ id; name; mimeType; size: number | null; trashed: boolean }>`
  - `readFile(token: string, info: FileInfo, tab?: string): Promise<{ tabs: string[]; tab: string | null; read: ConnectorSheetRead }>`:
    - **Sheets:** try `spreadsheets.values.get` (`UNFORMATTED_VALUE`, `SERIAL_NUMBER`). On 403 with an insufficient-scope reason, fall back to Drive `files.export` as `.xlsx` and then `readXlsx`.
    - **`.xlsx`:** `files.get?alt=media`, then `readXlsx`.
    - **`.csv`:** `alt=media`, then the existing CSV reader.
    - Sizes over 5 MiB → `FILE_TOO_LARGE`.
  - All `fetch` calls go through one injectable `googleFetch` (a module-level setter used only by tests).

- [ ] **Step 1: Write the failing tests**
  - `seal/open round trip`; `tampered ciphertext → TOKEN_UNREADABLE`; `different key → TOKEN_UNREADABLE`; `two seals of the same token differ`; `error messages never contain the token`.
  - `exchangeCode rejects missing drive.file scope` (`GOOGLE_RECONNECT`), and `rejects a response without a refresh token`.
  - `accessToken maps invalid_grant to GOOGLE_RECONNECT`, and 5xx or timeout to `GOOGLE_UNAVAILABLE`.
  - `fileInfo maps 404 and trashed to FILE_ACCESS_LOST`, and MIME types other than Sheet/xlsx/csv to `FILE_NOT_SUPPORTED`.
  - `readFile: sheets via values.get`, `falls back to xlsx export on insufficient scope`, `xlsx and csv give the same read shape` (the same fixture in three forms gives equal `headers`, `rows` and `rowNumbers`), and `over 5 MiB → FILE_TOO_LARGE` (checked from metadata and from the streamed length).
- [ ] **Step 2:** Run `npm run test:unit -- lib/server/token-safe.test.ts lib/server/google.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** with `node:crypto` AES-256-GCM, a 12-byte random nonce and a 16-byte tag. Use plain `fetch` with a 15-second `AbortSignal.timeout`; no new dependency. Both files start with `import "server-only"`.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: add the server-only Google token safe and client`.

### Task 5: Database — Google connections and the Google door

**Files:**
- Create: `supabase/migrations/<timestamp>_connect_google.sql` (generate the timestamp with the existing migration naming)
- Modify: `lib/database.types.ts` (regenerate), `docs/database.md` (new table and functions)
- Test: `tests/integration/google-connect.test.ts`

**Interfaces:**
- Produces:
  - **Table `public.google_connections`:** `business_id` uuid primary key referencing businesses; `owner_id` uuid; `account_email` text; `refresh_token_sealed` text; `scopes` text[]; `status` (`connected`, `needs_reconnect`, `disconnected`); `created_at`; `updated_at`.
    - RLS: members can select every column except `refresh_token_sealed`, using column grants as in Task 17.
    - No insert or update from `authenticated`.
  - **`intake_sources.kind` gains `google_drive_file`:**
    - widen `intake_sources_connector_shape` to `(kind in ('google_sheet','google_drive_file')) = (connector_status is not null)`;
    - add the columns `sync_lease_until timestamptz` and `google_file_id text`;
    - add a unique index on `(business_id, google_file_id)` where the kind is `google_drive_file` and the status is not `disconnected`.
  - **Mapping validation** in `save_connector_mapping` accepts `auto`. `save_connector_mapping`, the pause/resume function and the file-disconnect function accept both connector kinds; key replacement stays `google_sheet` only.
  - **Owner RPCs (authenticated):**
    - `create_google_file_connection(p_label text, p_settings jsonb) returns uuid` (settings: `fileId`, `name`, `mimeType`, `tab`);
    - `disconnect_google()`, which marks the connection and all its files disconnected and nulls the token.
  - **`service_role`-only RPCs:**
    - `google_connection_save(p_business uuid, p_owner uuid, p_email text, p_sealed text, p_scopes text[])`
    - `google_connection_status(p_business uuid, p_status text)`
    - `google_connection_token(p_business uuid) returns text`
    - `google_file_source(p_source_id uuid) returns jsonb`: the same shape as `connector_source`, plus `fileId`, `tab` and `googleStatus`
    - `google_file_ingest(p_source_id uuid, p_run jsonb) returns jsonb`
    - `google_claim_due(p_limit int) returns uuid[]`: active `google_drive_file` sources whose connection is connected, with `last_run_at` null or older than 10 minutes and the lease expired. It sets a 3-minute lease and returns the oldest first.
    - `google_claim_source(p_source_id uuid) returns boolean`: the lease for Sync now.
  - **Refactor:** move the body of the **latest** `connector_ingest` (from `20261106101246_connector_header_refresh.sql`) into `private.connector_ingest_core(source public.intake_sources, p_run jsonb)`.
    - `connector_ingest` keeps its key check and calls the core.
    - `google_file_ingest` checks `kind='google_drive_file'` and that the source is not disconnected, then calls the same core and clears the lease.

- [ ] **Step 1: Write the failing integration tests**
  - `members cannot read refresh_token_sealed` (select as owner and as finance → permission error on that column).
  - `authenticated cannot call the service_role functions` (each → permission denied).
  - `create_google_file_connection is owner-only and rejects a duplicate file`.
  - `google_file_ingest refuses google_sheet sources and connector_ingest refuses google_drive_file sources`.
  - `google_claim_due honours the 10-minute due time and the 3-minute lease`: a second claim inside the lease returns nothing.
  - `disconnect_google nulls the token and disconnects files but keeps runs and items`.
  - `pause, resume and disconnect work for a google_drive_file source, and replacing a key is refused for it`.
  - `existing connector tests still pass` (`tests/integration/connector.test.ts` unchanged).
- [ ] **Step 2:** Run `npm run test:integration -- tests/integration/google-connect.test.ts`. Expected: FAIL (functions missing).
- [ ] **Step 3: Write the migration.** **Stop and ask Bryan to approve applying it** to `soloforge-cashflow-dev`, then apply it with the Supabase MCP and regenerate the types.
- [ ] **Step 4:** Run the Step 2 command plus `npm run test:integration -- tests/integration/connector.test.ts`. Expected: PASS. Also run `get_advisors` (security) and confirm no new warnings.
- [ ] **Step 5:** Commit: `feat: store Google connections and add the server-only Google door`.

### Task 6: Ingest core with two doors

**Files:**
- Modify: `lib/server/connector-intake.ts`
- Test: `lib/server/connector-intake.test.ts`

**Interfaces:**
- Consumes: Task 2 (`applyReader`), Task 5 (`google_file_source` and `google_file_ingest`).
- Produces:
  - `ingestConnectorRead(sourceId, key, input)`, unchanged (n8n door).
  - `ingestGoogleRead(sourceId: string, read: ConnectorSheetRead | { runId: string; error: string }): Promise<ConnectorRunSummary>`.
  - `ConnectorRunSummary` counts gain `payments: number` and `choose: number[]` (at most 500, the row numbers). The SQL counts check from Task 5 allows these keys.

- [ ] **Step 1: Write the failing tests**
  - `auto mapping stages invoices and expenses and never payment/choose rows`.
  - `auto counts report payments and choose rows`.
  - `google door uses google_file_source/google_file_ingest and never sends a key`.
  - `evidence via is "google_drive_connector" for the google door and unchanged for n8n`.
  - `edited row gives exactly one changed proposal and a repeat read stages nothing` (through the Google door).
  - `existing n8n tests unchanged`.
- [ ] **Step 2:** Run `npm run test:unit -- lib/server/connector-intake.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Split the body into `ingestCore(door: { source(): Promise<Source>; ingest(run): Promise<Result>; via: string }, sourceId, read)`. The two exported functions build their door. Apply `applyReader` before `mapCsv` when `mapping.kind === "auto"`; the required-header check covers `mapping.columns`.
- [ ] **Step 4:** Run the same command plus `connector-route.test.ts`. Expected: PASS.
- [ ] **Step 5:** Commit: `refactor: share the connector ingest core between n8n and Google`.

### Task 7: Google sign-in routes and disconnect

**Files:**
- Create: `app/api/google/connect/route.ts`, `app/api/google/callback/route.ts`, `lib/server/google-auth.ts`
- Modify: `app/(workspace)/imports/connector-actions.ts` (add `disconnectGoogleAction`)
- Test: `lib/server/google-auth.test.ts`

**Interfaces:**
- Consumes: Task 4 (`exchangeCode`, `sealToken`, `revoke`), Task 5 (`google_connection_save`, `disconnect_google`).
- Produces:
  - `startGoogleSignIn(origin: string): Promise<Response>`: owner only. Sets the cookie `pp_google_oauth` (httpOnly, Secure when https, SameSite=Lax, Path `/api/google`, Max-Age 600) holding state, the PKCE verifier and `businessId`. Redirects 302 to Google with the scopes `openid email https://www.googleapis.com/auth/drive.file`, `access_type=offline`, `prompt=consent`, `include_granted_scopes=false`, and `code_challenge_method=S256`.
  - `finishGoogleSignIn(url: URL, origin: string): Promise<Response>`: verifies the state, verifier, owner and same business. It calls `exchangeCode`, then `google_connection_save` with the sealed token, deletes the cookie and redirects to `/imports?google=connected`; any failure redirects to `/imports?google=failed`.
  - The redirect URI is `${origin}/api/google/callback`, where `origin` comes from the existing `APP_URL` (localhost fallback outside production, as in `lib/server/invitations.ts`), never from request headers.

- [ ] **Step 1: Write the failing tests**
  - `finance user is refused` (redirect `google=failed`, no Google call).
  - `missing or mismatched state is refused`.
  - `wrong PKCE verifier is refused`.
  - `missing drive.file scope stores nothing`.
  - `success stores only a sealed token`: the saved value starts with `v1.` and does not contain the raw token.
  - `different Google account replaces the email` (Review Focus 5): files are left as they are, so the next sync decides access.
  - `cancelled sign-in` (`error=access_denied`) → `google=failed` with nothing stored.
  - `disconnectGoogleAction revokes, then calls disconnect_google`, and is owner-only.
- [ ] **Step 2:** Run `npm run test:unit -- lib/server/google-auth.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the logic in `lib/server/google-auth.ts`; the route files only call it. Read the Next.js route handler and `cookies()` guides first.
- [ ] **Step 4:** Run the same command and `npm run typecheck`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: add owner-only Connect Google sign-in`.

### Task 8: Picker, file connection and first setup

**Files:**
- Create: `components/google-connect.tsx`, `app/(workspace)/imports/google-actions.ts`
- Modify: `app/(workspace)/imports/page.tsx` (load the Google connection and `google_drive_file` sources; render `GoogleConnect` above the n8n `SheetConnection`, which moves under "Advanced: operator route")
- Test: `lib/server/google-actions.test.ts`, `lib/ui/google-connect.test.ts`

**Interfaces:**
- Consumes: Task 3 (`ImportSelector`, `readSelectorForm`), Task 4 (`accessToken`, `fileInfo`, `readFile`), Task 5 (`create_google_file_connection`, `save_connector_mapping`), Task 6 (`ingestGoogleRead`).
- Produces these server actions:
  - `pickerSessionAction(): { token: string; pickerKey: string; projectNumber: string; expiresAt: number }`: owner only.
  - `createGoogleFileAction(fileId: string): { sourceId; tabs: string[] }`: owner only. The server re-reads the metadata; a Google Doc, the wrong MIME type, a trashed file, over 5 MiB or no access are each refused with their message.
  - `chooseTabAction(sourceId: string, tab: string)`: runs the first read through `ingestGoogleRead` and returns the headers, samples, suggestions and labels.
  - `saveGoogleSetupAction(sourceId: string, form: FormData)`: `readSelectorForm`, then `save_connector_mapping`.

- [ ] **Step 1: Write the failing tests**
  - `pickerSessionAction is owner-only and returns a short-lived token, never the sealed one`.
  - `createGoogleFileAction rejects a Doc, an oversize file, a trashed file and an unknown ID` (Review Focus 4); no source row is created for any of them.
  - `the browser-sent name is ignored`; the name comes from `fileInfo`.
  - `first read returns suggestions and labels for the chosen tab`.
  - (UI) `Connect Google shows "Connected as <email>"`, `Reconnect Google when status is needs_reconnect`, `file cards show the last sync summary` ("3 new, 1 changed, 12 unchanged, 1 payment, 2 need your choice"), and `n8n route sits under Advanced`.
- [ ] **Step 2:** Run `npm run test:unit -- lib/server/google-actions.test.ts lib/ui/google-connect.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Load the Picker script `https://apis.google.com/js/api.js` only after the click. Use `DocsView` limited to the MIME types `application/vnd.google-apps.spreadsheet`, the xlsx type and `text/csv`, and call `setAppId(projectNumber)`. Pass only the file ID to `createGoogleFileAction`.
- [ ] **Step 4:** Run the same command and `npm run typecheck`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: pick a Drive file and set it up with the selector`.

### Task 9: Sync — Sync now, inbox open and cron route

**Files:**
- Create: `lib/server/google-sync.ts`, `app/api/intake/google/sync/route.ts`
- Modify: `app/(workspace)/imports/google-actions.ts` (`syncNowAction`), `app/(workspace)/imports/page.tsx` (start the inbox-open sync with `after()`)
- Test: `lib/server/google-sync.test.ts`

**Interfaces:**
- Consumes: Tasks 4–6.
- Produces:
  - `syncGoogleFile(sourceId: string): Promise<ConnectorRunSummary>`: open the token, get an access token, `fileInfo`, `readFile`, then `ingestGoogleRead`. Errors map as follows:
    - `GOOGLE_RECONNECT` → `google_connection_status('needs_reconnect')`, and the run is recorded as failed;
    - `FILE_ACCESS_LOST`, `FILE_TOO_LARGE` and `GOOGLE_UNAVAILABLE` → the run is recorded as failed with that code;
    - the run ID is `google-<ISO timestamp>-<random 6>`.
  - `syncDue(limit = 5): Promise<{ synced: number; failed: number }>`: `google_claim_due`, then each file in turn; one failure never stops the rest.
  - `syncBusinessIfDue(businessId: string): Promise<void>`: for the inbox open.
  - Route `POST /api/intake/google/sync`: `Authorization: Bearer ${GOOGLE_SYNC_CRON_SECRET}`, compared in constant time. Responds `{ ok, synced, failed }` with no file data; a wrong or missing secret gets 401.

- [ ] **Step 1: Write the failing tests**
  - `route refuses a missing or wrong secret`.
  - `syncDue syncs only claimed files and continues after one fails` (Review Focus 3): file 1 token refused → connection `needs_reconnect`; file 2 from another business still staged; nothing partial.
  - `lease blocks a parallel Sync now`.
  - `access lost records FILE_ACCESS_LOST and keeps proposals`.
  - `syncNowAction allows owner and finance and refuses others`.
  - `inbox-open sync does not block the page response`: the page renders while the sync promise is still pending.
  - `no token or row content appears in logs or responses` (spy on `console`).
- [ ] **Step 2:** Run `npm run test:unit -- lib/server/google-sync.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Read the Next.js guide for `after()` first.
- [ ] **Step 4:** Run the same command, then the whole unit suite once (`npm run test:unit`) and `npm run typecheck && npm run lint`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: sync connected Drive files on demand, on inbox open and by cron`.

### Task 10: Real proof, cron setup and records

**Files:**
- Create: `supabase/cron/google-sync.sql` (the `pg_cron` + `pg_net` job, applied **after deployment** with Bryan's approval; the secret is read from Vault or entered by Bryan, never committed)
- Modify: `docs/development.md` (the six environment variables and Google setup pointer), `docs/testing.md` and `docs/mvp-runtime-evidence.json` (`connectGoogleProof`), `tasks/todo.md`, `tasks/plan.md`

**Interfaces:**
- Consumes: everything above. Needs Bryan's completed Google Cloud setup and his browser sign-in.

- [ ] **Step 1: `drive.file` read check.** Bryan connects locally and picks the fictional test Sheet. Record which read method `readFile` used (values.get or the xlsx export).
- [ ] **Step 2: Full journey.** Pick → tab → selector (untick one column and one row, change one label) → save → Sync now. Expected: invoices and expenses arrive in the inbox; payment and choose rows are listed and not staged.
- [ ] **Step 3: Edited-row proof.** Change SRC-0002's amount to 9000 in the Sheet → Sync now. Expected: exactly one changed proposal. A second Sync now stages nothing.
- [ ] **Step 4: Access-error proof.** Trash the file → Sync now → "PondoPath can't open this file anymore". Restore it → it syncs again.
- [ ] **Step 5: Excel in Drive.** Upload a fictional `.xlsx` to Drive, pick it and sync. Expected: the same results.
- [ ] **Step 6: Final checks.** Run the full unit and integration suites once on Node 24, plus typecheck, lint and a production build. Run a whole-branch review at medium effort.
- [ ] **Step 7: Records.** Write the evidence and update the plan and checklist. The cron job is marked "ready, applied at deployment".
- [ ] **Step 8:** Commit: `docs: record the Connect Google proof`.
