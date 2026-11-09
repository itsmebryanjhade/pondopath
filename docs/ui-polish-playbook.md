# UI/UX polish playbook

How we polish the signed-in workspace one piece at a time. It records the rules Bryan repeated during the 7 November 2026 session and what they produced, so a future change can start from here instead of from scratch. It is guidance and history, not evidence of a current browser check; see [testing](testing.md) for what was verified. Colours, type and components stay those of the [design system](design-system.md) and the [workspace design specification](superpowers/specs/2026-10-28-main-workspace-design.md), which win on conflict.

## The goal

A clean, easy-to-use SaaS MVP: the workflow is visible, each page has one clear next step, and nobody has to read instructions. Rearrange and improve; do not restyle the product.

## Rules that kept coming up

**Scope**
1. **One piece at a time.** Pick one section, finish it, show it, then move on. Do not rework neighbouring parts. ("You shouldn't touch the cards below it.")
2. **Change only what was asked.** If a request is about spacing at the top, the panel, chart and cards stay exactly as they were. When a change goes too far, undo all of it first, then redo only the asked part.
3. **Keep our colour and type.** No new palette, fonts or dependencies. Amber means "projected shortfall or needs review", red means negative or overdue, green is the brand. Corners 16/12/8px, spacing on an 8px grid.
4. **Do not copy a reference.** Take the idea (grouping, a status bar, a bottom nav), not the look.
5. **Ask before big moves.** Show a recommendation first (a mockup or a short list), get a yes, then build. Say what you will remove or merge.

**Content**
6. **Fewer words.** Replace explanations with a number, a chip or an ⓘ tip. Say it once on a page. A SaaS MVP dashboard is mostly numbers and next steps.
7. **Plain words, no jargon.** "Check if Northbay paid ₱50,000" beats "Verify the expected receipt…". Say what a date belongs to ("Follow-up late since 30 Oct" next to "promised 3 Nov") so two dates never look contradictory.
8. **Name the thing and link to it.** A count with no records behind it is not useful; list the records and link each to where it is fixed.
9. **No invented destinations.** Every link goes to a real page. Do not add features that already exist on another tab.

**Behaviour**
10. **One main action per page**, filled and obvious. Secondary actions are outlined or text. Never two buttons that do the same thing.
11. **Fix the hover to the element.** Hover may change only the element under the pointer: no layout shift, no whole-row highlight, no changing the gap or width of an auto-width table.
12. **Links that jump must work every time.** A same-page `#hash` link does nothing on a second click in Next.js; use the shared `JumpLink`.
13. **Do not duplicate across tabs.** If a tool exists on its own page (scenario on Forecast, opening cash on Cash ledger), the Overview links to it instead of embedding a copy. Evaluate "keep, improve, merge, remove" before adding a section.
14. **Prefer the live version.** Update results as the user types instead of a Preview button; pre-fill sensible values; offer quick chips for the common cases.
15. **Motion only when something changes**, short, from the transitions-dev tokens (`--duration-quick 150ms`, `--duration-fast 250ms`, `--duration-slow 400ms`, `--ease-smooth-out`). Every animation and transition has a `prefers-reduced-motion` guard.

**Layout and responsiveness**
16. **Use the space.** On wide screens use columns and a header row that fills the width; on phones stack, with a 16px gutter, 44px touch targets and no sideways scroll.
17. **Check three widths** in the browser: about 1880px, 1100px and 375px.
18. **Dropdowns** use the shared custom chevron with padding on the right so the arrow never touches the edge.

**Colour with meaning**
19. **Caution is warm amber, calm is green.** A "check this first" card gets a soft amber wash, border and small label; when there is nothing to check it turns green. Keep text contrast at 4.5:1 or better.

## Shared building blocks

