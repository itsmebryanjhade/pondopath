# Add records page: design

Status: approved in conversation on 7 November 2026; awaiting review of this written spec.
Part of the workspace redesign (piece 1 of 9). Later pieces: workflow guide bar, side menu, Overview, Quick add and manual entry, Invoices and Expenses, Review Inbox, Cash and Forecast, final pass.

## Purpose

Bringing records in is the hardest step for a new owner. Today the Review Inbox page asks a person to create a "source" (owner only), pick it from a dropdown, choose a file, click "Read columns", map columns, preview and send. It shows about 370 words and 15 buttons, with wording such as "UTF-8 CSV or XLSX", "512 KiB", "stable row IDs" and "YYYY-MM-DD".

The new **Add records** page makes the first import quick and obvious. The core job it serves is the product's single job: know the next 30 days of cash and who to chase. The journey is Add records, Review, Forecast, Follow up.

## Success criteria

- From opening the page to "rows ready to review": about 3 clicks and under a minute with the sample file.
- From sign-up to a first forecast: under 3 minutes with the sample file (measured in the browser, not claimed from the article).
- No internal terms on screen: no "source", "UTF-8", "KiB", "row ID" or "YYYY-MM-DD".
- Page text above the fold stays under about 120 words.
- Every state works at 375px, by keyboard, and with reduced motion.

## Scope

In scope:

- A new page at `/add` with three choices: drop or choose a file, connect a Google Sheet, type it in.
- An inline three-step flow after a file is chosen: File, Check, Done.
- A "Drop to import" overlay when a file is dragged over any workspace page.
- A toast host, used for the import result and for wrong-file messages.
- Moving the import and Connect Google panels off the Review Inbox page, which keeps only reviewing and confirming.
- A hidden default file source, so people never see the word "source".

Out of scope (later pieces or later work):

- Redesign of manual entry forms. "Type it in" opens today's add forms until the Quick add piece.
- The workflow guide bar and side menu changes.
- Database changes. Finance teammates cannot create the first source today; see Open decision.
- Emailed teammate invitations, billing and an admin usage view. These came up while reading the SaaS MVP article and are post-demo items.

## The page

Heading: "Add your records". One line under it: "Bring them in from a file, or type them in."

Layout:

1. **Drop area** (primary, largest): icon, "Drop your Excel or CSV file here", a **Choose file** button, and a small "Try a sample file" download link.
2. **Two smaller cards beside it:** **Connect Google Sheet** and **Type it in**.
3. **Advanced** link at the bottom, collapsed, containing the existing n8n operator route. It is not part of the main layout.

The source dropdown, the "Create a spreadsheet source" form and the limits paragraphs are removed from view.

## After a file is chosen

The page shows a three-step indicator (File, Check, Done) and the flow runs in place. Reading the file starts as soon as it is chosen, so "Read columns" disappears.

- **Check:** one plain sentence from the reader, for example "We found 12 invoices and 3 expenses." Below it, a compact preview of the first 5 rows. Columns are matched automatically. Only a column the reader cannot match shows a dropdown, labelled in plain words, such as "Which column has the due date?". Rows that need a choice or that look like payments are counted and explained in one line, as today.
- **Send:** one primary button, "Send 15 rows to review".
- **Done:** a check animation and "15 rows are ready to review. Nothing is saved yet." with **Review now**. A toast with the same message and a **Review** button appears too.

Worksheets: if an Excel file has several sheets, a "Which sheet?" choice appears in the Check step. Otherwise it is hidden.

## Drop anywhere and the toast

- A client component mounted in the shared workspace frame listens for files dragged over the window and shows a full-screen "Drop to import" overlay.
- Dropping an `.xlsx` or `.csv` file stores it in a small in-memory holder and navigates to `/add`, which picks it up and starts the Check step. If the page is already `/add`, it uses the file directly.
- Any other file type shows a toast: "Only Excel (.xlsx) and CSV files."
- The holder is memory only. It is cleared when the file is read, and is never written to storage or the URL.
- The toast host is a single `aria-live="polite"` region. Messages are full phrases, auto-dismiss after about 5 seconds, can be dismissed, and never take focus.

## Words

- Labels are 3 to 6 words with at most one short helper line.
- Limits appear only when someone hits them, with what to do next. Examples: "That file is too big. Export fewer rows and try again." and "That file has too many rows. Send up to 100 at a time."
- The safety promise "Nothing is saved until you confirm" appears once, on Done.
- Errors say what happened and what to do. No codes.

