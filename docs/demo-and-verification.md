# PondoPath demo and presentation guide

Prepared 3 November 2026 for Bryan, SoloForge. This is a presentation draft using fictional business records. The organiser's exact pitch/video duration, submission links and deadline are handled by Bryan; the timings below are rehearsal targets, not event rules.

## The story

**Problem:** A business may expect enough customer income overall but still lack cash when payroll, supplier bills and other expenses fall due. Separate records and changing payment commitments make it harder to see and act on that timing gap.

**Product:** PondoPath connects unpaid invoices, reviewed customer commitments, a calculated 30-day cash plan and follow-up actions. Finance/admin staff maintain the records; the owner reviews decisions and communications. The initial target is small Philippine B2B suppliers and service businesses offering payment terms. Primary category: Finance & Operations.

**Value to demonstrate:** One reviewed customer update changes the receipt plan and forecast, keeps the original invoice due date, and leaves a clear next action. A verified receipt updates cash and outstanding balances together. AI helps interpret or draft; programmed rules calculate and enforce access.

The product supports earlier action; it cannot make a customer pay or remove a genuine funding shortage. Willingness to pay and actual time savings still need pilot evidence. Existing software offers overlapping capabilities, so describe our focused workflow without claiming competitors lack it.

## Use the right fictional workspace

Use the existing seeded **SoloForge Demo Services** workspace for this historical sample. Read the existing `DEMO_OWNER_EMAIL` / `DEMO_OWNER_PASSWORD` privately from the local environment file; never show them in the recording. Sign in normally. Confirm the visible **Fictional demo** label and reference date **29 October 2026**.

The ordinary Bryan workspace uses the current date and contains earlier test/import activity. Its figures will differ. Do not present the numbers below against that workspace.

| Check before recording | Required starting value |
| --- | --- |
| Reference date | 2026-10-29, Asia/Manila |
| Opening cutoff | 2026-10-26 |
| Available cash | PHP 40,000 |
| Invoice | DEMO-001, Demo Client Services, PHP 50,000 outstanding |
| Original invoice due date | 2026-10-29 |
| Initial expected receipt | PHP 50,000 on 2026-10-29, planning assumption |
| Unpaid obligations | Payroll PHP 50,000 + supplier PHP 20,000 + rent PHP 10,000, all due 2026-10-30 |
| Existing actual receipts for this case | None |

If any starting value differs, pause the numerical walkthrough. Do not overwrite records to force the script to fit. `scripts/seed-demo.mjs` is not a financial reset: it preserves existing records and can restore the fixed demo reference date. A clean rehearsal fixture should be prepared separately if needed.

## Numbers to explain

| State | Available cash | Outstanding invoice | Expected later receipt | Friday projected balance |
| --- | ---: | ---: | --- | ---: |
| Initial plan: full receipt Thursday | PHP 40,000 | PHP 50,000 | PHP 50,000 Thursday | **PHP 10,000** |
| Full receipt moves to Monday | PHP 40,000 | PHP 50,000 | PHP 50,000 Monday | **−PHP 40,000** |
| Verified PHP 20,000 received Thursday; remainder Monday | PHP 60,000 | PHP 30,000 | PHP 30,000 Monday | **−PHP 20,000** |

Initial Friday: 40,000 + 50,000 − 80,000 = 10,000. Delayed Friday: 40,000 − 80,000 = −40,000. After verified part payment: 60,000 − 80,000 = −20,000. If the remaining PHP 30,000 arrives Monday, the projected balance recovers to PHP 10,000. That later recovery does not fund Friday's obligations. These are planning calculations, not bank settlement or actual payments of the expenses.

## Short pitch script — approximately three to four minutes

Use the English slide titles and the following Taglish narration. Read naturally; shorten the optional proof section to fit the organiser's actual limit.

### 1. Introduction and problem

“Good day. I'm Bryan, the solo builder behind SoloForge. This is **PondoPath**, an AI-Assisted Cash-Flow Action Planner for small Philippine B2B businesses.

“May mga businesses na may expected income, pero kulang pa rin ang actual cash kapag due na ang payroll, suppliers and other bills. Customers can pay later than expected. Kapag hiwa-hiwalay ang invoices, payment promises and expenses, mahirap makita agad kung kailan magkukulang at ano ang dapat unahin na follow-up.”

### 2. Explain the fictional case

