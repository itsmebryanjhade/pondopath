# Workspace UX direction

Status: direction approved in conversation on 7 November 2026. Each piece below gets its own plan before it is built.

## Rule that comes first

This is a rearrangement and clarification inside the existing design system, not a new look. [`2026-10-28-main-workspace-design.md`](2026-10-28-main-workspace-design.md) and the current source remain the authority for tokens, shapes, spacing, states and scope. Where this direction and that spec differ, that spec wins. The Add records visual design in [`2026-11-07-add-records-page-design.md`](2026-11-07-add-records-page-design.md) follows the same rule.

Kept as they are: the PP identity, DM Sans body and Manrope headings, the workspace colors and tokens (including warm ground, white surfaces, forest and leaf greens), 16/12/8px corner scale, 8px spacing, quiet separators, subtle elevation, 44px controls, reduced-motion support, all calculations, authorization, history and human-review rules. Not allowed: fake growth percentages, health scores, decorative charts, invented destinations, decorative buttons.

## Goal

A clean workspace where a non-technical owner or finance teammate always sees where they are in the workflow, what the answer is, and what to do next, in plain words.

## Principles

1. **Answer first.** Overview opens with a plain sentence that answers "Will I run out of cash, and when?"
2. **Colour means state.** Green is fine or done. Amber is a projected shortfall or something that needs review. Red is a negative amount or an overdue item. Colour always comes with text or an icon.
3. **Ask little.** At most three next actions at a time, each a sentence with one button.
4. **Show the workflow.** A four-step bar (Add records, Review, Forecast, Follow up) sits on every workspace page with live status. Every page ends with one next step.
5. **Plain words.** A number, a date and a verb. Sentence case. Each caveat appears once, behind a small "Why?" where it needs more than a line.
6. **Motion only when something changes.** The runway draws once on load, numbers count when they change, a check pops when a step completes. Nothing animates for decoration. Everything is off under reduced motion.

## Overview layout (top to bottom)

1. **Workflow bar:** four steps with status text. Done is green, needs-you is amber, a shortfall is amber, an overdue follow-up count is red. In a new workspace only step 1 is active and the others are greyed with a reason.
2. **The answer:** a one-sentence headline (for example "You'll be ₱40,000 short on Friday.") with one supporting line and a single secondary action, "See the full plan". When there is no shortfall, the sentence says so ("You have enough cash for the next 30 days.").
3. **Runway:** one bar per day for 30 days from the existing forecast calculation. Days at or above zero are green, projected shortfall days are amber, with ticks for today, the first shortfall day and the recovery day. It has a text summary for screen readers and links to the daily plan.
4. **Do next** (left) and **What changes the plan** (right): up to three actions drawn from existing next-action logic; the right panel keeps the temporary scenario and opening-cash disclosures.
5. **Ledger strip:** one white panel with four hairline-divided figures: cash you've recorded, expected in 30 days, due in 30 days, overdue. Replaces four separate cards.
6. **Activity table** stays below with the same rows, filters and links, trimmed to the most urgent rows with "See all".

A brand-new workspace replaces blocks 2 to 6 with two short steps (cash today, add records) and a greyed forecast placeholder.

## Plain words

| Today | New |
| --- | --- |
| Incomplete plan: 1 unpaid invoice has unplanned amounts or no usable expected payment. Review invoices. | 1 invoice has no payment date. |
| This projection includes expected payments that have not been verified as received. | Includes ₱12,500 you expect but haven't received. |
| Verify the expected receipt and follow up with the customer if needed. | Customer promised ₱20,000 on 3 Nov and hasn't paid. |
| Review an imported change · Source row sample-002 · Not applied to your financial records. | New row from your file. Check it before it counts. |
| Expected receipts are not available cash. Stale or review-needed amounts are excluded… | Expected money isn't cash until you record it. |
| Recorded cash, including actual movements | Cash you've recorded |

Safety meaning is unchanged: expected receipts are never presented as cash, and nothing is saved until a person confirms it.

## Order of pieces

1. Add records page (spec and plan written, visual design approved).
2. Workflow bar and Overview (runway, answer sentence, do-next, ledger strip).
3. Side menu: add Review Inbox (with a count), Payments, Follow-ups and Team, which are real pages today.
4. Quick add and manual entry.
5. Invoices and Expenses with the same text rules.
6. Review Inbox as a three-step flow.
7. Cash and Forecast, reusing the runway.
8. Final pass: loading, empty and error states, 375px sweep, accessibility audit, then end-to-end testing.

## Checks for every piece

Tests first where logic exists, desktop and 375px in the browser, keyboard focus, reduced motion, real empty/error/role states, contrast of at least 4.5:1, one commit per piece, and a review by the user before the next piece starts.
