# Connect Google, file selector and reader — design

Status: approved in conversation by Bryan on 6 November 2026, section by section; written spec awaiting his review. Demo item D2 in [the plan](../../../tasks/plan.md). Requirement: PRD 1.3 FR-14. Evidence: [connector landscape research](../../research/connector-landscape-2026-11.md). Builds on the [Google Sheet intake design](2026-11-06-google-sheet-intake-design.md) (Task 17).

## 1. Intent

**What Bryan asked for.** Connecting must be easy for business owners: a **Connect** button, a familiar Google sign-in, and choosing the file. No keys, connection IDs or n8n. After picking, the owner chooses which columns and rows to bring in (with **Select all**). PondoPath then recognizes what each row is (invoice, expense, payment), even when the types are mixed and unsorted.

**Who it is for.** The hackathon demo on Vercel under the company subdomain, with Bryan's Google test account and fictional data. Later, public release to Philippine businesses of all sizes.

**Success.**
- A picked Google Sheet or Excel/CSV file in Drive reaches the Review Inbox as proposals.
- The owner can untick columns or rows and change any row's label.
- Mixed rows are labelled correctly, and unclear ones wait for the owner.
- An edited row gives exactly one changed proposal, and a repeat sync adds nothing.
- Lost access shows a clear, recoverable message.
- Nothing changes money until a person confirms.

**Decisions made in the conversation.**
- **Syncing:** Supabase Cron every 10 minutes, plus a background sync when the inbox opens, plus **Sync now**.
- **Where reading happens:** in the PondoPath server on Vercel. Approaches 2 (a Supabase Edge Function) and 3 (browser only) were rejected.
- **Connections:** one Google connection per business, owned by the owner; one connection per picked file; the owner chooses the tab, with the first tab as the default.
- **Smart mapping:** the reader *is* smart mapping. The former smart-mapping item merges into this design, and it also serves ordinary CSV/XLSX uploads.
- **Payments:** payment rows are recognized and shown as "record it in Collections". They are never imported as proposals or cash for the demo.
- **Google mode:** Testing mode is enough for the demo. Production brand verification is optional before the demo and required for public release.

## 2. Scope

Built in two parts within one implementation plan:
- **Part A, Connect Google:** sign-in, token safe, file picker, file reader, sync.
- **Part B, Selector and reader:** used by Google files and by uploads.

**Not in this design:**
- OneDrive;
- payment proposals;
- AI label suggestions;
- Google production verification;
- import presets for named exports, beyond what the reader's rules recognize;
- moving the n8n operator route.

The n8n route keeps working unchanged.

## 3. Building blocks

### Part A — Connect Google

