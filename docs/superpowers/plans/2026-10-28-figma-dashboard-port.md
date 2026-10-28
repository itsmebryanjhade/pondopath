# Figma dashboard port

The user selected `itsmebryanjhade/SoloForgeCashFlowDashboard` as the new main-app design and requested implementation. Reference commit: `1e97dcedea3e595c3ed3be67813242cb06278da0`. Inspected its rendered overview and source; the isolated reference preview uses existing installed React/Vite, with no Payload CMS, analytics or new dependency installed.

## Design contract

Use the supplied floating white sidebar, compact top action bar, warm green ground, dark forecast summary beside the chart, four white metric cards, and filterable combined activity table. Preserve PondoPath's PP identity, actual business/user context, existing authentication and persistent-layout navigation. Use DM Sans and Manrope; keep small financial labels at least 12px and controls at least 44px.

Port the presentation onto actual records and existing forms/actions. Programmed rules still calculate a 30-day forecast; retain earliest/largest shortage, explicit incomplete-data notices, overdue due-now expenses, daily sources, partial receipts and original due dates. No fake bank connection, static customer data, invented chart curves, unimplemented 60/90-day options, preview-only success toasts, or replacement AI backend. User explicitly chose separate pages for Cash, Payments, Forecast and Follow-ups, then clarified to copy the supplied code/styles and arrange them. The source CSS is copied/scoped into `app/figma-dashboard.css`; the original icon component and layout patterns are reused with compatibility styles for real data and forms. Payload, demo modals, analytics and the reference AI backend are excluded from the port.

## Implementation

- [x] Add focused tests for real-record activity rows, review states, filtering and search before the new logic.
- [x] Port the shared frame/action bar and overview using existing components and a small read-only presentation layer. Keep real forms, role checks and calculations.
- [x] Apply the reference tokens to the workspace, invoice/expense/team surfaces, responsive states and accessible controls. Added the four explicitly requested dedicated pages using existing saved workflows.
- [x] Compare the rendered reference with a fictional-data rendering of the actual presentation components. Keep authenticated integration QA explicitly pending if inaccessible. Run focused tests, lint/type checking and a production build; one fresh review and commit with this plan.

## Verification

Final focused run: 38 tests passed across UI presentation, navigation, expense pagination links and the existing forecast engine. Lint and the final production build, including TypeScript and all four additional routes, passed. Test fixtures were completed to match the typed snapshot as the frame now reads actual members and records. Calculation and database permission code was not changed.

One fresh review found mobile CSS hiding statuses/search, an unnamed mobile profile trigger and links to expenses after the first page. Fixed all findings; the new pagination regression failed before the shared source-link fix and passed afterward. The same link helper is used by activity/search and daily forecast sources. Balance-changing actions invalidate the workspace layout so the persistent search/review panel receives updated records.

Compared the rendered supplied source with the actual presentation components using fictional records in an isolated preview. Checked 1265×713 desktop captures, 390×844 phone and 768×1024 tablet frames. Confirmed activity filtering, record search/Escape dismissal, mobile menu open/close and keyboard horizontal table scrolling. Fixed phone toolbar overlap, sidebar internal scrolling and accidental uppercasing of row headings. Browser warning/error log was empty in the fictional preview. The preview has no production sign-in/session or writable backend; action stubs exist only in the temporary preview.

Authenticated seven-page navigation, real writes/retry behavior, full keyboard/role walkthroughs and live database integration were not rerun. The user previously chose to review the authenticated screen later; no credentials or bypass were requested. Visual QA remains [blocked for the full integration](../reviews/figma-port/design-qa.md), despite the successful fictional-data comparison.

Existing Graphify output was queried; refresh remains blocked by the previously documented Windows Application Control policy, with no bypass. No qualifying Next.js feedback candidate remained after the reporting pass. No new dependency, Payload installation, deployment or external messaging was performed.
