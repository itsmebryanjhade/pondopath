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

Setup, import and operation steps are added with the workflow file (Task 7).
