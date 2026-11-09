# n8n Google Sheet intake

n8n reads one Google Sheet on a schedule and sends its rows to PondoPath's connector endpoint. It never touches the database and never writes to the Sheet. Node-RED keeps the missed-commitment follow-up job; n8n handles intake only, so no job runs in both. Design: [Google Sheet intake design](../../docs/superpowers/specs/2026-11-06-google-sheet-intake-design.md).

## Preflight result — 6 November 2026 (Task 0: GO)

- **Runtime:** n8n 2.46.6 started with `npx --yes n8n@2.46.6 start` using the Node 24.22.1 binary (n8n supports Node 20.19–24.x; the machine default Node 26 is not supported). Bound to `127.0.0.1:5678` with diagnostics and personalization disabled.
- **Google:** project `pondopath-dev` with the Google Sheets API and Google Drive API enabled; service account `pondopath-reader@pondopath-dev.iam.gserviceaccount.com`. Its JSON key stays with Bryan and is entered only in n8n's encrypted credential store (credential type "Google Service Account API", impersonation off).
- **Access:** a fictional test Sheet shared with the service account as **Viewer** was read successfully through the Google Sheets node (*Sheet Within Document → Get Row(s)*). The caveat about service accounts created after 15 April 2025 did not block reading a Sheet shared directly with the account.
- **Output with *General Formatting = Values (unformatted)* and *Date Formatting = Serial Number*:**
  - Each row is an object keyed by the header text, plus an extra `row_number` key holding the Sheet row (2 = first data row).
  - Plain-text cells, including a leading-zero ID formatted as Plain text (`"00042"`), arrive as strings.
  - Empty cells arrive as `""`.
  - Amounts arrive as JSON numbers (`15000`, `8250.5`).
  - Dates arrive as whole-number serials (`46346` = 2026-11-20).
  - Checkbox cells arrive as JSON booleans (`true` / `false`).
- **Decision:** Node-RED keeps the missed-commitment job unchanged.

## Workflow: `google-sheet-intake.json`

Every 10 minutes (or on **Run now**), the workflow reads the selected tab through the Google Sheets API with the service account and read-only scope, builds `{ runId, headers, rows, rowNumbers }`, and posts it to `POST {appUrl}/api/intake/connectors/{sourceId}` with `Authorization: Bearer <connection key>`. A failed read posts `{ runId, error }` (`SHEET_ACCESS_DENIED`, `SHEET_NOT_FOUND` or `READ_FAILED`) and never sends Sheet content.

It calls the Sheets API (`values.get`, unformatted values, serial-number dates) instead of the Google Sheets node's *Get Row(s)*. That node returns header-keyed objects, which silently merge duplicate headers and emit nothing for an empty Sheet. The raw grid keeps both visible, so PondoPath can record them as a failed read for the owner. Blank rows are skipped, and the real Sheet row numbers are kept.

### Setup (owner and operator, once per Sheet)

1. **Start n8n** with Node 24 (the machine default Node 26 is unsupported):
   `N8N_DIAGNOSTICS_ENABLED=false N8N_PERSONALIZATION_ENABLED=false N8N_HOST=localhost N8N_LISTEN_ADDRESS=127.0.0.1 npx --yes n8n@2.46.6 start` with the Node 24 binary first on `PATH`. The editor is at `http://localhost:5678`, on loopback only.
2. **Import** `google-sheet-intake.json` from the n8n editor menu, or run `npx n8n@2.46.6 import:workflow --input=automation/n8n/google-sheet-intake.json`.
3. **In PondoPath (owner):** go to *Imports → Connect a Google Sheet*, share the Sheet with the robot email as **Viewer**, paste the Sheet link and create the connection. Copy the one-time **connection key** and the **connection ID**.
4. **Google credential:** open the existing *Google Service Account API* credential. Turn on **Set up for use in HTTP Request node** and set the scope to `https://www.googleapis.com/auth/spreadsheets.readonly`. Select this credential in **Read Sheet (read-only)**.
5. **Connection key:** create a **Header Auth** credential with name `Authorization` and value `Bearer <connection key>`. Select it in **Send to PondoPath**. The key lives only in n8n's encrypted credential store.
6. **Config node:** set `spreadsheetId` (the part of the Sheet link between `/d/` and `/edit`), `sheetName` (the tab name, for example `Sheet1`), `appUrl` (`http://localhost:3000` for local development) and `sourceId` (the connection ID).
7. **First read:** click **Run now**. PondoPath stores the headers and samples and shows the mapping form. Map the columns, optionally set a row filter, and save.
8. **Publish** the workflow so the 10-minute schedule runs while n8n is on. Missed runs catch up on the next read after the laptop or n8n restarts.

### Operation

- **Pause** in PondoPath to stop staging without touching n8n; reads are still recorded as paused.
- **Replace key** in PondoPath, then update the Header Auth credential. The old key stops working immediately.
- **Disconnect** in PondoPath to stop reads. History and proposals are kept.
- **Un-share** the Sheet to stop Google access; PondoPath then shows the access error.
- Export the workflow without credentials (editor menu → *Download*). Credentials and keys are never part of the file.
- `npx n8n` is fine for development and the proof. Move to Docker before n8n 3.0 (npm installs are deprecated there) or for longer-running use.
