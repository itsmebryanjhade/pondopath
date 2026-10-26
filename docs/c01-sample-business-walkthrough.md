# SoloForge: C01 sample business case and walkthrough

Prepared October 26, 2026. All businesses, messages, records and amounts below are fictional. This is a discussion and validation exercise, not a PRD, product implementation, customer result or financial recommendation.

C01 is the selected hackathon problem: expected customer payments may arrive after payroll, supplier bills and other expenses fall due. The proposed Cash-Flow Action Planner connects collection follow-ups, confirmed payment commitments and a 30-day cash plan. Its primary challenge category is Finance & Operations.

## People and situation

Demo Supply Co. is a fictional small Philippine business supplying office consumables to other businesses. It delivers goods before customers pay. This example represents a payment workflow; it does not restrict the product to this industry.

- Primary user: the finance/admin employee who maintains invoice records, follows up with customers and prepares the cash plan.
- Reviewer and potential buyer: the owner who reviews communications and decides how to respond to a shortage.
- In an owner-operated business, one person can perform both roles. These roles do not prescribe separate accounts for the demo.

The admin needs to answer: "What changed in our expected collections, what does that mean for Friday's obligations, and who will follow up next?"

## Sample records

Currency: Philippine pesos (PHP). Opening available cash is **PHP 40,000 at the start of October 26, 2026**. The 30-day window runs from October 26 through November 24, inclusive. Treat this as a fixed sample period, not a live forecast of the real business.

### Customer invoice

| Invoice | Customer | Amount | Already received | Outstanding | Invoice due date | Initial expected receipt |
| --- | --- | ---: | ---: | ---: | --- | --- |
| INV-001 | Demo Customer A | 50,000 | 0 | 50,000 | October 29 | October 29 |

The invoice represents an already completed delivery. Its unpaid value is not included in opening available cash. Customer contact details are intentionally omitted: no real communication is sent during this exercise.

### Upcoming expenses

| Record | Obligation | Amount | Due date | Initial status |
| --- | --- | ---: | --- | --- |
| PAY-001 | Employee payroll | 50,000 | October 30 | Unpaid |
| BILL-001 | Supplier bill | 20,000 | October 30 | Unpaid |
| BILL-002 | Rent | 10,000 | October 30 | Unpaid |
| **Total** | | **80,000** | | |

These are total cash amounts. The exercise does not calculate payroll, tax or interest. No other cash movements or minimum reserve are included. A real business would need to enter its other obligations and receipts; their omission here is a simplification, not a prediction that none exist.

## Walkthrough: the main story

1. **Admin checks the initial plan.** Opening cash of 40,000 plus the expected 50,000 receipt, less Friday's 80,000 expenses, leaves a projected 10,000. Expected receipts remain visibly separate from available cash.
2. **Admin prepares a follow-up on October 28.** The owner reviews the draft below. Record it as reviewed for the exercise, not delivered. In a later product demo, a simulated send must be labelled as simulated.
3. **Customer gives a later date.** Use the fictional reply below. AI may suggest the amount and date; the admin checks the source text and confirms the details. The same entry must also be possible manually.
4. **Admin records the commitment.** Replace the expected receipt date for the existing 50,000 with November 2. Keep October 29 as the original invoice due date. Record who confirmed the change and when; do not create a second 50,000 receipt or change available cash.
5. **The cash plan shows the effect.** Friday now has an unfunded amount of 40,000. The Monday promise does not cover Friday's timing gap. Show the invoice and three obligations behind that result.
6. **Owner reviews the unresolved gap.** Record that the owner reviewed the situation and assign the admin a next action, such as asking whether an earlier part payment is possible. Do not count the requested amount in the plan unless a new expectation is explicitly confirmed. No expense due date changes automatically.
7. **Admin keeps the commitment under review.** For this example, set a follow-up for November 3 if the November 2 payment is not recorded. When money is actually received, record the receipt against INV-001 and reduce the remaining expected amount.

### Fictional draft and reply

Reminder draft, for review only:

> Good day. This is a reminder that invoice INV-001 for PHP 50,000 is due on October 29, 2026. Please confirm your expected payment date, or let us know if you need any supporting information. Thank you.

Customer reply, supplied as sample input:

> We can pay the full PHP 50,000 for INV-001 on November 2, 2026. Please follow up with us if you have not received it by then.

Expected confirmed details: invoice INV-001; promised amount 50,000; promised date November 2; no stated reason for the delay. The system must not invent a dispute, missing document or customer cash problem.