## Architecture

New files:

- `app/(workspace)/add/page.tsx`: server page (Suspense, workspace shell) that loads customers, Google connection state and the default source, and renders the client components. Runs the same "catch up Google files" step as the inbox does today.
- `components/add-records.tsx`: client component for the drop area, the three choices and the three-step flow. It reuses `ImportSelector` for any unmatched column.
- `components/file-drop-overlay.tsx`: window drag listener and overlay.
- `components/toast-host.tsx`: toast context and host, mounted in `WorkspaceFrame`.
- `lib/domain/add-records.ts`: pure helpers: file kind check, summary sentence from reader labels, plain-words error messages. Unit tested.
- `lib/ui/pending-file.ts`: the in-memory holder.

Changed files:

- `app/(workspace)/imports/actions.ts`: add `ensureFileSourceAction`, which returns the business's first `manual_csv` or `manual_xlsx` source, or creates one labelled "Uploaded files" when the caller is an owner. Existing `inspectCsvAction`, `previewCsvAction` and `stageCsvAction` stay unchanged and keep all server-side limits.
- `app/(workspace)/imports/page.tsx`: remove `CsvImport`, `GoogleConnect` and the n8n details; add an "Add records" button; keep the inbox, filters and Confirm selected.
- `lib/server/google-auth.ts` and its tests: the sign-in result redirects to `/add?google=connected` or `/add?google=failed`.
- `components/customer-invoices.tsx`: the "Import & review" link points to `/add`.
- `components/workspace-navigation.tsx`: `/add` highlights the same item as `/imports`.
- `components/workspace-frame.tsx`: mount the toast host and drop overlay.
- Quick add menu: a link "Import a file" to `/add`.

Data flow: file chosen or dropped, then `ensureFileSourceAction`, then `inspectCsvAction` (headers, labels, counts), then optional column choices, then `previewCsvAction`, then `stageCsvAction`, then Done and toast. The server remains the only place files are parsed and validated.

`components/csv-import.tsx` stops being rendered. Its shared exports (`ImportMappingFields`, `readMappingForm`) stay because the Sheet connection still uses them.

## Security and limits

- File type, size (512 KiB), row and column limits are enforced on the server exactly as today. The new client checks only improve the message.
- No file contents or names are placed in URLs, storage or logs. The in-memory holder is cleared after reading.
- Roles are unchanged: owners may create the default source and connect Google; finance staff may import into an existing source. Authorization stays in the server actions and database.
- Drop handling accepts the first file only and ignores non-file drags such as text.

## Accessibility and motion

- The drop area is a real button with a visible focus ring and a keyboard path: Enter opens the file chooser. The step indicator is an ordered list with `aria-current="step"`.
- Status, counts and results are announced as full phrases in one `role="status"` region. Colour is never the only signal.
- Targets are at least 44px. Contrast is at least 4.5:1 for text.
- Motion: the drop area pulses while a file is dragged over it, steps slide in, the Done check pops, and the toast slides in. Only opacity and transform are animated, and all of it is off under `prefers-reduced-motion`.

## Testing

- Unit tests for `lib/domain/add-records.ts`: accepted and rejected file kinds, summary sentences for mixed, invoice-only and empty results, plain error messages for each limit.
- Server tests for `ensureFileSourceAction`: reuses an existing source, creates one for an owner, refuses for finance staff when none exists, and keeps the owner-only rule.
- Updated Google callback redirect tests.
- Screen tests (static markup) for the three choices, the step indicator, the Check summary and the Done state.
- Browser checks: choosing a file, a simulated drag-and-drop anywhere in the app, the wrong-file toast, the Done state, 375px, and reduced motion. A real Google sign-in is not repeated in this piece.
- Existing intake integration tests continue to pass unchanged.

## Open decision

A finance teammate cannot create the first source, so if the owner has never uploaded, they see "Ask the owner to add the first file." Removing this limit needs a database change (a creation rule for the default source) and the user's approval in the session. It is deferred.

## Risks

- A browser can block drag events on some operating systems for files from certain apps. The **Choose file** button is always present as the fallback.
- The in-memory holder only survives client-side navigation. A full page reload after a drop loses the file, and the page then simply shows the normal drop area.