| Unit | Responsibility |
| --- | --- |
| Google sign-in routes `GET /api/google/connect` and `GET /api/google/callback` | **connect:** owner only. Creates a one-time state value and a PKCE verifier, kept in a short-lived, httpOnly, SameSite=Lax cookie. Redirects to Google with the scopes `openid`, `email` and `https://www.googleapis.com/auth/drive.file`, `access_type=offline` and `prompt=consent`.<br>**callback:** checks the state, the PKCE verifier and that the signed-in user is still the owner. Swaps the code for tokens with the server-only client secret, requires `drive.file` among the granted scopes, reads the account email from the ID token, stores the refresh token encrypted, and redirects to Imports. |
| Token safe (`lib/server/token-safe.ts`) | AES-256-GCM encrypt/decrypt with a random 12-byte nonce, using a 32-byte key from the server-only `GOOGLE_TOKEN_ENCRYPTION_KEY`. Stored as a versioned string so the key can be rotated. Wrong-key or tampered input fails closed. |
| Google connection record (new table `google_connections`, one per business) | Fields: business, owner user, account email, encrypted refresh token, granted scopes, status (`connected`, `needs_reconnect`, `disconnected`), timestamps. RLS lets members read only the non-secret columns; the token column is granted to `service_role` only. |
| Google client (`lib/server/google.ts`) | Refreshes access tokens, gets file metadata, reads Sheets, downloads files, revokes tokens. Maps Google errors to `GOOGLE_RECONNECT`, `FILE_ACCESS_LOST`, `FILE_TOO_LARGE` and `GOOGLE_UNAVAILABLE`. It is the only module that calls Google, so tests replace it. |
| File picker (Imports page) | An owner-only server action returns a short-lived access token, the browser API key and the project number. The browser opens Google's Picker limited to Google Sheets, `.xlsx` and `.csv`. After a pick, only the file ID is sent back. The server fetches the metadata itself (name, MIME type, size cap) before creating the file connection. |
| File reader | Produces the connector read shape `{ headers, rows, rowNumbers }` used by Task 17:<br>- **Sheets:** `spreadsheets.values.get` with unformatted values and serial-number dates. If `drive.file` does not permit it, export the Sheet as `.xlsx` through Drive and parse it. The first proof decides which.<br>- **`.xlsx` and `.csv`:** downloaded, then parsed with the existing `read-excel-file` and `csv-parse` paths.<br>The tab list comes from the same read. |
| File connection | An `intake_sources` row of a new kind, `google_drive_file`. It holds the file ID, name, MIME type, tab and Google connection ID in `connector_settings`. It reuses `connector_status`, the mapping, `last_run_at`, `last_run_summary` and `intake_connector_runs`. The `intake_sources_connector_shape` check is widened to cover both connector kinds. |
| Sync service and route `POST /api/intake/google/sync` | The route requires `Authorization: Bearer <GOOGLE_SYNC_CRON_SECRET>` and handles up to a few due files per call, oldest first, within the function time limit. A file is due when it is active, its Google connection is connected, and its last run is 10 minutes old or more.<br>A server action handles **Sync now** (owner or finance) and the inbox-open sync (started after the response, so the page does not wait).<br>A per-file lease of a few minutes, kept in the database, prevents overlapping runs. |
| Supabase Cron job | Every 10 minutes, `pg_net` posts to the deployed sync route with the cron secret only. No Google token or file data travels through the database's scheduled calls. It is configured after deployment; until then it is exercised by calling the route directly. |
| Ingest core with two doors | `ingestConnectorRead` is split into an authorization step and a shared core. The n8n door keeps the per-source key check. The Google door is called only by server code, through new `service_role`-only database functions. These mirror `connector_source`/`connector_ingest` without a key and accept only `google_drive_file` sources. Both doors share `private.stage_intake_rows`, the fingerprints and the run history. |

### Part B — Selector and reader

