# C01 deeper verification and decision ledger

Research date: October 26, 2026 (Philippines)

Status: C01 is the selected hackathon problem. The current direction is an AI-assisted Cash-Flow Action Planner combining collections, a 30-day forecast and owner-reviewed scenarios. This file consolidates research and decision context; it is not a final PRD or an approved implementation plan. Mentor approval of the broad problem is reported by Bryan, not evidence of customer demand. No product code, package or third-party workflow was merged.

Read alongside the [source-code reuse audit](c01-open-source-audit.md) and [sample business walkthrough](c01-sample-business-walkthrough.md).

## Current problem and audience

Businesses can be profitable and still lack cash when payments are due. Customers may pay later than expected, while payroll, supplier bills and other expenses still have due dates. When expected income and upcoming expenses are tracked separately, a business may spot a cash gap too late to respond. This can lead to late payments or disrupted operations. The product addresses two connected needs: seeing a possible shortage early and helping the business take relevant action, such as following up on an unpaid customer invoice.

Initial target: small Philippine B2B suppliers and service businesses that allow payment after delivery or completion. The primary user is the finance/admin staff member or bookkeeper; the owner or manager reviews decisions and is the potential buyer. One person can perform both roles. The first demo remains one business using fictional or authorized records.

Bryan's teacher in a private construction company described supplier pressure when customer receipts are late and payroll and bills overlap. This is secondhand qualitative context, not proof that recordkeeping or weak follow-up caused that company's problem. Construction is an example, not the exclusive target sector.

## Source references preserved from the earlier research memo

