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
- [ ] User review before slice 3.

Slice 2 result: the provided source structure now drives the overview panel, animated chart, lift/shadow cards, initials, status pills and active filter states. Fake sample balances, bank connections, growth percentages and 60/90-day options were not imported. Card source controls and table actions lead to existing record workflows. The source colour/animation rules are reused; only real-data semantics, readable labels, keyboard access and the previously approved responsive layout are adapted.

Verification: the new overview-chart regression failed before implementation; final 22 focused tests, lint and production build passed. Browser fixture checks confirmed the actual shortage tooltip, its source 1.2× focus/hover scale, source card -2px lift/shadow, 3 expense rows, 1 attention row and all 30 daily-source rows. Checked 1920px, 1366px and 390px widths without document overflow. Phone markers align with the plot; the 24px canvas gutter and 16px sidebar gap remain. No browser warnings/errors. One fresh review caught a shared standalone-chart fill removed during CSS cleanup; restored it and retained shared text-link styling. No dependency or financial/authentication change. Signed-in end-to-end and backend writes remain untested; previews use fictional records. No qualifying Next.js feedback candidate; Graphify refresh remains blocked by the recorded Windows policy.

## Slice 3 — Workspace pages and forms (awaits slice 2 approval)

Port each source tab's layout, analytics surfaces, tables, controls and transitions onto the matching existing page. Arrange current working forms into the source's presentation without replacing validation, approvals or actions. Review each page in manageable sub-slices if needed.

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
