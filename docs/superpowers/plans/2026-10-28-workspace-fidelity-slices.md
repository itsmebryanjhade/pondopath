# Workspace fidelity migration

> Execute natively, one user-reviewed slice at a time. Stop after each slice; the user approves before the next begins.

**Goal:** Migrate the complete workspace presentation from the supplied SoloForgeCashFlowDashboard repository, using PondoPath's real records and workflows.

**Source:** Local clone at reference commit `1e97dcedea3e595c3ed3be67813242cb06278da0`, specifically `src/app/(frontend)/Dashboard.tsx` and `styles.css`.

**Scope:** Workspace only. Landing, login, signup, calculations, database policies and integrations stay outside this migration. The source code is the visual authority, including its shell geometry, type, colours, rounded surfaces, transitions, hover feedback and responsive navigation. Retain readable text, keyboard access, reduced motion, factual financial labels and PondoPath branding. Do not install the source's unrelated CMS/demo backend.

## Slice 1 — Complete shell

**Files:** `components/workspace-frame.tsx`, `workspace-tools.tsx`, `workspace-navigation.tsx`, `app/workspace.css`, `app/(workspace)/template.tsx`; existing navigation tests.

- [x] Reuse the source's app-shell/topbar/nav-wrap/nav-actions/side-nav/side-link/profile/popover structure and original CSS. Remove the old mobile header/menu and conflicting shell overrides.
- [x] Retain native links, real quick-add destinations, real review records, account actions and persistent route loading. Use actual open follow-up counts, never the source's hard-coded badge.
- [x] Restore the source's horizontal mobile navigation and in-bar brand; keep search accessible through a compact mobile control.
- [x] Activate the source's icon slides, insight hover, button/profile feedback, dropdown entry and page entry, respecting reduced motion. No animation library.
- [x] Verify focused shell contracts, lint/typecheck, and desktop/phone presentation with fictional records if no authenticated browser is accessible. Hand off for user review.

## Slice 2 — Overview analytics

Port the original overview heading, dark summary/chart composition, metric cards, activity table and associated reveal/hover/chart interactions. Populate from existing forecast/record calculations. Retain original due dates, partial-payment states and accessible daily sources. Do not invent historical series or trends.

- [x] Reuse the original hero/forecast, summary-card, entity/status table and filter markup and existing source CSS. Replace old overview compatibility overrides; retain the approved shell and wide-screen spacing.
- [x] Connect the chart's gradient, line reveal, risk guide and hover/focus points to all 30 actual calculated daily balances. Retain the daily source table and the standalone Forecast presentation.
- [x] Verify actual amounts, early shortages, partial/unplanned receipts, source links and filtering; check desktop/mobile rendering and obtain one focused review.
- [x] User approved the overview before slice 3.

Slice 2 result: the provided source structure now drives the overview panel, animated chart, lift/shadow cards, initials, status pills and active filter states. Fake sample balances, bank connections, growth percentages and 60/90-day options were not imported. Card source controls and table actions lead to existing record workflows. The source colour/animation rules are reused; only real-data semantics, readable labels, keyboard access and the previously approved responsive layout are adapted.

Verification: the new overview-chart regression failed before implementation; final 22 focused tests, lint and production build passed. Browser fixture checks confirmed the actual shortage tooltip, its source 1.2× focus/hover scale, source card -2px lift/shadow, 3 expense rows, 1 attention row and all 30 daily-source rows. Checked 1920px, 1366px and 390px widths without document overflow. Phone markers align with the plot; the 24px canvas gutter and 16px sidebar gap remain. No browser warnings/errors. One fresh review caught a shared standalone-chart fill removed during CSS cleanup; restored it and retained shared text-link styling. No dependency or financial/authentication change. Signed-in end-to-end and backend writes remain untested; previews use fictional records. No qualifying Next.js feedback candidate; Graphify refresh remains blocked by the recorded Windows policy.

Final wide-chart correction: the source's fixed 1200px SVG dash pattern left part of the stretched line hidden after its reveal. The overview now reveals a continuous stroke with a width-independent clip, retaining the source's 700ms duration, easing and 80ms delay. Verified the full final line in a 1920px fictional-data preview and parsed the changed CSS. Financial calculations and geometry were not changed; the already-passing application suite was not rerun for this CSS-only correction.

## Slice 3 — Workspace pages and forms

Port each source tab's layout, analytics surfaces, tables, controls and transitions onto the matching existing page. Arrange current working forms into the source's presentation without replacing validation, approvals or actions. Review each page in manageable sub-slices if needed.

### Slice 3.1 — Cash (approved by user)

- [x] Reuse the source SectionView heading, three metric cards, dark feature panel, record rows, lower grid, insight card and existing animations/hover styles.
- [x] Show saved available cash, opening baseline, verified receipt/payment totals and the five latest retained movements. Use complete snapshot totals rather than the limited history query for money totals. Preserve void labels, links to actual records and the original owner-only/locked opening-cash controls.
- [x] Check desktop/mobile layout and focused presentation contracts; stop before Invoices for user review.

