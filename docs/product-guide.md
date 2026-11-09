# Using PondoPath

## Accounts and private team access

Create an account at `/signup`, then complete `/setup` to create one empty, private business workspace with owner access. Each account belongs to one business; there is no business switcher. Existing users sign in at `/login`. The [public-sign-up plan](superpowers/plans/2026-10-30-public-signup.md) supersedes the earlier invite-only registration default. Email confirmation is temporarily disabled in the development project for immediate fictional-data testing; enable and verify it before a real-business pilot.

Owners can choose **Invite a teammate** in the workspace, enter the recipient's name and work email, and copy the generated link. Share it privately with that person. No email is sent automatically. The invited account receives finance access in that owner's workspace; the invitation cannot transfer an existing membership or create an owner. Existing activated accounts should sign in instead.

Set `APP_URL` to the application's trusted origin (for example `http://localhost:3000` in development, an HTTPS origin in production). Invitation links use this address, so a localhost link works only on the same computer. Supabase Auth controls invitation expiry and one-use verification. The token is kept in the URL fragment, consumed only by the password setup POST, and never written to application logs. If setup is interrupted after verification, the same authenticated invited session can retry setting its password. Missing workspace membership still blocks access.

The core includes persistent financial records, verified partial payments, a 30-day forecast, reviewed commitments/reminders, follow-ups, history, what-if previews, English/Tagalog/Taglish AI assistance and the Node-RED missed-commitment flow. The next-action worklist and CSV Review Inbox are also implemented. The [delivery sequence](superpowers/plans/2026-11-02-pondopath-delivery-sequence.md) records current verification and remaining demo/deployment work.

[PRD revision 1.1](superpowers/specs/SoloForge_Cash-Flow_Action_Planner_PRD_v1.0.md) tracks the approved expansion. Tasks 13–16 provide the worklist, shared Review Inbox and CSV/XLSX import. n8n spreadsheet/file connections, receipt-image extraction, inbound business messages and named accounting/POS adapters remain planned. Deliver one reviewed slice at a time; keep manual operation and human confirmation before financial changes.

## Spreadsheet import and review

Open **Add records** (`/add`; the sidebar's **Add records** button, the phone bar's centre **Add**, or drag a file over any workspace page). **Type it in** on that page holds the shortcuts for adding one invoice, one expense or a received payment. Drop or choose an Excel or CSV file, check what PondoPath found (File → Check → Done), then send the rows to the **Review Inbox**, which now only reviews and confirms. Connect Google and the advanced n8n route live on the same page. The owner's first upload creates a hidden default file source; finance teammates use it afterwards.

The older notes below describe the same import rules. The owner creates a named spreadsheet source; finance teammates can reuse it. One source accepts both UTF-8 CSV and Excel `.xlsx` files, so keep using it when a spreadsheet moves between formats. For a workbook, choose one worksheet first. Upload the file, select invoice or expense records, map its columns, and preview each row. Select existing business customers explicitly. Fictional CSV and Excel samples are provided on the page.

Use the same source and stable row IDs for later versions of a spreadsheet. Valid rows become proposals; invalid and duplicate rows stay out. Review the original source, current saved record and proposed values, then edit, clarify, reject or explicitly confirm each item. Confirmation uses the existing financial commands and permissions. Imports do not post cash, and missing rows never delete records. Repeated confirmations and uploads retain their earlier results.

Limits are 512 KiB, 100 data rows and 24 columns (A–X) per import, PHP amounts, ISO dates, a 16,384-character parser record cap and 16 KiB of retained source evidence per item. Invoice/expense proposals are supported; importing actual receipts, payments and new customers is outside this slice. Workbooks must use plain values: cell formulas, macros, linked workbooks, Excel error values and TRUE/FALSE cells are rejected, and identifiers should be stored as Text to keep leading zeros. The Review Inbox paginates 20 items; direct proposal links open the selected item. Its intake endpoint currently accepts same-origin signed-in sessions; external connector credentials are not implemented.

## AI assistant

The workspace's **AI assistant** button opens English/Tagalog/Taglish explanations, customer-reply proposals and editable reminder drafts. It uses the server-only OpenRouter settings in `.env.example`, with `APP_URL` matching the browser origin (locally, `http://localhost:3000`). The current evaluated configuration is GPT-4.1 mini through the `openai` provider, with fallback routing disabled. Only fictional demo businesses are enabled; real-data use requires a separate privacy/operations review.

The assistant never posts payments, changes records, approves reminders or sends messages. Reviewed proposals use the existing receipt-plan/draft forms. A shared database allowance limits requests to the business's configured daily cap (at most 50), including failed attempts; upstream requests time out after 20 seconds. Manual forms and templates remain available without an AI key.

Run `node --env-file=.env.test.local scripts/evaluate-ai.mjs` against the local running app for the guarded live evaluation. It creates and removes its own isolated fictional fixture, signs in through normal session cookies, checks that no financial records changed, and writes `docs/ai-evaluation.json`. It makes real requests using the server's configured provider and may incur provider charges. See [AI verification](ai-verification.md) for scope, results and limitations.