## Expected calculations

The following rows are alternative cases, not cumulative events. Projected negative balances represent an unfunded amount if scheduled expenses fall due; they do not authorize an overdraft or imply that those expenses were actually paid.

| Case | Cash available before Friday, based on recorded receipts | Expected receipts through Friday still to arrive | Friday expenses | Projected Friday balance |
| --- | ---: | ---: | ---: | ---: |
| A: Initial plan; no actual receipt recorded | 40,000 | 50,000 on October 29 | 80,000 | **10,000** |
| B: Full payment now expected November 2 | 40,000 | 0 | 80,000 | **-40,000** |
| C: Only 20,000 actually received October 29; remaining 30,000 expected November 2 | 60,000 | 0 | 80,000 | **-20,000** |

For case B, the original forecast changes from 40,000 on October 29 to -40,000 on October 30, then 10,000 on November 2 if all planned movements eventually occur. The negative interval is the problem to flag; Monday's positive figure must not hide it. Resolving how Friday's obligations are funded remains an owner decision outside this exercise.

### Partial receipt check: case C

On October 29, supply a fictional confirmed receipt, REC-001, for 20,000 against INV-001. The original commitment was 50,000 on November 2. For this alternative, assume the owner confirms that the remaining 30,000 is still expected November 2.

- Available cash: 40,000 + 20,000 = **60,000**.
- Invoice outstanding: 50,000 - 20,000 = **30,000**.
- Remaining expected receipt: **30,000**, not 50,000.
- Friday unfunded amount: 80,000 - 60,000 = **20,000**.
- Adding REC-001 again must not increase cash a second time.
- Invoice remains partially paid; a reminder should use the outstanding amount.

The 20,000 receipt and remaining 30,000 expectation together represent the original 50,000. A recorded payment replaces the corresponding expectation; it is not additional income on top of it.

### Missed commitment discussion

If November 2 passes without a recorded receipt, flag the commitment as missed or unconfirmed and prompt the admin to check payment records before another reminder. No recorded receipt does not establish that the customer has not paid.

Do not invent a replacement payment date. A fresh forecast after that date needs an updated cash position and the actual status of Friday's expenses. Overdue unpaid obligations must remain visible for review rather than disappearing because their dates are in the past. The sample's original forecast is a historical scenario, not the current bank balance.

## Short reviewer exercise

Use this with one finance/admin employee or owner when available. It can be a short conversation, not a broad survey. Do not request customer names, bank details or confidential records; these fictional figures are enough for the first walkthrough.

First, give the reviewer only the business situation, sample records and customer reply. Hide the expected-calculation table. Ask them to use their usual approach and explain:

1. What is the projected Friday position before and after the customer changes the date?
2. What records would they update, and who would they tell?
3. After a 20,000 part payment, what remains unpaid and what is Friday's gap?
4. What would they check before following up on a missed commitment?
5. Which step in this example differs from how their business actually works?

After a working prototype exists, repeat the same type of task using the product. To reduce the effect of remembering the answers, use an equivalent case with different amounts, or alternate the task order across reviewers. Record setup separately from repeat use. A facilitated walkthrough today establishes comprehension and workflow feedback, not software time savings.

| Observation | Current method | Product, once available |
| --- | --- | --- |
| One-time setup and data-entry minutes | Not measured | Not measured |
| Repeat task minutes, including updates and review | Not measured | Not measured |
| Places where the same change must be entered | Not observed | Not observed |
| Correct balances and outstanding amount | Not checked with reviewer | Not checked with reviewer |
| Help needed to complete the task | Not observed | Not observed |
| Missing or unrealistic steps | Not observed | Not observed |

Ask what the reviewer currently uses and why it is sufficient or insufficient. If the current method handles this quickly and reliably, record that finding; do not treat it as failure by the reviewer. Willingness to pay needs a later concrete product offer, not a general "would you use this?" question.

## What this exercise can establish

It can check the proposed workflow's logic, calculations and clarity, and reveal missing business steps. The product hypothesis is less repeated updating and clearer coordination for a small team. Existing tools already offer forecasts, promises, scenarios and follow-up tasks; this walkthrough does not prove a unique feature or a market-wide gap.

The core calculations and records use rules. AI assistance is limited to suggested extraction or drafting with human review; this exercise can be completed with AI unavailable.

No application, live integration, real communication or PRD is created by this document. Business usefulness, comparative effort and willingness to pay remain unmeasured.