The source's fictional bank balances, transfer button and hard-coded historical series were replaced with the existing recorded-cash workflows. The recent list uses the existing authenticated, revision-checked receipt and expense-payment readers in parallel. Calculations, posting actions, database policies, landing and onboarding were unchanged; no dependency was added.

Verification: three focused checks passed for complete saved totals, newest-five ordering/retained voids, empty/negative balances and baseline access. Lint and production build (including TypeScript) passed. The real presentation and original opening form were checked with fictional records at 1920px, 1366px and 390px; no document overflow or browser warnings/errors. Keyboard navigation from the opening amount reaches the cutoff date. A separate read-only review reported no findings. Signed-in end-to-end behavior and database writes were not checked. Graphify refresh remains blocked by the previously recorded Windows policy; focused source inspection was used. No qualifying Next.js feedback candidate.

### Slice 3.2 — Invoices (approved to proceed)

Reused the source's blue SectionView palette, table-first hierarchy, metric cards, dark feature panel, bar reveal and hover styles. Retained existing collection filters, stable 50-row pagination, original due dates, partial/unplanned balances, stale expectation exclusions, follow-up/source links and both original forms. The collection chart groups the existing 30-day forecast inflows into five periods (the final period has two days); no sample financial series or new backend was imported. The table has a bounded, keyboard-scrollable region with sticky headers, and its insight card keeps its natural height.

Verification: five focused tests cover partial expectations, forecast exclusions/window boundaries, seven-day original-due-date totals, filtering/pagination and first-customer setup. Final build and changed-file lint passed; full lint also passed before the last presentation edits. Fictional-data browser checks confirmed desktop/390px fit, native Overdue filtering (two matching rows with the complete outstanding total retained), source links/form fields, zero-value chart targets and keyboard table scrolling. A fresh review found low-contrast planning text; scoped colours were corrected and verified in the browser. Screenshot saved in the task's visualizations folder. Signed-in end-to-end behavior/database writes were not checked; no qualifying Next.js feedback issue. Existing Graphify policy blocker remains; no retry.

Execution adjustment: the user reported this slice was too slow. Keep the next slice to direct source reuse and one final focused verification pass; avoid repeated full builds for presentation-only edits.

### Slice 3.3 — Payments (approved to proceed after analytics correction)

Merged the source's teal SectionView, asymmetric feature surface, rounded metric cards, record-row links and original hover/motion rules directly into the existing Payments page. Kept the original CashMovements/owner correction controls unchanged. Payment totals use the complete snapshot, not the limited recent-entry queries; history remains labelled latest 50 and retains void reasons. Source sample bank matches and historical payment velocity were replaced with real recording destinations. No new component layer, dependency, backend or financial rule.

One focused verification pass: three tests (complete totals/destinations, finance versus owner controls/retained voids, empty histories), changed-file lint and TypeScript passed. Desktop/390px fictional-data browser checks showed no document overflow; existing correction disclosure and reason field remained available, and both history regions are keyboard focusable. No browser warnings/errors. No full production build or authenticated write rerun for this presentation-only slice. Graphify's existing policy blocker remains; no new Next.js feedback candidate.

### Payments analytics correction

The user expected an analytics panel from the supplied design. Replaced the action-only feature content with the source's animated bars comparing complete verified receipt and expense-payment totals since the opening cutoff. Kept exact PHP values, accessible hover/focus labels, zero-height bars with full keyboard targets, and the real recording links. This is a category comparison, not an invented historical series. Three focused tests now cover chart totals and zero values; changed-file lint and TypeScript passed. Desktop/390px previews confirmed the 4:1 sample bar proportion, keyboard access and no document overflow or browser warnings. No posting/domain/database change or full-build/authenticated-write rerun.

### Slice 3.4 — Expenses (approved by user)

Merged the source's purple SectionView hierarchy, metric cards, records/insight layout and animated bars directly into the existing Expenses page. Analytics group the existing 30-day forecast's planned outflows into five periods, including overdue unpaid expenses due now and remaining partial balances. No fabricated categories, approval states or historical spending series. Kept original amounts/dates, IDs, 50-row pagination, existing payment/edit/new-expense forms, and retained payment history. No domain/database/action/dependency change.

One focused pass: three tests cover partial/overdue/out-of-window amounts, whole-snapshot analytics across pagination and empty/zero states; changed-file lint and TypeScript passed. Desktop/390px fictional-data previews confirmed the chart, single-column phone layout, no document overflow or browser warnings, keyboard-focusable worklist and original payment fields (amount/date/reference/verification/duplicate review). No production build or signed-in write rerun. No qualifying Next.js feedback; existing Graphify policy blocker was not retried. Forecast awaits this page's user review.

### Slice 3.5 — Forecast (implemented; awaiting user review)

Merged the source's blue SectionView around the existing 30-day line chart and scenario tool. The actual calculated line, all 30 daily source rows, early/largest shortages, incomplete/stale expectations and overdue due-now counts remain visible. Added receipt/outflow/lowest-balance cards from the same forecast result. Reused the original scenario form; empty workspaces receive a clear scenario notice. Chart headings, descriptions and gradient references are now namespaced so the Overview and Forecast charts can coexist in cached route DOM. No forecast/domain/database/action/dependency change.