“For this fictional example, the business has **PHP 40,000 available cash**. May customer invoice na **PHP 50,000**, expected before **PHP 80,000 of Friday expenses**. Initially, the plan shows **PHP 10,000 remaining**.

“Pero sinabi ng customer na sa Monday pa sila makakabayad. The amount owed is the same, pero nagbago ang timing. PondoPath now shows a **PHP 40,000 Friday shortfall**. Kita rin kung aling invoice and obligations ang connected sa gap.”

### 3. Explain the action and human review

“The staff can record the customer's message and expected payment date, assign a follow-up, and prepare a reminder for the owner's approval. AI can help understand an English, Tagalog or Taglish reply and draft the message. Staff still check the details before saving.

“Programmed rules handle the balances, dates, permissions and forecast. A payment promise stays separate from money actually received.”

### 4. Show a verified partial receipt

“Now suppose the business verifies that **PHP 20,000 actually arrived**. Once recorded, available cash becomes **PHP 60,000**, the invoice balance becomes **PHP 30,000**, and Friday's projected gap becomes **PHP 20,000**.

“Hindi pa fully solved ang funding gap, but the team has an updated cash plan and a clear remaining collection task. They can respond using the current records.”

### 5. Explain practical operation and close

“For teams using spreadsheets, PondoPath also has CSV import with column mapping and a Review Inbox. New or changed rows become proposals. Invalid and duplicate rows are held, and staff confirm the valid changes before they reach financial records.

“The value is the working process: saved records, reviewed updates, traceable calculations, assigned follow-ups and an updated plan after confirmed changes. Manual entry and calculations still work when AI is unavailable.

“Our next step is a short pilot with finance/admin staff to measure task completion, corrections and repeated data entry. PondoPath helps the team **see a possible shortage early and take a relevant next action**. Thank you.”

## Live screen sequence

Allow roughly four to five minutes for an expanded app walkthrough. Keep the pitch and app walkthrough separate when the organiser gives separate time limits. The target timings are flexible.

| Step | What to open and do | What to show or say |
| --- | --- | --- |
| 1 — Overview | Sign in before recording. Open Overview in the fixed fictional workspace. | PHP 40,000 is available cash. PHP 50,000 is expected, not received. Point to the Friday point/daily plan rather than only the 30-day ending value. |
| 2 — Customer change | Open Invoices → DEMO-001 → **Update expected payment**. | Keep the original due date 29 October. We are changing the receipt expectation. |
| 3 — Review the promise | Enter the reply below. Set **Expected remaining receipt (PHP)** to `50000`, **Expected receipt date** to `2026-11-02`, **Customer-confirmed promise**, a next follow-up of `2026-11-03`, and an existing teammate. Review and confirm the receipt plan. | Saving the promise leaves available cash at PHP 40,000 and updates the forecast. |
| 4 — Forecast | Open Forecast and inspect Friday 30 October and the contributing records. | Friday closing cash is −PHP 40,000. The positive later balance does not cover the earlier gap. |
| 5 — Reminder | In the invoice, expand **Prepare a reminder draft**. Use the manual template or reviewed AI suggestion. Choose **Save draft**, **Submit for owner review**, then **Approve this version** as owner. | Approval applies to this message version. Copying is not sending. Do not report a message sent unless it was actually sent; no real message is needed for this fictional demo. |
| 6 — Verified receipt | In **Record a verified receipt**, enter `20000`, actual date `2026-10-29`, and a unique fictional reference such as `DEMO-REHEARSAL-01`. Check the actual-money verification box and submit once. | This represents a fictional verified receipt. Cash becomes PHP 60,000; unpaid balance and remaining expectation become PHP 30,000. |
| 7 — Smaller gap | Return to Forecast; inspect Friday and the remaining Monday receipt. | Friday is −PHP 20,000. Explain what remains unresolved. A receipt can clear an older reminder approval, so review a fresh version before reusing it. |
| 8 — CSV review | After the money walkthrough, open Invoices → **Import & review**. Create or reuse a source within this workspace and upload the fictional CSV; reuse that same source for later uploads. Show preview, original evidence and a pending proposal. | The existing five-row file has two valid rows, one invalid amount and a duplicated source ID. Re-uploading after review is repeat-safe. Keep this separate from the three-state financial example. |

Opening the expectation form or a source link is not a saved change. Confirm the visible result after each action. A save/refresh error means pause and retry through the app; do not continue narrating an unverified result.

### Customer reply for the AI-assisted or manual step

