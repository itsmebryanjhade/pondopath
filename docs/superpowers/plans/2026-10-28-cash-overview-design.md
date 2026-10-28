# Combined cash overview implementation plan

> Execute inline with superpowers:executing-plans in the existing isolated worktree. Extend the provisional, uncommitted green-theme changes to the approved combined design.

**Goal:** Implement the approved combined mockup as the real authenticated Cash overview, preserving the cash-planning workflow.

**Spec:** docs/superpowers/specs/2026-10-28-main-workspace-design.md and its combined mockup. PRD FR-04/FR-08 and data/accessibility rules remain binding.

**Architecture:** Reuse WorkspaceShell, CashForecast, ScenarioPanel, OpeningCashForm and existing data loading/calculation. Add one optional shell header slot; other screens retain their date/refresh strip. Format plan dates in one shared helper. Use licensed Feather SVG assets without a new dependency.

## Tasks

- [x] Add and run a focused chart render regression test before implementation: projected end balance, chronological 30-day path/recovery, source links and negative daily amounts.
- [x] Implement lib/display.ts, components/app-icon.tsx, public/icons/*, the sidebar/header slot and the real-data overview composition. Keep forms/actions and authorization unchanged.
- [x] Refine CashForecast, scenario summary and workspace styles: 16px panels, 12px metrics, 8px controls, green cash card, gentle shadows, single amber warning, readable source tables, stacked disclosures and mobile risk-first order.
- [x] Run focused render/forecast tests, lint/typecheck and one production build. User selected self-review of the authenticated page later; do not request credentials or bypass sign-in. Record authenticated visual QA as pending if inaccessible.
- [x] Review the focused diff once, fix important issues and record results. Commit this implementation with this plan. Respect the known Windows application-control block if the supported graph refresh remains unavailable.

## Review focus

Preserve actual/expected cash distinctions, all source links, permissions and history. Do not claim a specific unpaid invoice caused the shortage without evidence. Negative/large values, empty records, no-shortage cases, stale/partial expectations and narrow screens must remain readable. A later positive balance cannot hide an earlier gap. The optional header slot must preserve other shell callers.

## Verification ledger

- Chart regression observed red before implementation (one expected missing-label failure; two tests already passed). Final focused run: 22 tests passed across chart rendering, display states and the existing forecast engine.
- `npm run lint`, `npm run typecheck`, and one `npm run build` passed on Node 24. Build produced the existing routes without new application routes.
- One fresh read-only review identified two issues, both corrected: incomplete-data notice remains visible outside the disclosure (AC-06), and long sticky invoice/expense row headings wrap inside their tables.
- Added receipt-label checks for missing, stale, zero, needs-review, same-day and partial expectations; added year-boundary date checks. Financial rules, database permissions and forms were not changed.
- Feather icons are exact MIT-licensed upstream assets from `feathericons/feather`; retained `public/icons/LICENSE.txt`. No dependency added.
- Authenticated desktop/tablet/mobile, keyboard and scenario interaction checks remain pending: user chose to review the signed-in screen later. No credentials were requested again or sign-in bypass added. See [visual QA status](../reviews/cash-overview/design-qa.md).
- Graph refresh remains unavailable because the supported executable was blocked by Windows Application Control earlier in this session. Did not retry or bypass that policy; checked the changed source/callers directly. The local map may be stale.
- No meaningful Next.js feedback candidate arose from this implementation; no feedback submission was needed. No database integration suite, deployment or unrelated feature work was performed.
