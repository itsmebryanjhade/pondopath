# Add records page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give new owners a clean `/add` page where they drop or choose an Excel/CSV file, connect Google, or type records in, with a drop-anywhere overlay and a result toast, and keep the Review Inbox for reviewing only.

**Architecture:** A new server page `/add` renders one client component (`AddRecords`) that drives a three-step flow (File, Check, Done) on top of the existing import server actions. Pure helpers, an in-memory file holder and a toast host are small separate modules. The existing import actions, reader and limits are unchanged; only a new `ensureFileSource` hides the "source" concept.

**Tech Stack:** Next.js 16.4 App Router (read `node_modules/next/dist/docs/` before route work), React 19.3, TypeScript, Zod 4, Supabase, Vitest. CSS modules/global workspace CSS with existing tokens. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-07-add-records-page-design.md`

## Global Constraints

- Use Node 24 for every command: in bash, `export PATH="/c/Users/Bryan/AppData/Local/OpenAI/Codex/runtimes/cua_node/9c26d707817e90a7/bin:$PATH"`.
- Server-side limits stay exactly as today: 512 KiB, 100 data rows, 24 columns. Client checks only improve messages.
- No database changes. No new dependencies. Owner/finance permissions unchanged and enforced in server actions.
- Banned on screen: "source", "UTF-8", "KiB", "row ID", "YYYY-MM-DD". Labels 3 to 6 words, one short helper line at most. "Nothing is saved until you confirm" appears once, on Done.
- Page text above the fold stays under about 120 words.
- Motion animates only opacity and transform and is off under `prefers-reduced-motion`. Tap targets at least 44px, text contrast at least 4.5:1.
- File contents and names never go in URLs, storage or logs. The in-memory holder is cleared when read.
- Stage only your own files with `git add <path>`; never `git add .` and never touch `components/landing-mobile-menu.tsx`.
- Commit messages end with the attribution line given in the session reminder.

## Review Focus

- A drag of text or a link (not a file), or several files at once: ignore text, take the first file only, and the overlay must not stick. Pinned in Task 1 (`dragHasFiles`, `firstFile`) and Task 8.
- Dragging a file into the window and out again without dropping: the overlay hides. Pinned in Task 8.
- An Excel file with several sheets, or an empty/unreadable file: a "Which sheet?" choice, or a plain error with a way to retry, never a stuck spinner. Pinned in Tasks 1 and 5.
- Pressing Send twice, or sending the same file again: no duplicate rows and no scary error; the button is disabled while busy and "already received" is shown calmly. Pinned in Task 6.
- A finance teammate when no default file source exists: a friendly message, not a crash. Pinned in Task 3.

## File Structure

- Create `lib/domain/add-records.ts`, `lib/domain/add-records.test.ts`: pure helpers.
- Create `lib/ui/pending-file.ts`, `lib/ui/pending-file.test.ts`: in-memory file holder.
- Create `lib/ui/toasts.ts`, `lib/ui/toasts.test.ts`, `components/toast-host.tsx`: toast list logic and host.
- Create `lib/server/file-source.ts`, `lib/server/file-source.test.ts`: default file source.
- Create `components/add-records-parts.tsx`, `lib/ui/add-records-parts.test.ts`: presentational pieces.
- Create `components/add-records.tsx`: stateful flow using the existing actions.
- Create `components/file-drop-overlay.tsx`, `lib/ui/file-drop-overlay.test.ts`.
- Create `app/(workspace)/add/page.tsx`.
- Modify `app/(workspace)/imports/actions.ts`, `app/(workspace)/imports/page.tsx`, `lib/server/google-auth.ts` (+ `google-auth.test.ts`), `components/customer-invoices.tsx`, `components/workspace-navigation.tsx` (+ `lib/ui/workspace-navigation.test.ts`), `components/workspace-tools.tsx`, `components/workspace-frame.tsx`, `app/workspace.css`.

---

### Task 1: Pure helpers

**Files:** Create `lib/domain/add-records.ts`; Test `lib/domain/add-records.test.ts`

**Interfaces:**
- Produces: `fileKind(name: string): "csv" | "xlsx" | null`; `dragHasFiles(types: readonly string[]): boolean`; `firstFile(files: ArrayLike<File> | null | undefined): File | null`; `countLabels(labels: { label: RowLabel }[]): { invoice: number; expense: number; payment: number; choose: number }`; `summaryLine(counts: ReturnType<typeof countLabels>): string`; `heldLine(counts: ReturnType<typeof countLabels>): string`; `plainImportError(message: string): string`. `RowLabel` comes from `lib/domain/reader.ts`.

- [ ] **Step 1: Write failing tests** in `add-records.test.ts` with these names and assertions:
  - `fileKind accepts .csv and .xlsx in any case and rejects others`: `"A.CSV"` gives `"csv"`, `"b.xlsx"` gives `"xlsx"`, `"c.xls"`, `"d.pdf"`, `"e"` give `null`.
  - `dragHasFiles is true only when the drag carries files`: `["Files"]` true; `["text/plain"]` and `[]` false.
  - `firstFile returns the first file and null for none`.
  - `summaryLine uses plain counts`: 12 invoices + 3 expenses gives `"We found 12 invoices and 3 expenses."`; 1 invoice only gives `"We found 1 invoice."`; all zero gives `"We couldn't find any invoices or expenses in this file."`.
  - `heldLine explains payments and rows that need a choice`: 2 payments gives a sentence containing `"2 payments"` and `"aren't imported"`; `choose` rows give a sentence containing `"need your choice"`; both zero gives `""`.
  - `plainImportError maps limits to plain words`: input containing `"1–100 data rows"` gives `"That file has too many rows. Send up to 100 at a time."`; containing `"columns"` gives `"That file has too many columns. Keep up to 24."`; `"Choose a .csv or .xlsx file up to 512 KiB."` gives `"That file is too big, or isn't Excel or CSV. Export fewer rows and try again."`; unknown text gives `"We couldn't read that file. Check it opens in Excel, then try again."`; no output contains "KiB" or "UTF".
- [ ] **Step 2: Run** `npx vitest run lib/domain/add-records.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** the functions above in `lib/domain/add-records.ts`. Pluralise "invoice(s)", "expense(s)", "payment(s)".
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat: add helpers for the Add records page` (stage the two files).

### Task 2: In-memory file holder

**Files:** Create `lib/ui/pending-file.ts`; Test `lib/ui/pending-file.test.ts`

**Interfaces:**
- Produces: `setPendingFile(file: File | null): void`; `takePendingFile(): File | null` (returns the file once, then null).

- [ ] **Step 1: Write failing tests:** `takePendingFile returns the stored file once then null`; `setPendingFile replaces an earlier file`; `nothing is stored in storage or the URL` (assert `typeof localStorage === "undefined"` is untouched by checking the module exports only the two functions).
- [ ] **Step 2: Run** `npx vitest run lib/ui/pending-file.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** with a module-level variable.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat: hold a dropped file in memory`.

### Task 3: Default file source (server)

**Files:** Create `lib/server/file-source.ts`; Test `lib/server/file-source.test.ts`; Modify `app/(workspace)/imports/actions.ts`

**Interfaces:**
- Consumes: `requireActor()` from `lib/server/auth`, `createClient()` from `lib/supabase/server`, `CommandError` from `lib/domain/commands`.
- Produces: `ensureFileSource(): Promise<string>` (returns a source id); action `ensureFileSourceAction(): Promise<ActionResult<string>>` using the file's existing `perform` wrapper.

- [ ] **Step 1: Write failing tests** (mock `server-only`, the actor and the Supabase client as `lib/server/connector-actions.test.ts` does):
  - `reuses the first manual_csv or manual_xlsx source`: with an existing source it returns its id and never calls `create_intake_source`.
  - `an owner creates "Uploaded files" when none exists`: RPC called once with `{ p_kind: "manual_csv", p_label: "Uploaded files" }`, and the id of the earliest source is returned after a re-query.
  - `a finance teammate gets a friendly refusal when none exists`: rejects with a `CommandError` whose first field error is `"Ask the owner to add the first file."`, and the RPC is never called.
  - `ignores sources of other kinds`: `google_sheet` and `drive_file` sources do not count.
- [ ] **Step 2: Run** `npx vitest run lib/server/file-source.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `ensureFileSource` (select `id,kind` from `intake_sources` for the actor's business, kinds `manual_csv` and `manual_xlsx`, order by `created_at`; create only for owners; re-query to converge on the earliest), then `ensureFileSourceAction` in `actions.ts`.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat: use a hidden default file source for imports`.

### Task 4: Toast host

**Files:** Create `lib/ui/toasts.ts`, `components/toast-host.tsx`; Test `lib/ui/toasts.test.ts`

**Interfaces:**
- Produces: `type Toast = { id: number; message: string; action?: { label: string; href: string } }`; `pushToast(list: Toast[], toast: Omit<Toast, "id">, id: number): Toast[]` (keeps the newest 3); `dismissToast(list: Toast[], id: number): Toast[]`; component `ToastHost({ children })` providing `useToast(): { show(message: string, action?: Toast["action"]): void }`.

- [ ] **Step 1: Write failing tests:** `pushToast appends and keeps the newest three`; `dismissToast removes one by id`; `the host renders one polite status region`: static markup of `ToastHost` contains `role="status"` and `aria-live="polite"`.
- [ ] **Step 2: Run** `npx vitest run lib/ui/toasts.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the pure functions, then `ToastHost` (client): state list, auto-dismiss each toast after 5000 ms, a dismiss button with `aria-label="Dismiss"`, action rendered as a `Link`, never taking focus. Add toast styles (slide-in using transform/opacity, off under reduced motion) to `app/workspace.css`.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat: add a toast host`.

### Task 5: Presentational parts

**Files:** Create `components/add-records-parts.tsx`; Test `lib/ui/add-records-parts.test.ts`; Modify `app/workspace.css`

**Interfaces:**
- Consumes: Task 1 helpers.
- Produces: `StepIndicator({ step }: { step: "file" | "check" | "done" })`; `DropArea({ onFile, dragging, disabled }: { onFile: (file: File) => void; dragging?: boolean; disabled?: boolean })`; `CheckSummary({ counts, held, preview }: { counts: ReturnType<typeof countLabels>; held: string; preview: (string | number | boolean | null)[][] })`; `DoneState({ count, reviewHref }: { count: number; reviewHref: string })`; `ChoiceCards({ googleHref: string, manualHref: string })`.

- [ ] **Step 1: Write failing tests** (static markup, mock nothing):
  - `StepIndicator marks the current step`: `step="check"` output contains `aria-current="step"` exactly once, on "Check", with all three labels File, Check, Done.
  - `DropArea is a labelled button with a Choose file control`: contains "Drop your Excel or CSV file here" and "Choose file", an `accept` including `.csv` and `.xlsx`, and a button usable by keyboard; text includes none of the banned words.
  - `CheckSummary shows the sentence and at most five preview rows`: 8 input rows render 5 `<tr>` body rows.
  - `DoneState says nothing is saved yet exactly once`: contains "15 rows are ready to review" and "Nothing is saved yet" once, and a link to the review href with text "Review now".
  - `ChoiceCards offers Connect Google Sheet and Type it in`.
- [ ] **Step 2: Run** `npx vitest run lib/ui/add-records-parts.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the five components with existing workspace classes where they exist and new `.add-*` classes in `app/workspace.css` (drop-area pulse while `dragging`, step slide-in, Done check pop, all transform/opacity only; a `@media (prefers-reduced-motion: reduce)` block turning them off).
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat: add the Add records building blocks`.

### Task 6: Stateful flow

**Files:** Create `components/add-records.tsx`; Test `lib/ui/add-records.test.ts`

**Interfaces:**
- Consumes: `ensureFileSourceAction`, `inspectCsvAction`, `previewCsvAction`, `stageCsvAction` (from `app/(workspace)/imports/actions`), `ImportSelector`/`readSelectorForm`/`selectorProblems` (from `components/import-selector`), `takePendingFile`, `useToast`, Task 1 and Task 5 exports.
- Produces: `AddRecords({ customers, owner, googleSlot }: { customers: { id: string; name: string }[]; owner: boolean; googleSlot: ReactNode })`.

- [ ] **Step 1: Write failing tests** (mock the actions and `next/navigation`; static markup of the initial state):
  - `starts on the File step with the three choices` (no banned words).
  - `a refused source shows the friendly message`: unit-test the exported pure `describeFailure(message: string): string` used by the component so it returns `plainImportError(message)` for unknown text and passes "Ask the owner to add the first file." through unchanged.
  - `Send is disabled while busy and for zero rows`: unit-test an exported `canSend(state: { busy: boolean; rows: number }): boolean`.
- [ ] **Step 2: Run** `npx vitest run lib/ui/add-records.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the flow: on file choose or on mount `takePendingFile()`, call `ensureFileSourceAction` then `inspectCsvAction` (FormData keys `file`, `sourceId`, optional `sheet`) and move to Check; show "Which sheet?" only when `sheets.length > 1`; show `ImportSelector` only for unmatched columns (reuse `selectorProblems`); **Send** calls `previewCsvAction` then `stageCsvAction`, then Done, a toast `"15 rows ready to review"` with a **Review** action to `/imports`, and `router.refresh()`. Any failed action shows `plainImportError(message)` with a retry button. The Send button is disabled while busy.
- [ ] **Step 4: Run.** Expected: PASS. Also run `npm run typecheck`.
- [ ] **Step 5: Commit** `feat: run the three-step import flow`.

### Task 7: The /add page and a lighter Review Inbox

**Files:** Create `app/(workspace)/add/page.tsx`; Modify `app/(workspace)/imports/page.tsx`, `lib/server/google-auth.ts`, `lib/server/google-auth.test.ts`, `components/customer-invoices.tsx`, `components/workspace-navigation.tsx`, `lib/ui/workspace-navigation.test.ts`, `components/workspace-tools.tsx`

**Interfaces:**
- Consumes: `AddRecords` (Task 6), `GoogleConnect`, `SheetConnection`, `getWorkspace`.
- Produces: route `/add`; Google sign-in result redirects to `/add?google=connected|failed`.

- [ ] **Step 1: Update the tests first:** in `google-auth.test.ts` change every expected redirect from `/imports?google=` to `/add?google=`; in `workspace-navigation.test.ts` add `/add highlights the same item as /imports`. Run `npx vitest run lib/server/google-auth.test.ts lib/ui/workspace-navigation.test.ts`. Expected: FAIL on the changed expectations.
- [ ] **Step 2: Implement** the redirect change in `google-auth.ts` and the `"/add"` entry in the active-item rule in `workspace-navigation.tsx`.
- [ ] **Step 3: Build the page:** `add/page.tsx` follows the structure of the imports page (Suspense and `WorkspaceLoading`, shell, heading "Add your records"), loads customers, Google connection state and Drive files exactly as the imports page does, runs the same `after(() => syncBusinessIfDue(...))` catch-up when connected, renders `AddRecords` with `GoogleConnect` as its Google slot, and puts `SheetConnection` inside a collapsed "Advanced" `details` at the bottom.
- [ ] **Step 4: Trim the imports page:** remove `CsvImport`, `GoogleConnect` and the n8n details; add an "Add records" link button (to `/add`) in the heading actions; keep inbox, filters, Confirm selected and the Google catch-up `after()` only if still needed for inbox freshness. In `customer-invoices.tsx` point "Import & review" to `/add`. In `workspace-tools.tsx` add an "Import a file" link to `/add` in the Quick add menu.
- [ ] **Step 5: Run** `npx vitest run lib/server/google-auth.test.ts lib/ui/workspace-navigation.test.ts` (Expected: PASS), then `npm run typecheck` and `npx eslint` on every changed file.
- [ ] **Step 6: Commit** `feat: add the Add records page and slim the Review Inbox`.

### Task 8: Drop anywhere

**Files:** Create `components/file-drop-overlay.tsx`; Test `lib/ui/file-drop-overlay.test.ts`; Modify `components/workspace-frame.tsx`

**Interfaces:**
- Consumes: `dragHasFiles`, `firstFile`, `fileKind` (Task 1), `setPendingFile` (Task 2), `useToast` (Task 4).
- Produces: `FileDropOverlay()` (client) mounted once in `WorkspaceFrame`, inside `ToastHost`.

- [ ] **Step 1: Write failing tests:** `the overlay is hidden until a file drag starts` (static markup has no "Drop to import"); a pure exported `nextDragDepth(depth: number, event: "enter" | "leave" | "drop"): number` returns depth+1, depth-1 (never below 0) and 0, so leaving the window hides the overlay.
- [ ] **Step 2: Run** `npx vitest run lib/ui/file-drop-overlay.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** window `dragenter`, `dragover`, `dragleave` and `drop` listeners that react only when `dragHasFiles(event.dataTransfer.types)`. On drop take `firstFile`; if `fileKind` is null show the toast "Only Excel (.xlsx) and CSV files."; otherwise `setPendingFile(file)` and `router.push("/add")` (or set the file directly when already on `/add`). Always reset the depth counter and `preventDefault` only for file drags. The overlay is `aria-hidden` and non-focusable. Mount `ToastHost` and `FileDropOverlay` in `workspace-frame.tsx`.
- [ ] **Step 4: Run** the test (Expected: PASS) and `npm run typecheck`.
- [ ] **Step 5: Commit** `feat: drop a file anywhere to import it`.

### Task 9: Verify in the browser, document, finish

**Files:** Modify `docs/product-guide.md`, `docs/testing.md`, `tasks/todo.md`

- [ ] **Step 1: Run the full checks:** `npm run test:unit`, `npm run test:integration -- tests/integration/intake.test.ts`, `npm run typecheck`, `npm run build` (Expected: all pass, `/add` listed in the build output), and `npx eslint` on every changed file.
- [ ] **Step 2: Browser, with fictional data only** (dev server on port 3000): open `/add`; choose `public/samples/pondopath-invoices.csv`; confirm the Check sentence, Send, Done and the toast, and time clicks and seconds against the success criteria. Dispatch a synthetic file drag over `/overview` and confirm the overlay appears, hides on leave, and a drop opens `/add` with the file loaded; drop a `.pdf` and confirm the toast. Check the `/imports` page no longer shows import panels, then 375px, and reduced motion (emulated).
- [ ] **Step 3: Record results:** a short Add records entry in `docs/testing.md` (counts, timings, what was not tested such as a real Google sign-in), a line in `docs/product-guide.md`, and a row in `tasks/todo.md`.
- [ ] **Step 4: Commit** `docs: record the Add records page`.

## Self-review notes

- Spec coverage: page and choices (Tasks 5 and 7), three-step flow (Tasks 5 and 6), drop anywhere and toast (Tasks 4 and 8), hidden default source (Task 3), plain words (Tasks 1 and 5), Google redirect and moved panels (Task 7), tests and browser checks (all tasks and Task 9). The deferred finance-first-upload decision is covered by the friendly refusal in Task 3.
- Signatures: `countLabels` and `summaryLine` take the same counts type in Tasks 1, 5 and 6; `ensureFileSourceAction` returns an `ActionResult<string>` consumed in Task 6; `useToast().show(message, action?)` is the single toast entry used in Tasks 6 and 8.