| Source | Previously checked finding | Limitation |
| --- | --- | --- |
| [CRIF Philippines Payment Study 2026](https://www.crifasia.com/research/philippines-payment-study-2026/) | The public summary covers 167,370 payment experiences from 27,392 entities across company sizes and eight industry groups. It reports on-time payment of 40% for large enterprises and 77.9% for small enterprises. | Trade-payment network data; the full report and detailed sampling definitions were not obtained. This supports a local problem signal, not population-wide prevalence or demand for our product. |
| [Federal Reserve Banks, 2026 Report on Employer Firms](https://www.fedsmallbusiness.org/-/media/project/clevelandfedtenant/fsbsite/reports/2026/2026-report-on-employer-firms/2026-report-on-employer-firms.pdf), printed page 3 | Reported financial challenges include uneven cash flow (50%), paying operating expenses (54%) and increased goods/services/wage costs (73%). | US survey fielded in 2025 with a weighted convenience sample. Not Philippine statistics or evidence that cash flow ranks first. |
| [Intuit QuickBooks 2025 late-payments report](https://quickbooks.intuit.com/r/small-business-data/small-business-late-payments-report-2025/) | Among 2,487 surveyed US small businesses, 56% reported money owed from unpaid invoices and 47% had some invoices more than 30 days overdue. | Vendor-commissioned US research. Unpaid does not always mean overdue; associations do not prove product impact. |

## Challenge context

Primary category: Finance & Operations. The challenge calls for an AI-powered, low-code solution. The supplied judging screenshot assigns 30% to Business Impact & Problem Fit, 30% to Technical Execution, 25% to Solution Quality & Innovation and 15% to User Experience & Usability. Its UX description repeats the impact wording, so that detailed wording remains unconfirmed.

The previously reviewed [Jia award deck, slide 6](https://www.canva.com/design/DAHY16SAhes/-4hpneI7fEbe0QrVjR3itg/view?utlId=h4327cd1025#6) does not require project integration with Jia. Talent Vault, registration and final-demo requirements are separate. Organizer rules on third-party code reuse and attribution remain to be checked before incorporating code.

## Evidence ledger

| Question | Finding | Status and practical implication |
| --- | --- | --- |
| Does the payment-timing problem occur in the Philippines? | CRIF's published 2026 summary describes late-payment patterns across company sizes and eight industry groups in its trade-payment dataset. | Supported as a local problem signal. The full report, sampling details and target-segment frequency remain unavailable. |
| Is C01 the single most common business problem? | Existing US survey evidence identifies uneven cash flow as substantial, with rising costs more frequently reported. Local payment data does not rank all business problems. | Not established. Use "a recurring business problem," not a number-one claim. |
| Can delayed customer payments affect the business's own supplier payments? | A UK government study documents respondents attributing late incoming payments to customers themselves being paid late. Bryan's teacher's example is consistent with cash pressure, although secondhand. | The chain mechanism is documented; its frequency and exact cause in the proposed Philippine user segment are unverified. |
| Are paperwork and approval problems real causes? | UK research includes administrative/invoicing errors among reported causes. | Supported as one possible cause, not the dominant cause in the Philippines or a guaranteed software opportunity. |
| Will more reminders fix a cash shortage? | Studies also identify customer cash constraints and economic conditions. | A reminder or task cannot create customer funds. Scope the promised outcome to coordination and planning. |
| Are forecasts, scenarios, promises and collections missing from competitors? | Chaser, Agicap, Dryrun and other tools document substantial overlap. | No verified general feature gap. More features alone do not establish differentiation. |
| Can open-source code support the prototype? | Specific forecast, invoice and automation sources and licenses were inspected. | Yes, selectively. See the audit for dependencies and limits. No runtime integration has been tested. |
| Is a limited one-business demo feasible? | Explicit inputs, a 30-day deterministic balance calculation, case status and reviewed actions form a contained workflow. | Plausible engineering scope, not an achieved working MVP or a guaranteed delivery estimate. |
| Is it practical for a real small team? | Real records, update habits and time spent preparing them have not been observed. | Unverified. Data preparation may cost more time than the product saves. |
| Will businesses pay enough to sustain it? | Existing commercial offerings show category investment, but not demand for SoloForge. | Unverified. Needs a concrete offer after a useful demonstration and an operating/support cost estimate. |

## New evidence about causes

[UK Department for Business and Trade research, published September 2024](https://www.gov.uk/government/publications/late-payments-research-performance-and-practices-across-business/late-payments-research-understanding-variations-in-payment-performance-and-practices-across-business-sectors-and-sizes-html-executive-summary) used 300 telephone interviews in January 2024 across five sector groups and micro-to-large firms. In reported reasons for payments received late, 40% cited customers themselves being paid late; 24% cited administrative errors. The study also describes relationship and bargaining constraints. These are self-reported UK explanations, not percentages of Philippine invoices or estimates of a software's causal effect. They support separating liquidity constraints from process problems.

[Atradius Asia report highlights, July 2026](https://atradius.ch/knowledge-and-research/news/b2b-payment-stress-rising-beneath-stable-headlines-in-asia) describe a 2,145-supplier survey across eight named markets: China, Hong Kong, India, Indonesia, Japan, Singapore, Taiwan and Vietnam. The Philippines is not included. It describes customer cash stress and payment pressure spreading through supply chains. Use it only as regional context. Do not relabel it as Philippine evidence or pool it with CRIF's different dataset.

The CRIF summary and Atradius highlights describe different company-size patterns in different samples. Company size alone is therefore not a justified rule for predicting whether a particular customer will pay late. Our proposed prototype should rely on entered dates, recorded events and visible scenarios.

No source checked establishes that missing documents are the dominant reason payments reach Bryan's reachable businesses late. Do not build that assumption into the main problem statement.

## Boundary between software work and external constraints

| Situation | What software could help with | What it cannot establish or guarantee |
| --- | --- | --- |
| Invoice missing a required document or correction | Record the requirement, assign the action, attach or reference the corrected information, and track acknowledgement | That the buyer will approve or pay by the requested date |
| Approval status unknown | Maintain an identified contact, requested update and follow-up date | Access to the buyer's internal approval system without participation/integration |
| Customer promises a later date | Record the promise separately, update a forecast assumption and compare a late scenario | That a promise is received cash or a guaranteed receipt |
| Customer lacks cash | Show the consequences of delayed receipts and track an owner-approved response | Create funds, force payment, or make financing affordable or available |
| Expenses are simply too high or sales are insufficient | Make entered timing and amounts visible for owner review | Fix profitability through reminders or a forecast |

## Competitor checks added

- [Chaser dashboard](https://help.chaserhq.com/debtor-relationship-management-dashboard): disputes, promises, risk views, next actions and CSV import are documented. [Cash-flow table](https://help.chaserhq.com/cash-flow): starting cash, customer receipts, expenses and manual entries are documented; automated endpoints have platform limits. Exact plan entitlement and hands-on preparation time were not tested.
- [Agicap](https://agicap.com/en-us/products/account-receivable/): receivables collection workflows feed cash forecasts. This undercuts a claim that joining those features is itself new.
- [Dryrun](https://www.dryrun.com/features): scenario modeling, daily/weekly/monthly views and spreadsheet import/export are documented. Spreadsheet support and what-if views are not general gaps.
- [Zoho Books Canadian-edition documentation](https://www.zoho.com/ca/books/help/reports/business-overview.html): recurring-record cash forecasting and assumptions are described for certain plans. Availability in the relevant Philippine/global edition was not verified, so do not generalize the entitlement.
- [Juan Accounting cashflows documentation](https://help.juan.ac/en/articles/9095678-cashflows): centralized actual cash movements and reconciliation status are described. This page alone does not confirm or rule out a forward-looking forecast elsewhere in the product.
- Actual Budget's inspected source includes an experimental balance forecast. A deterministic forecast already has an open-source implementation; the arithmetic is not a defensible exclusive capability.

The checks are documentation/source review, not product trials or a complete market census. Absence from one page is not evidence that a feature is missing.

## Selected direction and deferred alternative

1. **Selected: cash planning and commitments workflow.** Connect expected receipts and fixed obligations to explicit owner-reviewed scenarios and next actions. This can address uncertainty and coordination, including when a receipt will remain late. Forecasting competition is strong; preparation and coordination effort must improve measurably. AI assists with explaining calculated results and proposing updates or drafts from customer replies; people confirm changes and programmed rules handle balances.
2. **Deferred: payment-blocker workflow linked to cash.** A dedicated document/approval/dispute case process could address avoidable process delays, but it should become a main feature only if target users actually experience that bottleneck.

The second direction must not be presented as the proven cause of C01 merely because it is buildable. A universal accounting system, lending network or enterprise integration project remains beyond the first solo two-week scope.

## What can be tested without a survey campaign

Public research is sufficient to justify a prototype hypothesis; it cannot complete commercial validation. If a reachable finance worker is available, a brief walkthrough of one recent incident can check:

1. What customer receipt was expected, what obligations overlapped, and what actually happened?
2. Why was the receipt delayed, and what evidence supports that explanation?
3. What could the business have changed earlier, if anything?
4. Which tools/records already handled the task, and where did repeated manual work remain?
5. Would this workflow remove that work, or add another record to maintain?

One example improves understanding; it does not establish market prevalence. The [existing Google survey](https://docs.google.com/forms/d/e/1FAIpQLScWpLVwmtLviXvkrCP-az9cqhAWywsNgWRlWDr9DblSvFz_oQ/viewform) stays optional, and no outreach has been sent. Its [editing link](https://docs.google.com/forms/d/1qhtuAjXOVJI4hv9Zk6slUHwtsgwSqrmJCI9VPmcqeqo/edit) is retained for reference; workspace cleanup does not alter or unpublish that form.

For a later demonstration, compare the same known dataset in the current spreadsheet process, a suitable existing alternative and the prototype. Include initial setup, ongoing entry, follow-up tracking and corrections in total effort. Show correctness under late receipts, partial actual receipts, repeated updates and threshold changes. Do not count a completed task as money recovered or a promise as cash received. A synthetic dataset proves behavior on that dataset, not customer impact.

A later priced pilot or purchase commitment can test willingness to pay after a demonstrated benefit. A list price, a mentor's approval or a hypothetical survey yes is not equivalent evidence.

## Decision standard

Keep C01 if the chosen business workflow is recurring, understandable, accessible to prototype and demonstrably improved by a limited system. Choose the solution around the observed controllable work. Reconsider the product claim if a spreadsheet or an existing tool already handles it well, records are too costly to maintain, or the real need is funding rather than process support.

Sustainability requires repeated value and support costs below what users will pay. Practicality requires fitting the actual records and communication habits. Feasibility requires a small working flow, not an accumulation of copied features. The judging rubric can be addressed through measurable problem evidence, functioning rules/automation, a justified AI role and usable actions; achieved scores or a passing result cannot be assigned before a working demonstration.

Research verdict: C01 is a documented broad problem and is now the chosen focus for a limited hackathon prototype. Our particular customer-fit advantage, business outcomes and willingness to pay are not verified. The [current PRD](superpowers/specs/2026-10-26-cash-flow-action-planner-design.md) is prepared for product review; implementation has not started.