The namespace regression failed before implementation. Final eight focused chart/page checks, changed-file lint and TypeScript passed. Verified the signed-in Next.js app at localhost:3000/forecast using its existing demo account, not the separate fixture: correct section order and gradient reference, 30 daily rows, and a real unsaved scenario moving DEMO-001's 50,000 receipt to 2 November. The preview showed a 40,000 shortfall on 30 October; discard removed it and retained the 10,000 baseline end balance. Checked desktop and the available 480px narrow viewport without document overflow. No business records were changed. The browser screenshot API failed and native capture included unused canvas; no separate fixture screenshot is evidence for this slice. No production-build/write rerun. No new Next.js feedback candidate; Graphify's existing policy blocker was not retried. Follow-ups awaits user review.

Verification correction: future screenshots used as proof must come from the actual running Next.js app. Separate fictional-data previews must be labelled as such. The earlier Expenses discrepancy was not reproduced in the fresh signed-in localhost session; the user subsequently confirmed it looked good. No source change was made for that discrepancy, and Brave interaction remains unapproved.

## Review focus

Long business/member names; active nested routes; mobile access to all seven destinations and search; keyboard dismissal/focus; actual zero counts and records; persistent shell while page data loads. No new libraries or claimed end-to-end verification from a fixture-only preview.

## Execution notes

User requested direct code reuse and approval after each implemented slice; no new design exploration is required. Existing copied CSS is reused; differences in the old shell markup prevented many source selectors from applying. Graphify's local map is stale and its refresh remains blocked by the previously recorded Windows policy; use focused source/caller inspection.

Slice 1 verification: 12 focused navigation/shell tests passed; lint and the final production build (including TypeScript) passed. Added contracts for the source shell classes, actual follow-up badges, all seven mobile routes, business context and role-based controls. A fresh read-only review found a mobile search/menu overlay collision; fixed via native details toggle handlers. Verified the corrected search → Quick add sequence and Escape dismissal in a 390px fictional-data browser preview; also inspected desktop and 768px tablet geometry. Desktop and phone captures saved in the task's visualizations folder. Source reduced-motion CSS remains in force; system-level reduced-motion and maximum text scaling were not interactively tested.

The real authenticated app, database writes and seven-page live navigation were not retested; the user previously chose to review their signed-in app. Browser tooling produced an iframe inspection error, so direct phone-preview interaction was used instead. No bypass, secret handling, new dependency or deployment. No qualifying Next.js feedback issue was found. Slice 2 and slice 3 remain unstarted, pending the user's review.

### Slice 1 correction — Navigation motion and scrollbar

User rejected the custom loading circle and requested the reference transitions/hover effects plus removal of the visible side scrollbar. Removed the nav spinner, busy cursor and icon-hiding rules. Pending announcements remain screen-reader accessible. Removed the eager per-page loading wrappers and route loading/template conventions; the initial workspace fallback now lives in `components/workspace-loading.tsx`. Loaded `WorkspaceShell` content owns the source's unchanged 340ms fade/8px slide, so the animation no longer runs on a placeholder. Next's route transition can retain the previous content until the new page is ready; no financial reads, authentication or commands were changed.

Document/sidebar scrollbars are hidden with scrolling retained. A fresh review caught that `:has(.workspace-root)` would also match a hidden cached route. The active workspace effect now adds/removes a document class, including React Activity cleanup, so public pages recover their normal scrollbar. A fictional browser Activity check confirmed: visible workspace → `scrollbar-width: none`; hidden workspace with retained DOM → `auto`. Verified actual scrolling from 0 to 720px with a zero-width gutter, zero custom spinner nodes, the source 340ms entry curve and 180ms nav-icon transitions.

Two regression assertions failed before the fix; all 14 focused checks passed afterward. Final lint and production build passed. Signed-in navigation timing and backend end-to-end behavior remain unverified; the browser checks used fictional presentation fixtures. Graphify refresh is still blocked by the recorded Windows policy. No new Next.js feedback candidate.

### Large-monitor responsiveness correction

User approved a wider desktop canvas and bounded chart height, then refined the request to use the screen edges with breathing room and lift the dashboard. At widths of 1600px and above the workspace now has 24px side gutters, a 380px summary column, a 240–260px chart and an approximately 18px lift to the content. Sidebar width, controls and text sizes stay unchanged. Below 1600px the existing container rules remain. The SVG plot scales independently from its text, retaining calculated points, round shortage markers, readable axis labels and the full daily-source table.

Verified with fictional presentation records at 1920×1080 (1872px canvas, 24px gutters, 206px sidebar, 259px chart), 1366×768 (1310px canvas, 206px sidebar) and 390×844 (358px canvas, sidebar collapsed). No document overflow at any checked size; phone screenshot and browser log checked, with no warnings/errors. Three focused chart tests and the production build passed. Final CSS was checked in the browser after the user's edge-spacing refinement. No data/auth changes or new dependency; signed-in integration remains untested. No qualifying Next.js feedback candidate.