> Sa November 2, 2026 namin mababayaran ang full PHP 50,000 para sa DEMO-001. Please follow up kung wala pa kayong receipt by then.

For one live AI request, select **AI assistant → Understand a customer reply → DEMO-001 → Taglish** and paste the reply. Review the proposed amount/date and source text, then open the normal receipt-plan form to confirm. The message does not specify a reason for the delay; do not add one. The next-action date and assignee are staff decisions.

If AI is unavailable, explain the failure honestly and enter the same reviewed details manually. Do not represent the manual result as an AI response. Only a fictional demo workspace is enabled for the current assistant.

### Missed-commitment automation segment

Use a separately prepared, clearly labelled fictional **missed commitment** case for a scheduled Node-RED run. A Monday promise is not overdue in the fixed Thursday reference date; do not claim that it should already trigger a task. Do not change dates or use a manual **Check now** result as proof that Node-RED executed.

An actual Node-RED segment should show its run/status, one missed active commitment creating a follow-up, and a repeat run without another task. Node-RED does not post payments or send reminders. The 29 October machine-readable run evidence in `docs/automation-runtime-evidence.json` is available as historical proof, but it is not a newly recorded video or a current live run. A fresh recording/rehearsal remains pending.

## Eight-slide pitch deck

1. **PondoPath** — product, SoloForge and Finance & Operations.
2. **The cash timing problem** — target users, separate records and changing commitments.
3. **A fictional Friday cash gap** — the PHP 40,000 / 50,000 / 80,000 example and its three states.
4. **The working process** — records, forecast, reviewed action, confirmed result and recalculation.
5. **Rules, AI and human review** — exact responsibilities; English/Tagalog/Taglish support.
6. **Working MVP evidence** — 3 November code gate and dated, bounded AI/Node-RED evidence; no invented customer outcomes.
7. **Practicality, feasibility and sustainability** — existing CSV workflow, bounded AI and manual operation; pilot measures for commercial value.
8. **Next step** — finance-team pilot; honestly labelled future source adapters and remaining demo work.

The editable deck is `deliverables/PondoPath_Pitch_Deck_v3.pptx`. Source notes distinguish internal tests, historical real-provider evidence, fictional calculations and future plans. This draft uses English slide copy and Taglish speaker notes.

## Recording and submission handoff

Before recording, verify the preflight values, hide environment files and developer tools, close unrelated tabs, and use a clean browser window. Keep passwords, API keys, invitation tokens, real contact data and private notifications outside the capture area. Record only fictional records. Do not record this whole desktop while unrelated apps are visible.

Record the pitch and app section with your own voice. Capture the real cursor actions and resulting states. Preserve visible language that distinguishes expected cash, actual receipts, human approval and fictional dates. If editing out loading time, do not imply a measured speed improvement. Add captions and confirm the recording has readable amounts and audible speech.

| Submission field | Prepared artifact / remaining action |
| --- | --- |
| Project name | PondoPath by SoloForge |
| PRD | Existing current PRD; upload/share the approved viewer link |
| Pitch deck | Editable PPTX in `deliverables`; review, upload and check viewer access |
| Video/demo link | Recording and public viewer link still pending |
| Working app URL | Localhost currently; a public deployment needs a separately authorised destination and smoke check |
| Organiser form/deadline | Bryan handles these; not inferred here |

No submission, public sharing or deployment is performed by this document. Phone-width testing is deferred by Bryan. A live rehearsal, fresh bounded AI/Node-RED recording, final pitch timing and video review are still needed before calling Task E complete.

## Evidence and claims

The 3 November Node 24 code gate is **271 unit/UI tests + 112 integration tests**, typecheck, lint and production build. See `docs/mvp-runtime-evidence.json`, `taskDGate`.

The 29 October model evaluation passed **10 explicit extraction fixtures and 5 ambiguous/adversarial review fixtures**, across English, Tagalog and Taglish, with zero financial writes. This is a small test set, not a general accuracy guarantee. See `docs/ai-evaluation.json` and `docs/ai-verification.md`.

The 29 October Node-RED evidence records five real runtime cases, including task creation, repeat protection, catch-up and unreachable-app recovery. Its laptop runtime pauses with sleep/network loss. See `docs/automation-runtime-evidence.json` and `docs/automation-verification.md`.

The existing Task C browser proof saved one fictional CSV invoice and replayed its import without duplication. Do not count code tests as paying customers, production recovery validation, comparative time savings or proof of a unique competitor gap. Commercial pricing and willingness to pay remain to be tested.
