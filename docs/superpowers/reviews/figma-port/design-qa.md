# Supplied Figma dashboard port: QA

## Scope and evidence

- Source: `itsmebryanjhade/SoloForgeCashFlowDashboard`, commit `1e97dcedea3e595c3ed3be67813242cb06278da0`; dashboard JSX, original icons and scoped CSS reused.
- Source rendering: isolated reference at `http://127.0.0.1:3100/`.
- Implementation rendering: actual read-only presentation components at `http://127.0.0.1:3100/implementation.html`, using `tests/fixtures/ui-workspace.ts`. Production forms/actions are not mounted in this temporary visual fixture. It has no database connection or real account session.
- Desktop source/implementation captures: both 1265×713 pixels, same browser surface. Device density was not separately measured. Source and implementation captures were emitted together for comparison after fixes.
- Captures saved at `C:/Users/Bryan/.codex/visualizations/2026/10/24/01a16c46-60f5-7460-8651-d2f550eb44ff/pondopath-design-reference.png` and `pondopath-redesign-preview.png` in that same directory.
- Additional rendered phone/tablet frames: 390×844 and 768×1024 in the same browser. Focused screenshots inspected toolbar/menu overlap and the horizontally scrolled financial status/action columns.

## Required surfaces

| Surface | Observation |
| --- | --- |
| Fonts and typography | DM Sans/Manrope retained; original tiny labels raised to at least 12px. PondoPath identity and actual figures require different copy/wrapping from the source. |
| Spacing/layout | Floating sidebar, compact top bar, split forecast hero, four white metrics and activity table retained. Native daily-plan disclosure, longer factual labels and minimum target sizes produce intentional extra height. Sidebar internal scrollbar and phone toolbar overlap corrected. |
| Colors/tokens | Source green/sage/white ground retained. Computed overdue badge: `rgb(252,237,223)` background and `rgb(147,71,21)` text. Negative balances, due-now obligations and incomplete expectations keep explicit text. |
| Assets | Existing PP PNG retained; source icon component copied. No replacement logo or fake company photos generated. |
| Copy/content | Actual programmed dates, 30-day cash balances and record links replace source samples. No connected-bank claim, fake 60/90-day forecast, static success flow or copied demo AI backend. |

## Comparison and correction history

1. Initial desktop comparison identified a sidebar internal scrollbar and uppercased customer row headings. Sidebar sizing and row-header compatibility styles corrected; revised desktop captured against the source.
2. Source CSS hid statuses and search on phones. Scoped compatibility selectors now preserve them. Phone AX and horizontal keyboard scrolling confirmed the overdue status remains accessible. Subsequent color check confirmed the warning palette.
3. Phone search initially overlapped the brand/menu row because the source fixed toolbar height won specificity. Height and wrap overrides corrected; recaptured phone showed separate toolbar and brand rows.
4. Code review found the mobile account trigger lost its text label and expense links could miss records after the first 50. Added a permanent accessible name and a shared, tested pagination-aware source-link helper.

## Interaction evidence and limits

Fixture checks passed: Expenses filter returned three actual fixture expenses, Needs attention returned the overdue invoice, search found `DEMO-001`, Escape dismissed it, mobile navigation opened/closed, and the phone table could be scrolled horizontally with keyboard input. Browser error/warning log returned no entries at inspection time.

This does not validate account/session handling, actual database writes, scenario/posting approvals, all seven authenticated screens or role-specific interaction end to end. The user explicitly deferred signed-in review. Those checks remain pending; the isolated preview is not offered as a functioning replacement app.

The final focused run passed 38 tests; lint and production build with TypeScript passed. These are code checks, not a substitute for the pending signed-in comparison.

final result: blocked

Blocker: authenticated integration captures and end-to-end interaction checks are unavailable under the user's deferred-review choice. No known required visual fix remains in the inspected fictional overview fixture.
