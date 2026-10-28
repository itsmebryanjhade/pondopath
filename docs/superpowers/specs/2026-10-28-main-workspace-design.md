# PondoPath main workspace design

Status: rounded SaaS direction approved on 28 October 2026; visual variant selection pending. This is a design brief, not an implementation approval or a new PRD.

## Intent

Give finance/admin staff and owners a recognizable, readable daily workspace that answers: will recorded cash and expected customer receipts cover upcoming obligations, and what needs attention next? Keep actual receipts, customer promises and projected balances visibly distinct.

## Approaches considered

1. **Rounded SaaS with a restrained bento grid — selected.** Softer containers and selective depth, with card size based on the financial task. Keeps a clear reading order and practical lists.
2. **Expressive bento.** More variable tiles, colored backgrounds and larger curves; visually striking but more likely to compete with amounts and follow-up actions.
3. **Flat ledger.** Compact, divider-led and precise; less aligned with the user's desired approachable product identity.

The selected direction evolves the provisional four-pixel panels. Existing uncommitted workspace styling is preserved while the visual target is chosen.

## Shared design rules

| Element | Proposed rule |
| --- | --- |
| Identity | Existing green PP monogram and PondoPath wordmark; existing single P for small icons |
| Type | Self-hosted DM Sans; body 14–16px, labels at least 12px, page heading 28px, main amounts 30–34px; tabular amounts |
| Background and surface | Warm off-white `#F7F8F4`, white `#FFFFFF`, pale sage `#EDF3ED` |
| Ink and secondary text | `#18372D` and `#596B62`; verify actual contrast before implementation |
| Brand and chart | Forest `#1E4B3C`, supporting green `#2E7B58` |
| Risk | Amber for a projected shortfall requiring review; red for negative amounts/overdue states, always accompanied by text |
| Borders | Quiet `#DBE3DE` separators; no nested card around each row |
| Corners | 16px major panels, 12px small summary cards, 8px inputs/buttons |
| Spacing | 8px base; 16–24px section gaps and 20–24px panel padding |
| Elevation | A subtle low shadow on selected cards; stronger shadow for genuinely floating menus/dialogs; no glow, blur backgrounds or heavy shadows on every container |
| Interaction | Clear hover, focus, pending and disabled states; minimum 44px controls; restrained motion with reduced-motion support |

## Cash overview composition

- Labelled sidebar: Cash overview, Customer invoices, Expenses & payments. Show business context, current role, sign out, and owner-only invitation access. No invented navigation destinations or business switching.
- Page heading and date/refresh strip: keep the fictional demo label, explicit financial reference date and Asia/Manila context. One primary action: Review customer invoices.
- Three summaries: recorded available cash; expected receipts in 30 days; unpaid obligations in 30 days. Expected receipts explicitly remain planning assumptions.
- Main row: a wide, traceable 30-day forecast alongside a narrower shortage and next-action panel. Chart uses straight dashed future segments, a visible zero line and readable axes. Retain access to the daily cash plan and source records.
- Below: customer payments to check and upcoming obligations as aligned, readable rows with visible amounts and working record links. Color indicates meaning, not decoration.
- Keep the existing temporary scenario and opening-cash baseline disclosures available without crowding the main decision.

## Responsive behavior

At desktop widths, use a 240px sidebar, consistent canvas gutters and a roughly two-thirds/one-third main row. At tablet sizes, fold navigation into the existing accessible menu and simplify the grid. At phone sizes, stack in a useful order: cash summary, shortage/next action, forecast, collections and obligations. Let large amounts wrap or switch to a single column; financial values must not be clipped. Tables scroll inside their own labelled regions.

## States and scope

Preserve genuine loading, empty, failure, stale-data and role-specific states. Keep all calculations, authorization, server actions, record history and human review rules from the PRD. No fake growth percentages, cash-health scores, decorative charts, public business data, autonomous payments or decorative nonfunctional buttons. This design applies shared tokens across the workspace; implement Cash overview first, then the invoice and expense screens in separate slices.

## Mockup data and visual variants

All visuals use the same explicitly fictional delayed-payment case from `docs/c01-sample-business-walkthrough.md`: PHP40,000 recorded cash; PHP50,000 expected on 2 November 2026; PHP80,000 expenses due 30 October; first/largest projected gap PHP40,000 on 30 October; projected ending balance PHP10,000 once the expected payment arrives. Demo financial reference date is 29 October 2026, intentionally preserved; actual client date is 28 October 2026. The negative interval must remain visible.

Explore three variations within the approved direction: neutral balanced cards; a stronger available-cash focal card; a compact grouped summary with more action emphasis. These are visual explorations of the same product and data. Resolve option numbers from their displayed order, then finalize this brief around the selected image before implementation.

Three independent imagegen mockups were displayed in this order:

1. Neutral balanced cards — output `exec-8317f050-55c5-44ed-9e52-6f2e4ba7d7df.png`.
2. Stronger available-cash focal card — output `exec-de51f9b6-c976-4960-baa9-9ffb7915fc9b.png`.
3. Compact grouped summary with more action emphasis — output `exec-33ada6a7-b66a-4da7-9116-576e6f07122f.png`.

The preview-only images remain in the task's standard generated-images folder. References actually supplied to all three generations were the approved PP asset and a captured screenshot of the user's published `color-route-74905091.figma.site/dashboard` design. Only palette/workflow grounding was taken from the older reference; its figures and dates were replaced with the fictional walkthrough.

Visual limitations to correct after selection: generated chart point placement is illustrative and does not precisely match the dated records; rebuild the chart from the existing domain forecast and never trace its coordinates from the image. The recovery belongs on 2 November. Remove the first variant's unsupported “real-time” wording, and remove business/role switcher chevrons where present. Current application data, permissions and available actions remain authoritative. Keep the approved PP source asset rather than tracing its generated appearance.

## Validation to perform after selection

Check the selected design with real application data and actual empty/error/role states. Verify monetary labels, keyboard focus, daily-plan/scenario access and desktop/tablet/phone layout. Screenshots are visual proposals only and do not prove that a workflow works.