| Piece | Where | Use it for |
| --- | --- | --- |
| Workflow bar | `components/cash-overview.tsx`, `lib/ui/overview.ts` | Four steps with status: Add records, Review, Forecast, Follow up |
| Top bar plan date and refresh | `components/workspace-tools.tsx`, `components/refresh-records.tsx` | The compact date and refresh icon on every page; headings hide their copies on desktop |
| Next actions | `components/next-actions.tsx`, `lib/ui/next-actions.ts` | Headline with customer and amount, urgency stripe, one button, "Do this first" |
| Row and section button | `.row-action` in `app/workspace.css` | The small outlined button for table rows and section links |
| Invoice panel | `components/invoice-drawer.tsx` | A side panel listing every invoice, each linking to its own page |
| Forecast checks | `lib/ui/forecast-checks.ts`, `components/forecast-check-list.tsx` | "Before you trust this forecast": plain checks with records and links |
| Jump link | `components/jump-link.tsx` | In-page links that work on every click |
| Inline entry | `components/manual-entry.tsx` | Add an invoice, expense or received payment without leaving Add records |
| Scenario panel | `components/scenario-panel.tsx`, `components/cash-impact.tsx` | "What if a customer pays later or only part?", live, with a one-sentence result |
| Opening cash editor | `components/opening-cash-editor.tsx`, `components/cash-position.tsx` | Summary first; Edit opens a two-field form that closes after saving |
| Payment history | `components/payment-history.tsx`, `historyRows` in `lib/ui/cash-overview.ts` | One list of money in and out with filters; each row links to the record where it is voided |

## What was polished, in order

1. Grouped, collapsible sidebar and a phone bottom bar; "Cash ledger" and "Review imports" naming; one add action.
2. Add records page: drop zone, Excel and CSV, then forms in place for invoice, expense and received payment.
3. Overview: workflow bar added to the existing layout; the header moved into the top bar; Next actions and Cash-flow activity redone; the scenario and opening-cash panels removed in favour of their own pages; forecast checks in plain words with a warm caution style.
4. Forecast: the redundant "Compare a scenario" button removed, scenario panel made live with quick chips, checks card beside it.
5. Cash ledger: opening cash as a summary with an Edit button and a "How your available cash is worked out" strip; the three repeated metric cards removed; "Cash rule" replaced by "Not cash yet" (expected customer payments with links); the separate Payments page merged in as Payment history, with `/payments` redirecting to it.
6. Cleaned up along the way: hover that shifted a whole table, in-page links that only worked once, a wrapping end-balance number, dropdown arrows touching the edge.

## Mistakes to avoid

- **Restyling what was not asked.** The "tighter top" attempt changed the dark panel, chart and cards and had to be undone. Change the named area only.
- **Overwriting another agent's work.** Check `git status` and `git diff` first. If another session edited the same files, back its changes up before touching them, and never discard them without the owner saying so.
- **`position: fixed` inside an animated page.** A leftover `transform` from the page-enter animation pins "fixed" to the page. Use the top bar or a fade-only entrance instead.
- **Widening something on hover.** Changing `gap` or `width` on hover resizes auto-width tables and moves every column.
- **Fixed widths in a narrow box.** A row of four cards fits at 1440px but not at 1100px with the sidebar open; use a container query so the row stacks when its own box is narrow, and keep big amounts on one line (`white-space: nowrap` with a `clamp()` size).
- **Specificity fights.** Workspace tables default to `min-width: 1020px` and `.disclosure.panel > summary` rules are broad; raise specificity for new components and test the result.
- **Committing a red suite.** Read the test result before `git commit`.

## Checklist for each piece

1. Say in one line what the page or section is for. Name what is repeated elsewhere.
2. Propose keep, improve, merge or remove. Wait for a yes on anything that removes a feature.
3. Build with existing tokens and components. Add tests for any new logic or wording (`lib/ui/*.test.ts`).
4. Check the page at about 1880px, 1100px and 375px; hover and click the changed element; confirm no sideways scroll.
5. Run `npx vitest run`, `npx tsc --noEmit` and `npx eslint` on the touched files. Use Node 24; if `next build` fails with `WasmHash._updateWithBuffer`, move `.next/cache/webpack` aside and rebuild (see [testing](testing.md)).
6. Report what changed, what was not checked, and what is left uncommitted. Stage only your own files; no push or deploy without a go-ahead.

## Prompt template

> Improve the **\<section\>** on the **\<page\>** tab. First say what this section is for and whether it duplicates something on another tab. Suggest what to keep, improve, merge or remove for a SaaS MVP (simple, few words, one main action). Keep our colours and type. Change only this section. Use plain words, name the records, and make hover affect only the element under the pointer. Check 1880px, 1100px and 375px, honour reduced motion, and run the tests before you tell me it is done.