| Unit | Responsibility |
| --- | --- |
| Column detection (`lib/domain/reader.ts`) | Pure function. From the headers and up to 20 sample rows, it suggests a role per column: date, due date, customer, supplier, amount, reference/ID, type, description, ignore. Each suggestion has a confidence (`high` or `low`), using English, Taglish and Filipino header words plus value shapes (dates, numbers, ID-like text). Unknown columns stay unassigned. |
| Row recognition | Pure function. Labels each row `invoice`, `expense`, `payment` or `choose`, with a short reason. The rules, in order:<br>1. Type-column words (for example Invoice, Sales, Benta, Bill, Expense, Gastos, Payment, Bayad, Resibo);<br>2. which party column is filled (customer → invoice; supplier → expense);<br>3. a negative amount → expense;<br>4. payment words in the description.<br>Conflicting or missing signals give `choose`. Programmed only; no AI. |
| Selector screen | A preview table of up to the first 100 rows, with a checkbox per row and per column, plus **Select all** (all ticked at first). Each row shows its label and reason, editable by the owner. Column suggestions appear above it and are editable through the existing mapping fields (`ImportMappingFields`, with the reader's suggestions passed as `defaults`). Keyboard-accessible and usable at phone width. |
| Saved setup | Extends `csvMappingSchema` with:<br>- the chosen columns;<br>- the rows excluded at setup and per-row label overrides, both keyed by the row's stable ID (never by row position);<br>- `kind: "auto"`, which means the reader labels the rows.<br>Existing invoice, expense and mixed mappings stay valid. |
| Upload path | CSV/XLSX uploads get the same suggestions and labels before staging. Uploads keep their current one-time behaviour. |

## 4. Data flow

1. **Connect:** Connect Google → Google sign-in → callback stores the encrypted token → "Connected as …".
2. **Pick:** Choose a file → Picker → file ID → the server checks the metadata → the owner picks the tab → first read.
3. **Set up:** the selector shows the preview, column suggestions and row labels. The owner adjusts and saves. If no stable ID column can be identified, the screen explains why one is needed and asks the owner to add or choose one; saving is blocked until then.
4. **Sync:** cron, inbox open or Sync now → lease → refresh the access token → read the file (limits: 500 rows, file-size cap) → apply the saved setup → row results:

| Result | Handling |
| --- | --- |
| New or changed invoice/expense | Staged as a proposal; one per changed row |
| Unchanged | Skipped by fingerprint |
| Payment | Not staged; counted and listed as "record it in Collections" |
| Choose | Not staged; listed on the connection page until the owner labels it |
| Invalid | Recorded with the row number and reason |
| Excluded at setup | Ignored |

5. **Record:** the run is saved in `intake_connector_runs` and summarized on the connection card. Example: "Synced 2 min ago: 3 new, 1 changed, 12 unchanged, 1 payment, 2 need your choice".

New rows added to the file later are labelled by the reader automatically. Exclusions and overrides apply only to the IDs they name. A missing mapped column stops that file's sync and names the column (existing Task 17 behaviour).

## 5. Errors

| Situation | Behaviour |
| --- | --- |
| Sign-in cancelled, refused or `drive.file` not granted | Back to Imports with "Google wasn't connected"; nothing is stored |
| Refresh refused (expiry, revocation, Testing-mode 7 days) | Connection set to `needs_reconnect`; the card shows **Reconnect Google**. Reconnecting keeps every file's setup |
| File un-shared, deleted or trashed | That file shows "PondoPath can't open this file anymore"; history and proposals are kept |
| File over the size or row limit | A clear limit message; nothing is partly staged |
| Google slow or unavailable | The run is recorded as failed and retried on the next due sync; manual forms and uploads still work |
| Layout changed | That file stops and the missing column is named |
| Disconnect a file / Disconnect Google | Reads stop. Disconnecting Google also revokes the token at Google, deletes the stored token and stops all its files. History and proposals are kept |

## 6. Security

- **Tokens:** refresh tokens are encrypted at rest and readable only by `service_role` server code. They never reach the browser, logs, errors, run history or cron payloads. Only the short-lived, `drive.file`-limited access token goes to the browser, as Google's Picker design requires.
- **Secrets:** server-only environment variables `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_TOKEN_ENCRYPTION_KEY` and `GOOGLE_SYNC_CRON_SECRET`. The Picker browser key (`GOOGLE_PICKER_API_KEY`) and the project number are public by design; the key is restricted to the Picker API and to the registered origins.
- **Roles:** only the owner connects, sets up, reconnects or disconnects. Owners and finance can Sync now. Every action re-checks the business and the role.
- **Sign-in:** state and PKCE are checked, the exact registered redirect URIs are used, and scopes are checked after the exchange.
- **Least access:** `drive.file` only; files are read, never written.
- **File content is untrusted:** cells are validated by the existing import rules, formulas are read as values, and "paid" text never becomes cash. Everything stops at the Review Inbox for human confirmation.

## 7. Testing and proof

**Automated tests, written first (TDD).** Google is simulated through `lib/server/google.ts`.

| Area | Proves |
| --- | --- |
| Column detection | English, Taglish and Filipino headers matched; unknown headers left unassigned; confidence levels |
| Row recognition | A mixed, unsorted fictional file labelled correctly; conflicts become `choose`; overrides win |
| Saved setup | Exclusions and overrides survive re-sorting; payment and `choose` rows are never staged; older mappings still parse |
| Token safe | Round trip; wrong key or tampering fails; no token in errors |
| Sign-in routes | Non-owner, bad state, bad PKCE and missing scope refused; success stores only ciphertext |
| File reader | Sheets (both methods), `.xlsx` and `.csv` give the same shape; limits hold; Google errors mapped |
| Sync | Cron secret required; only due active files read; lease prevents overlap; repeat sync stages nothing; an edited row gives exactly one changed proposal |
| Database integration | Owner-only and business-isolated; the token column is not readable by `authenticated`; the Google-door functions refuse other callers and other source kinds |

**Real proof** (Bryan's Google test account, fictional data):
1. Read check under `drive.file`, which decides the Sheets read method.
2. Local connect → pick → selector → import.
3. Edited-row proof: SRC-0002 changed to 9,000 → exactly one changed proposal; a repeat sync adds nothing.
4. Access-error proof, then recovery.
5. An Excel file in Drive.
6. After deployment: the Supabase Cron sync on Vercel.

**Not claimed:** public sign-in for any Google account (production verification), OneDrive, payment proposals, AI suggestions.

## 8. Setup Bryan performs

Bryan does these steps in Google Cloud project `pondopath-dev`; the exact steps are given separately:
- configure the Google Auth Platform (branding, audience in Testing mode with his test users, data access with the three scopes);
- create a **Web application** OAuth client with the localhost and Vercel subdomain origins and callback URIs;
- enable the Google Picker API;
- create a browser API key restricted to the Picker and the same origins;
- put the values in `.env.local` and, later, in Vercel's environment settings.

Claude never sees the client secret or the encryption key.
