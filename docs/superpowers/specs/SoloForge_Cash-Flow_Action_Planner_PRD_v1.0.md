# Product Requirements Document
# PondoPath — AI-Assisted Cash-Flow Action Planner

| Document detail | Value |
| --- | --- |
| Project | SoloForge |
| Product name | PondoPath by SoloForge |
| Product owner and solo builder | Bryan |
| Version | 1.1 |
| Date | October 26, 2026 — Asia/Manila |
| Updated | October 29, 2026 — Asia/Manila |
| Status | Core implemented with verification outstanding; approved intake expansion remains unimplemented |
| Primary challenge category | Finance & Operations |
| Supporting categories | Business Process Automation; Data Analytics and Reporting |
| Delivery target | One-business hackathon MVP within approximately two weeks |

## 1. Product summary

The AI-Assisted Cash-Flow Action Planner helps small Philippine B2B businesses see possible cash shortages early and coordinate a response. It connects customer collections, a 30-day cash forecast, and planning around upcoming payroll, supplier bills, and other expenses.

Finance/admin staff maintain records, follow up on invoices, and confirm customer payment commitments. Owners review cash gaps and proposed communications. A focused AI assistant explains calculated results and prepares proposed updates or reminder drafts. Programmed rules, not the language model, calculate balances and control record changes.

Version 1.1 adds an approved, phased intake expansion: manual CSV/Excel import, read access to selected spreadsheet/file sources through n8n, supported business messaging channels, and receipt-image extraction. All sources feed a shared Review Inbox before financial changes are confirmed. A clearer next-action worklist connects existing collection tasks and pending reviews. These additions are requirements for remaining work, not claims of working integrations. The canonical filename is retained so existing links continue to work.

The intended value is less repeated updating, clearer follow-ups, and more time to prepare. The software cannot create missing funds, compel payment, or guarantee that an owner can resolve every shortage.

## 2. Problem

Businesses can be profitable and still lack cash when payments are due. Customers may pay later than expected, while payroll, supplier bills, and other expenses still have due dates.

When expected income, customer payment commitments, and upcoming expenses are tracked separately, a business may spot a cash gap too late to respond. Staff must repeatedly update records, follow up with customers, and inform the owner about changes. This can contribute to late payments or disrupted operations.

The product addresses two connected needs: **seeing a possible cash shortage early and helping the business take relevant action**, such as following up on an unpaid customer invoice.

Cash timing is the main business problem. Disconnected records and repeated coordination are contributing workflow problems, not an assumption that poor administration causes every late payment. Customers may also have their own funding constraints, disputes, or approval delays.

## 3. Target market and users

Initial market: small Philippine B2B suppliers and service businesses that allow payment after delivery or completion, have recurring payroll or supplier obligations, and coordinate collections through spreadsheets and customer messages. Examples include office-supply businesses, printing/fabrication services, and business maintenance providers. Construction is a possible example, not an exclusive sector.

| User | Main responsibility | Desired outcome |
| --- | --- | --- |
| Finance/admin staff or bookkeeper — primary user | Maintain invoices, receipts, expenses, commitments, and follow-ups | Record a customer update once and see its effect without repeating work across disconnected records |
| Owner or manager — reviewer and potential buyer | Review cash gaps, approve communications, and decide the response | Understand what is due, what cash is expected, and what remains uncertain |
| Owner-operator | Perform both roles | Complete the same workflow without needing another employee |

Customers are external contacts, not application users in this MVP. There is no customer portal or requirement for customers to install software.

## 4. Goals, evidence, and differentiation

### Product goals

1. Show the earliest projected shortage, its amount, and the records contributing to it.
2. Connect a confirmed customer payment update to the cash plan and next follow-up.
3. Keep actual cash, outstanding invoices, and expected receipts consistent after partial or full payments.
4. Support owner-reviewed scenarios while preserving real records and contractual due dates.
5. Make AI and low-code automation useful parts of a functioning workflow while preserving manual operation.
6. Reduce repeated encoding by receiving supported files, source updates, messages, and images through one traceable review process. Measure preparation, review and correction effort as well as entry time.

### What is supported and what remains a hypothesis

The [CRIF Philippines Payment Study 2026 summary](https://www.crifasia.com/research/philippines-payment-study-2026/) documents late-payment patterns in a Philippine trade-payment dataset. It supports investigating a local payment-timing problem; the full report, target-segment prevalence, and demand for this product have not been established. Bryan's teacher's construction-company example is secondhand qualitative context.

Existing products already provide substantial overlap. [Chaser](https://help.chaserhq.com/debtor-relationship-management-dashboard) documents payment promises and collection priorities; [Agicap](https://agicap.com/en-us/products/account-receivable/) connects receivables to cash forecasts; [Kolleno](https://help.kolleno.com/en/articles/16800530-how-the-ai-task-manager-handles-promises-to-pay) describes AI-assisted promise tracking and follow-up tasks. AI, forecasts, reminders, and promises are therefore not claimed as exclusive capabilities.

**Differentiation hypothesis:** a small team can move from a customer message to a reviewed payment update, cash-impact explanation, and next action with less preparation and repeated entry than its current method. Measure the entire task, including data preparation and corrections. A successful demo does not prove faster customer payment, fewer late bills, or willingness to pay.

## 5. Chosen approach and scope decisions

The selected product combines **A: collections**, **B: cash forecasting**, and **a limited part of D: planning around obligations**. The limited planning function compares receipt timing and amounts; it does not execute payments or automatically defer obligations.

| Approach considered | Benefit | Tradeoff and decision |
| --- | --- | --- |
| Focused application using the existing Next.js project | Direct control over the selected task and a small interface | Requires our own tested money and workflow rules. Selected through the agreed product direction and technology stack. |
| Extend an existing invoicing application such as InvoiceShelf | Provides broad invoicing functionality | Different application stack, licensing obligations, version choices, and extra surface area. Retain as a reference rather than the MVP foundation. |
| Read supported external records | Could reduce repeated data entry | Approved for phased expansion through selected sources; each connector requires provider access, clear record matching and its own acceptance evidence. Payment execution remains excluded. |

The following details are **author-selected MVP defaults**, made to keep the document concrete. They were not separately specified by Bryan and remain reviewable:

- One business per account, Philippine pesos only, Asia/Manila dates, and English interface text. The fictional preconfigured business remains for demonstrations.
- Public sign-up creates a separate private business workspace with its registrant as owner. An owner may also perform the finance role and can invite finance teammates into that workspace. Multi-business switching remains excluded. For the development test, email confirmation is disabled; it must be reviewed before wider launch.
- Manual forms and fictional seed records remain available. Version 1.1 schedules reviewed CSV/XLSX imports and selected source connections as separate remaining slices.
- Reminders remain reviewed copyable drafts for manual sending through the business's existing channel. Approved message-intake connections are inbound only; automatic external sending remains excluded.
- One temporary what-if scenario at a time, changing one invoice's expected receipt date and/or amount.
- One Node-RED workflow for missed-commitment follow-ups. Node-RED runs separately from the Vercel application and may run on the demo laptop.
- n8n is approved as the planned integration layer for supported external intake. Decide its operating/licensing setup and relationship to Node-RED before installation or migration. Keep one scheduler responsible for each job; do not silently replace the working follow-up flow or run duplicate schedulers.

These choices define a hackathon MVP, not a production-ready accounting service.

## 6. MVP requirements

FR-01–FR-11 remain the P0 core. FR-12–FR-17 are approved expansion work, delivered in independently reviewed slices. A connector is supported only after its real access and acceptance checks pass. Adding this roadmap does not promise that every provider will be available within the original hackathon window or authorize dropping core correctness.

| ID | Requirement | Required behavior |
| --- | --- | --- |
| FR-01 | Business access | Authenticate public owners and invited finance staff with Supabase Auth. A new owner creates one private business workspace. Authorize every read and write by that business membership; finance staff cannot approve owner-only actions by changing a browser request. The existing demo roles remain for demonstrations. |
| FR-02 | Financial records | Enter customers, existing unpaid invoices, opening cash with its cutoff date, and upcoming expenses. Validate required fields, amounts, and dates. Show the source and last update of expected receipts. |
| FR-03 | Actual payments | Record manually verified customer receipts and expense payments, including partial amounts. Update remaining balances and available cash together. Prevent duplicate submissions and over-allocation. |
| FR-04 | Thirty-day forecast | Calculate daily projected closing balances, earliest shortage date, largest projected shortfall, and related receipts/obligations. Explain which assumptions and records are included. |
| FR-05 | Collection workspace | Show unpaid/due/overdue invoices, current commitments, and follow-up tasks. Keep original due dates, expected payment dates, and actual receipts distinct. Show invoices with no current expectation or next action. |
| FR-06 | Customer updates | Capture a pasted reply or manual note, propose a date/amount update, show its cash impact, and save only after staff confirmation. Retain the previous commitment in history. |
| FR-07 | Reminder review | Prepare an editable reminder using the outstanding amount. Record owner approval of the exact draft version. Allow copying of the approved text and optional reporting of manual sending. |
| FR-08 | What-if comparison | Show the baseline and an alternative receipt scenario side by side, including the change in the first shortage and its amount. Discarding the scenario leaves real records unchanged. |
| FR-09 | Focused AI assistant | Explain a selected forecast result using retrieved data; extract proposed details from replies and help draft reminders. Show supporting records, require confirmation, and offer manual fallback. |
| FR-10 | Low-code follow-up flow | Use a real Node-RED flow to find passed customer commitments without enough recorded receipts, create one follow-up task per unresolved commitment, and report run success/failure. |
| FR-11 | History and recovery | Preserve who changed a record, what changed, when, and why where a correction is involved. Failed saves leave existing records consistent and present a clear retry option. |
| FR-12 | Shared Review Inbox | Stage source data and proposed changes with provenance, record match, current/proposed values, review state and relevant cash impact. Staff can edit, reject or confirm a permitted proposal; unresolved matches and stale proposals cannot post. |
| FR-13 | Reviewed file import | Accept CSV and XLSX through separate delivered slices. Preview mappings and row errors; distinguish new, changed, unchanged and possible duplicate records. Preserve manual forms and route accepted rows through normal authorized commands. |
| FR-14 | Connected records through n8n | Read a selected Google Sheet first, then selected CSV/XLSX files in Google Drive/OneDrive. Detect changes using stable source IDs and programmed comparisons, with cursors, retry protection and visible connection/run status. Add a named accounting/POS adapter only after its actual API/export access is established. |
| FR-15 | Supported message intake | Receive authorized business-channel events, preserve the original message and propose a customer commitment, supplier-record review or payment-verification task. Evaluate Messenger Page, approved Viber bot/business, and business SMS channels separately. No claim of general personal-inbox/group-history access or automatic obligation deferral. |
| FR-16 | Reviewed receipt-image extraction | Provide drag-and-drop/file upload and a supported mobile capture option. Display the original image beside editable extracted fields. Unreadable/missing fields require correction or clarification; staff verifies actual movement before posting a receipt/payment. |
| FR-17 | Clear next-action worklist | Show actionable existing follow-ups and pending intake/reminder reviews with source record, responsible person, due date or an explicit missing-date state, and a link to the relevant action. Use programmed state/date rules; completion follows the actual saved workflow. |

### Permissions

Both roles can view the business's records, enter/update operational records, record verified receipts/payments, confirm customer commitments, and preview scenarios. The owner additionally approves reminder drafts, sets the initial opening-cash baseline, and voids incorrect posted cash movements with a reason. Actual receipts do not require a second owner approval: they require the recording staff member's confirmation that the money was checked through the business's normal process.

Before any cash movement has been posted, both roles may correct invoice/expense details. Once a movement has been posted, the counterparty, currency, and record identity are locked. Only the owner may correct the total or original due date, with a recorded reason; the total cannot fall below valid linked payments. These corrections refresh the forecast and invalidate affected reminder approvals. Finance staff may still update notes, expectations, commitments, and follow-ups. Reassigning a posted invoice to another customer is outside the MVP.

Owner approval of a reminder, staff confirmation of a customer's promise, and confirmation of actual receipt are separate actions. The UI must not describe one as evidence of the others.

### Reminder states and sending boundary

States are Draft, Awaiting review, Approved, and optionally Reported sent manually. Rejected drafts return to editing with a reason. Changing the text, recipient, invoice balance, or relevant commitment after approval invalidates that approval and requires review again. Approval must fail if the underlying record has changed since the reviewer opened it.

Copying does not mean delivery. "Reported sent manually" records the staff member, channel, and time they entered; it is not verified delivery or customer acknowledgement. The product never displays a provider-confirmed sent/delivered status in this MVP. A normal text template remains available when AI fails.

### Version 1.1 intake and connection boundaries

The common flow is **receive → validate and match → stage a proposal → human review → authorized command → refresh balances/forecast/history**. Manual forms remain a direct, AI-independent path. n8n moves supported information; it does not calculate authoritative balances or hold a Supabase service-role key to write financial tables directly.

- Owners configure/disconnect sources. Finance staff review and apply only operations their existing role permits. Grant the narrowest read access the provider supports and disclose the actual requested scope. Source authorization is not permission to scan every file or conversation.
- Start with one selected sheet/file/channel per connector. Preserve the provider/source ID, row/message/file identifier, source version or fingerprint, observed time and reviewer. Match by stable external/invoice IDs within the business, not row position or a customer's name alone.
- Programmed parsing, comparison, money/date validation and duplicate detection handle structured rows. AI may suggest column mappings or interpret unstructured content; neither its confidence score nor its prose authorizes a write.
- Stage new/changed records automatically; unchanged/replayed input must not create additional entries. Ambiguous matches, conflicting sources, already-posted records and possible duplicate receipts require explicit review. Missing/deleted source rows never silently delete or void PondoPath records.
- Show an existing value beside a proposed change. Recheck membership, permission and current revision when applying it. Preserve a stale draft and require renewed review. Retrying an applied item returns its result instead of creating another receipt. A batch shows per-item outcomes and can retry failed items without reposting successful ones.
- Imported promises are expectations. Imported or photographed claims of payment remain unverified proposals until staff checks the movement through the business's normal process. Preserve opening-cutoff, future-date, allocation, locked-baseline, owner-only correction and reminder-approval rules.
- Source state and PondoPath state are separate: reading an external file does not update that file, and an approved local correction is not written back. Show last successful read, last error, pending items and disconnected/expired-access states. Existing local records remain usable during outages.
- Messages/images and connection credentials require private storage, business-scoped access and a defined retention/deletion policy before real-data use. Keep content and credentials out of public URLs, exported workflows and logs. Use fictional data for trials; send only the selected content to an evaluated AI provider.
- Receipt extraction must preserve source evidence, leave unsupported fields empty, flag suspicious/duplicate input and offer manual entry when extraction fails. Check allowed type, size and image readability before processing. A clearer camera image reduces errors but cannot guarantee zero hallucinations or establish authenticity/bank settlement.

### Connection feasibility and delivery scope

| Source | Planned path | Access/acceptance boundary |
| --- | --- | --- |
| CSV/XLSX upload | Manual import into the Review Inbox | Mapping, row validation, stable IDs and repeat-import protection must work before applying changes. Legacy XLS, macro execution and arbitrary formats are not included. |
| Google Sheets | Scheduled read of a selected sheet through n8n | Use read-only access where feasible. The current native row-update trigger may require edit access; prefer scheduled read-and-compare rather than silently broadening permissions. |
| Google Drive / OneDrive | Read a selected CSV/XLSX file | These are file hosts, not invoice schemas. Reuse the file parser; verify each provider's scopes, file/version events and revocation behavior separately. |
| Messenger | Eligible conversations with an authorized Facebook Page | Requires the actual Page/app permissions and applicable review/access. Personal employee inboxes are not a promised source. |
| Viber | Approved bot/business-channel events | Verify commercial onboarding, account capabilities and costs. Do not promise reading existing personal/company group histories through a bot token. |
| SMS | Incoming messages through a supported business number/provider | Confirm inbound capability and regional availability. Existing handset SMS histories are not automatically accessible. |
| Accounting/POS | A named product's supported API or CSV/XLSX export | No universal accounting connector is claimed. Record the product, sample schema, IDs, access and terms before implementation; supported exports use the existing import route. |

Capability references checked on 29 October 2026: [n8n file extraction](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.extractfromfile/), [n8n Google Sheets trigger implementation](https://github.com/n8n-io/n8n/blob/master/packages/nodes-base/nodes/Google/Sheet/GoogleSheetsTrigger.node.ts), [Google read-access scopes](https://developers.google.com/workspace/sheets/api/scopes), [Viber bot API](https://developers.viber.com/docs/api/rest-bot-api/), [Meta Messenger API collection](https://www.postman.com/meta/messenger-platform-api/collection/iyp204x/messenger-platform-api), [Twilio incoming messages](https://www.twilio.com/docs/usage/webhooks/messaging-webhooks), and [OpenRouter image inputs](https://openrouter.ai/blog/tutorials/send-image-to-llm/). These describe possible interfaces, not completed account authorization or integration tests. Record unavailable access honestly; do not present simulated connectors as connected.

## 7. Explicitly out of scope

- Full accounting, tax calculation, payroll processing, inventory, bank reconciliation, lending, credit scoring, or payment execution.
- New compliant invoice issuance, EN 16931/Factur-X/ZUGFeRD exports, or claims of BIR certification. The MVP records existing invoices.
- Customer portals, unrestricted personal inbox/group-chat synchronization, PDF/OCR document pipelines beyond the approved receipt-image slice, and automatic external messages. Supported inbound business channels and receipt-image extraction are now covered by FR-15–FR-16.
- Multi-business SaaS onboarding, subscriptions, currencies, or exchange rates.
- Automatic allocation of one receipt across several invoices, overpayment credit, refunds, and recurring installment-plan generation.
- Predicting payment probability from customer history, training models, or running a local LLM.
- A general-purpose financial chatbot, autonomous record changes, or AI deciding which obligations to defer.
- Persistent scenario libraries and configurable approval chains. Reviewed CSV/XLSX import and n8n intake are now included in the approved expansion; additional automation platforms beyond Node-RED/n8n remain excluded.

## 8. Financial definitions and calculation rules

### Definitions

| Term | Meaning in this product |
| --- | --- |
| Invoice due date | Original contractual date recorded for the customer invoice |
| Expected receipt | A planning assumption about a future amount and date; not available money |
| Payment commitment | A customer-reported amount/date confirmed into the system by staff; still not received cash |
| Actual receipt/payment | A manually verified money movement recorded by an authorized user |
| Outstanding invoice | Invoice amount less valid linked actual receipts |
| Unpaid expense | Expense amount less valid linked actual expense payments |
| Shortfall | The amount by which projected closing cash falls below zero; not authorization for an overdraft |

### Money and date boundaries

- Store and calculate PHP amounts in integer centavos. Parse decimal input explicitly; reject invalid numbers, more than two decimal places, and unsafe totals. Opening cash is nonnegative; invoice, expense, and payment amounts are positive. The per-record limit is PHP 999,999,999.99; aggregate calculations must also remain within safe integer bounds.
- Due and expected dates are calendar dates in Asia/Manila. Audit timestamps are stored in UTC and displayed in local time.
- The live forecast covers today through today plus 29 days, inclusive. A fictional demo may use an explicitly labelled fixed reference date to reproduce the sample case. This is not historical accounting or an unlabelled live forecast.
- Daily closing balances do not establish that sufficient cash was available earlier within the same day.

### Opening cash and actual movements

Opening cash is the amount available at the **start of a specified date**, before any actual movements recorded for that date. Previously received money already included in that balance must not be imported again as a receipt. Invoices entered at setup represent amounts still unpaid at the cutoff; full historical accounting migration is excluded.

Available cash at the reference date equals the opening amount plus valid actual receipts minus valid actual expense payments from the cutoff through that date. Actual movements dated before the cutoff or in the future are rejected. The opening baseline becomes locked after the first actual movement; a later baseline reset is outside the MVP. Demo reset is permitted only for clearly fictional seed data.

An owner corrects an erroneous actual movement by voiding it with a reason and, if necessary, entering a replacement. The old record remains in history; cash and outstanding amounts are recomputed. Operational records linked to posted movements cannot be silently hard-deleted.

Voiding a customer receipt marks that invoice's active expectation as **Needs review** and excludes it from projected inflows until staff reconfirm the amount/date. Keep the latest customer statement and previous amounts in history; do not automatically raise an expectation or reactivate a superseded promise. For example, if a new 30,000 promise was recorded after a 20,000 receipt, voiding that receipt restores 50,000 outstanding but does not convert the new promise into 50,000. Staff can reconfirm 30,000, leaving 20,000 unplanned, or enter another supported expectation.

If the voided receipt had automatically resolved a follow-up, reopen that task with the correction reason. Otherwise, attach the correction to an existing open invoice follow-up or create one correction-review task keyed to the voided movement. A task previously completed by a person remains in history and is not silently reopened. Repeated void requests have no additional effect. Voiding an expense payment restores its unpaid outflow at the recorded due date, or under the due-now rule if overdue.

### Expected receipts and partial payments

Each invoice has at most one active expected receipt in the MVP. Its amount cannot exceed the outstanding balance. An initial due-date expectation must be labelled as an assumption; it is not a customer promise. A customer-confirmed commitment replaces that expectation without changing the original invoice due date or available cash.

If a commitment covers only part of the outstanding amount, the unplanned remainder stays visible and is excluded from the forecast. Staff can schedule that remainder after the current expectation is fulfilled or explicitly superseded; the MVP does not preserve two simultaneous receipt dates for one invoice. This produces a visible incomplete-data notice rather than an invented receipt date. Dates beyond the 30-day window remain recorded but do not add cash within it. A customer reply proposing multiple installments is retained as a note and requires staff to choose the one active expectation; AI must not collapse different dates into a single invented schedule.

An actual receipt links to exactly one invoice; an actual expense payment links to exactly one expense. Amounts cannot exceed the corresponding remaining balance. Recording a receipt reduces the outstanding invoice and its remaining active expectation together, bounded at zero; a full receipt removes that expectation from the forecast. Actual expense payments similarly replace the corresponding planned outflow. Neither event is counted twice.

Posting uses a unique request identifier so a retry cannot create a second movement. Reused payment references within the business must be caught, and same-record/same-date/same-amount submissions should prompt a possible-duplicate review; the app cannot conclusively detect a real-world duplicate entered with different details.

### Forecast formula and overdue items

For each day in the horizon:

**Projected closing cash = available cash at the reference date + remaining expected receipts through that day − remaining planned expenses through that day.**

Actual movements already included in available cash must not be added again. The forecast calculates assumptions, not predicted certainty. Show the earliest negative day and the largest negative amount even if the ending balance is positive. A zero balance means no remaining buffer; no configurable reserve model is required.

An expected receipt whose date has passed without sufficient recorded payment becomes stale. Exclude it from future cash, mark it for review, and do not silently move it to today. The admin can record an actual receipt or explicitly confirm a new expectation. A missing date or stale expectation must remain visible.

An overdue unpaid expense stays in the plan under a clearly labelled **due-now assumption on the reference date** until paid or corrected. Do not drop it when the horizon advances. Show last-record-update and incomplete-data notices; absence of a projected shortage must never imply that unentered expenses or unrecorded receipts have been checked.

### Scenarios and concurrent updates

A scenario temporarily overrides the date and/or amount of one expected receipt, bounded by the invoice's unpaid balance. It does not create an actual payment, alter a customer commitment, or edit an obligation's due date. Scenarios are not saved across sessions. A real update requires the normal reviewed workflow.

All balance-changing writes and their history are atomic. If another user changes the same record before confirmation, reject the stale confirmation and display the fresh values for review. Opening a preview is not approval of later unseen changes.

## 9. Core user journey

1. Sign in to your business workspace and review the cash cutoff, latest updates, and incomplete records.
2. Enter existing unpaid invoices and upcoming expenses, then view the 30-day cash plan.
3. Open an invoice linked to a possible shortage and prepare a reminder for owner review.
4. Copy the approved draft for manual sending. Record a reply or note when available.
5. Review proposed payment details and the before/after cash effect; confirm the update.
6. Record a follow-up owner and date. The business owner reviews the unresolved cash gap and may compare a scenario.
7. Record an actual receipt/payment only after verification. Review the updated balances and history.
8. If a commitment passes without enough recorded payment, check for an unrecorded receipt before another reminder.

The interface needs three main work areas: cash overview/forecast, customer invoices/collections, and upcoming expenses/payments. Contextual details, the AI assistant, approvals, and history belong within those tasks. Exact layout, component choices, and visual styling are left to the builder.

## 10. AI behavior and evaluation

The assistant has two bounded capabilities:

1. **Explain a selected result.** Read the relevant forecast output, invoice, expense, and assumptions through authorized application functions. Present a clear explanation in English, Tagalog, or Taglish, matching the user's language unless they request another, with links to those records. The application displays calculated amounts directly; the model must not supply authoritative arithmetic.
2. **Prepare a proposed update or draft.** Interpret a pasted customer reply in English, Tagalog, or Taglish into invoice reference, amount, date, and stated reason where present. Show the original source alongside the proposal, then use the normal validated confirmation path. Draft reminders using the current outstanding amount, selected tone, and requested language. Language detection must not invent missing dates or amounts; a statement such as "bayad na" still requires payment verification.

AI has no direct database access and no tools to post payments, change records, approve actions, or send messages. Its response is untrusted input: validate fields and re-fetch current records before confirmation. Customer text is data, never an instruction to override application rules. Ambiguous dates, conflicting amounts, or uncertain invoice matches require clarification. A customer statement such as "we paid yesterday" creates a verification prompt, not a cash receipt.

Use one OpenRouter model and provider endpoint that supports the required structured output/tool behavior. The exact model remains a builder selection after a small accuracy, latency, and cost check. Do not automatically route sensitive records to an unreviewed alternative provider. Send only the fields needed for the selected task, keep keys on the server, and disclose that AI processing is external. Use fictional data for the hackathon.

The current text assistant is separately evaluated. FR-16 adds a planned image-extraction task that requires an image-capable model/provider and its own document evaluation before use. Do not assume that the text evaluation establishes receipt accuracy. Structured spreadsheet comparisons remain programmed operations, and image/message proposals still use the same human review and financial command boundaries. Keep image usage bounded and record its contribution to the business's AI allowance and costs.

Apply a configurable daily request limit (initial demo default: 50 requests per business) and a 20-second request timeout. Display a recoverable failure and retain the user's draft; do not retry indefinitely. Manual entry, templates, calculations, and saved records work when AI is unavailable. Provider logging/privacy settings and the spending limit must be checked before using real business data.

Evaluate at least ten unambiguous sample replies and five ambiguous/adversarial replies, covering English, Tagalog, and Taglish and reporting outcomes by language. Proposed release targets are at least nine of ten correct unambiguous field extractions, explicit review for every ambiguous case, and zero unauthorized writes or invented values accepted automatically. Record model/provider, outcomes, and failures. These are acceptance targets, not results already achieved.

## 11. Technology and low-code workflow

| Layer | Selected technology | Responsibility |
| --- | --- | --- |
| Application | Next.js, React, TypeScript | Interface, authenticated server operations, business rules, and AI orchestration |
| Styling | Tailwind CSS | Responsive, accessible visual interface |
| Data and authentication | Supabase PostgreSQL and Auth | Durable records, relationships, sign-in, and access policies |
| AI provider access | OpenRouter | Evaluated text assistance; image extraction requires a separately evaluated image-capable model/provider in the approved expansion |
| Low-code automation | Node-RED | Scheduled missed-commitment detection and follow-up-task workflow |
| Source integration — planned | n8n | Read supported external sources and submit scoped intake items to the application Review Inbox; no direct financial writes |
| Web deployment | Vercel | Host the Next.js application and its server operations |

The repository uses Next.js 16.4.3, React 19.3.0, TypeScript 5, and Tailwind 4. Core Supabase/OpenRouter/Node-RED development integrations have recorded evidence; full verification and deployment remain outstanding. n8n and the version 1.1 intake connectors are not installed or verified. Read current integration guidance before each connector slice. No separate Python service or vector database is selected.

### Node-RED flow

Every 15 minutes, Node-RED calls a protected application endpoint for active customer-confirmed commitments dated before today with an unfulfilled amount. It filters actionable records, requests creation of a "check receipt and follow up" task, and reports the run result. It does not directly connect to the database or expose owner credentials.

The server validates each request against current state and enforces one automatic task per commitment/type. Retries or repeated scans cannot create duplicate tasks. Superseded/fully fulfilled commitments are skipped; associated open tasks are resolved accordingly. A task completed after a manual follow-up requires a recorded outcome and next action/date while the invoice remains unresolved. Completing a task does not mark the invoice paid. Repeat automation must not reopen a completed task for the same commitment.

The automation token is server-issued for this one business and these limited operations. Request-supplied business identifiers cannot broaden its access. Store the token securely in the Node-RED runtime, not in exported public flows or browser code.

Record last attempt, last successful run, and failure status. If no successful run occurs for more than 30 minutes, show that automation is not current and allow an authorized manual check through the same rules. A subsequent scan covers all unresolved past commitments, so downtime does not permanently skip them.

For the hackathon, Node-RED may run on the laptop and make outbound requests to the hosted app. It stops when the laptop sleeps or loses connectivity. Vercel is not being proposed as the Node-RED runtime. Continuous customer use needs a separately operated always-on runtime; its host and cost are a later launch decision.

## 12. Data, security, and usability requirements

Conceptual records are: business/cash baseline, user membership/role, customer, invoice, expense, actual cash movement, active expectation/commitment with history, follow-up task, reminder version/approval, and audit event. These are data responsibilities, not a requirement for that exact number of tables. The builder chooses the smallest schema that preserves the stated relationships and atomic updates.

- Protect every server operation and exposed database table with business membership and role checks. Enable appropriate Supabase row-level policies; authentication alone does not authorize arbitrary rows. Financial records and customer details are never publicly readable.
- Never put Supabase privileged keys, OpenRouter keys, or automation tokens in browser code. Limit logs to useful diagnostics without full customer messages or secrets. Role membership is controlled by the application administrator, not user-editable profile data.
- Use labelled forms, keyboard-accessible controls, visible focus, readable contrast, and text labels in addition to colour. Explain terms such as "expected receipt" and "shortfall" where needed. Preserve entered data on recoverable errors.
- Show loading, empty, error, stale-data, and AI-unavailable states. Display PHP amounts consistently and distinguish paid, partially paid, overdue, promised, and uncertain records.
- Target normal record operations within two seconds and forecast refresh within one second of computation on a demo dataset of up to 1,000 invoices/expenses; measure end-to-end conditions and document network effects. These are performance targets, not guarantees.
- Verify persistence after refresh and re-login. Validate backup/export and restore procedures before any real-data pilot; a demo using only fictional data does not establish production recovery readiness.

## 13. Acceptance criteria and demonstration

Use the [sample business walkthrough](../../c01-sample-business-walkthrough.md) as the numerical reference. The starting case has PHP 40,000 available, PHP 50,000 expected before Friday, and PHP 80,000 of Friday obligations. Alternative cases are independent, not cumulative events.

| ID | Acceptance criterion |
| --- | --- |
| AC-01 | Unauthorized visitors cannot view records; finance users cannot approve reminders or void posted movements; requests for unrelated business records fail. |
| AC-02 | The initial case shows PHP 10,000 projected Friday cash. Moving the full receipt to Monday shows a PHP 40,000 Friday shortfall even though the later balance becomes positive. |
| AC-03 | Recording a verified PHP 20,000 receipt yields PHP 60,000 available cash, PHP 30,000 outstanding, at most PHP 30,000 still expected, and a PHP 20,000 Friday shortfall when that remainder is expected Monday. |
| AC-04 | Retrying the same receipt request creates no second cash movement. Overpayments and invalid/future actual dates are rejected. A full receipt removes the remaining expected inflow. |
| AC-05 | Recording a partial or full expense payment reduces available cash and the planned unpaid expense together. Its outflow is not counted again; a failed write leaves both unchanged. |
| AC-06 | A stale expected receipt is not rolled into today's inflow. An overdue unpaid expense remains visible under the due-now assumption. Missing expectations produce a visible incomplete-data notice. |
| AC-07 | A scenario changes projected results only. Discarding it preserves all actual records, commitments, and original due dates. |
| AC-08 | A proposed AI update displays source text and cash impact. Confirmation is required; stale/conflicting/ambiguous data cannot silently post. A claimed payment is not recorded as cash. |
| AC-09 | AI explanations use the forecast's actual outputs and supporting record references. Manual operations still work during AI errors or timeout; the small evaluation meets section 10's targets. |
| AC-10 | Only the owner can approve a reminder version. Editing approved content or changing relevant invoice data requires renewed approval. Copying/manual sending is labelled accurately. |
| AC-11 | A real Node-RED run creates the expected follow-up, repeated runs do not duplicate it, and downtime/catch-up status is visible. Manual checking uses the same duplicate-safe server rules. |
| AC-12 | Voiding the 20,000 sample receipt restores 40,000 available cash and 50,000 outstanding, marks the current expectation for review, and exposes the correction follow-up without duplicate tasks. It does not revive an old promise. Post-payment total/date corrections enforce owner permission and cannot reduce a total below valid payments. Reload/re-login preserves data; conflicting simultaneous updates require renewed review. |
| AC-13 | The main task can be completed with keyboard navigation; labels, focus, error states, and small-screen access are usable. |
| AC-14 | Receiving a file, message or image creates a business-scoped review item without changing posted cash. Original source and current/proposed values are visible. Other-business, stale and unauthorized applications fail. |
| AC-15 | Import a file with one new invoice, one changed invoice, one unchanged row and one invalid row. Show each outcome; repeat import/apply creates no duplicate. Conflicting matches, overlapping sources and missing/deleted rows never silently overwrite or delete records. |
| AC-16 | A real n8n read of a selected source stages its supported changes. An unchanged/repeated run adds nothing; failed/expired access is visible and recoverable. Source deletion does not delete financial records. No source write-back or privileged financial-table access occurs. Each advertised provider has its own real evidence. |
| AC-17 | A real supported messaging event produces a source-linked proposed commitment or verification task. Replayed events are duplicate-safe; uncertain sender/invoice/date/amount and “paid” claims remain held for review. Unsupported channels are labelled unavailable. |
| AC-18 | A clear receipt image produces editable fields with source evidence; blurred/cropped/missing/conflicting fields require clarification. A re-upload/possible duplicate is flagged, and no actual payment posts before staff verification. Evaluate representative clear and difficult fictional images; publish observed field accuracy and correction effort rather than claiming perfect OCR. |
| AC-19 | The next-action worklist routes missed commitments, missing expectations, pending owner reminder reviews and pending intake reviews to the appropriate source action. Permissions and completion state match the underlying records, including empty and stale states. |
| AC-20 | With AI or n8n unavailable, manual records, calculations, reminder templates and existing history still work. Resuming a connector retries safely; partially applied batches never reapply successful financial writes. |

The demo must show a working application, real saved changes, one real low-code workflow, and a real AI request using fictional data. Recorded or simulated sending must be explicitly labelled. Successful arithmetic or a staged video alone is not completion of the integrated MVP.

## 14. Success measures and validation

| Dimension | Measurement | Proposed target / interpretation |
| --- | --- | --- |
| Financial correctness | All defined calculation and record-consistency cases | 100% of critical acceptance cases pass before demonstration |
| Complete workflow | Invoice update through forecast, review, and next action | One end-to-end case with persistent records and no repeated manual re-entry of the same confirmed update |
| Follow-up reliability | Repeat scans, retries, and downtime recovery | No duplicate automatic task for the same commitment; visible stale automation |
| User comprehension | Reviewer identifies the Friday gap and distinguishes promises from actual receipts | Correct explanation without facilitator correction on the sample task |
| Practical effort | Setup, entry, review, corrections, and repeat-task time against the user's current method | Directional target: lower total effort without more errors; no numerical saving is claimed before measurement |
| Commercial value | Concrete pilot requirements and later priced offer | Record evidence of purchasing intent; feature interest and mentor approval are not purchase commitments |

A short walkthrough with a reachable finance/admin worker is useful but a broad survey is not a prerequisite to building the demo. If no reviewer is available, label user validation as not performed. Do not substitute the builder's own completion time for independent customer evidence.

## 15. Sustainability, practicality, and feasibility

| Characteristic | Product rationale | What must be checked |
| --- | --- | --- |
| Sustainability | Collection updates and upcoming obligations are recurring tasks. Bounded AI, reusable records, shared intake and explicitly owned automation jobs aim to keep operation and support manageable. | Measure ongoing usefulness, support effort, hosting/runtime expense, connector maintenance and AI usage. A subscription or service price is a later hypothesis. Environmental benefits are not claimed. |
| Practicality | Uses familiar invoices, payment updates, and expense records. Staff review changes; owners retain decisions. Manual entry and existing communication channels avoid requiring customer adoption. | Observe real entry/update habits, preparation time, missing data, and whether a spreadsheet already handles the task adequately. Repeated data maintenance may outweigh the benefit. |
| Feasibility | Retain one business per account, one currency and one scenario. Deliver imports, source adapters and image extraction separately through shared review, using programmed rules for structured data. | Prove each supported connection and extraction path, monetary correctness, access control, runtime costs and manual fallback. Provider availability and approvals can block a connector independently; expansion is not assumed to fit the original schedule. |

Operating-cost review must include application hosting, database/auth and private-file storage, Node-RED/n8n hosting and licensing, connector onboarding/messaging fees, AI text/image usage, and maintenance/support time. Measure intake, review and correction effort. Check n8n's applicable terms before embedding customer-owned connections in a paid product. Use current provider terms; no promise of permanently free operation is made. Paid services or plan upgrades require a separate budget decision before purchase.

## 16. Hackathon rubric alignment

| Criterion from the supplied judging slide | Weight | Evidence to demonstrate |
| --- | ---: | --- |
| Business Impact & Problem Fit | 30% | Clear cash-timing problem, target user, documented problem signals, and a transparent plan for measuring task effort |
| Technical Execution | 30% | Persistent records, correct calculations, enforced review, functioning AI integration, and a real Node-RED flow |
| Solution Quality & Innovation | 25% | A coherent message-to-cash-plan task, useful low-code automation, restrained AI, and a defensible explanation of customer fit |
| User Experience & Usability | 15% | Understandable amounts/dates, visible assumptions, accessible actions, and clear review/error states |

These weights are provided by the user. The slide repeats impact wording under UX, so its detailed UX wording remains unconfirmed. This mapping is not a predicted score or guarantee of passing. Finance & Operations remains the primary entry category; covering all five categories is not an MVP objective.

## 17. Delivery targets, risks, and remaining decisions

These are product checkpoints for the two-week target, not a code-level implementation plan.

**29 October scope update:** the original dates below remain historical targets, not a restarted countdown. Tasks 13–21 in the implementation plan now track the approved expansion. Deliver one reviewed slice at a time; account approvals and provider feasibility can block individual connectors. Task 11 is partially verified and paused at Bryan's request, and Task 12/demo/deployment work must wait until he resumes it. This document update authorizes no installation, connection, purchase, real-data intake or deployment.

| Period | Demonstrable checkpoint |
| --- | --- |
| Days 1–2 | Confirm data/role defaults, service access, and money-case expectations; establish persistent sample records |
| Days 3–5 | Record invoices, expenses, actual movements, and a correct 30-day forecast |
| Days 6–8 | Complete commitments, owner-reviewed reminder drafts, scenarios, and history |
| Days 9–10 | Demonstrate the bounded AI tasks and duplicate-safe Node-RED flow |
| Days 11–12 | Verify permissions, error/retry paths, calculation cases, and reviewer feedback if available |
| Days 13–14 | Resolve critical failures, rehearse the integrated demo, and prepare the evidence-backed pitch |

| Risk / dependency | Response |
| --- | --- |
| Incomplete or stale records produce misleading forecasts | Show source, cutoff, update times and unresolved records; treat the forecast as conditional on entered data |
| Excessive data entry or strong existing alternatives | Compare total task effort early; narrow or reconsider the value claim if the workflow adds work |
| AI errors, latency or cost | Bounded context, field validation, human confirmation, request caps, and manual fallback |
| Automation laptop sleeps or loses internet | Visible last successful run, manual check, and catch-up scanning; separate always-on hosting before live use |
| Scope expands into accounting or payment infrastructure | Keep section 7 exclusions; do not sacrifice P0 correctness for additional features |
| Open-source code is incompatible or has obligations | Inspect exact versions and licenses before copying, retain notices, and check organizer reuse rules; use concepts as references when integration is heavier |
| No customer feedback or buying evidence by demo day | Label limitations explicitly; demonstrate product behavior without inventing commercial outcomes |

Before implementation, review the author-selected defaults in section 5. The builder may choose the exact schema, components, test tooling, and a supported OpenRouter model within these requirements. Exact AI provider/model settings and service-plan costs must be recorded before enabling the integrations. A real-data pilot additionally requires operational ownership, data handling, backup/restore, and deployment readiness review. These open deployment details do not change the selected business problem.

The final product review should confirm this scope before a separate implementation plan is written. Preparing this PRD does not approve deployment, service purchases, live customer messaging, or collection of real customer financial data.

### Version history

- **1.0 — 26 October 2026:** core collections, forecast, reviewed reminders, AI assistance and Node-RED MVP.
- **1.1 — 29 October 2026:** records the previously approved private invitations and the newly approved shared intake, CSV/XLSX, n8n source connections, supported business messages, receipt images and clearer next actions. Retains human financial review, manual fallback, one-business scope and explicit provider gates. Expansion delivery is pending.
- **1.2 — 30 October 2026:** Bryan superseded the invite-only registration default. Public sign-up now creates one private business per new owner account; the Team invitation flow remains for finance staff. Email confirmation is disabled only for development testing and requires review before wider use.

## 18. Supporting documents

- [C01 verification ledger](../../c01-verification-ledger.md): problem evidence, competitor limits, and validation assumptions.
- [C01 open-source audit](../../c01-open-source-audit.md): inspected repositories, licenses, dependencies, and proposed reuse boundaries.
- [Sample business walkthrough](../../c01-sample-business-walkthrough.md): fictional records, messages, calculations, and reviewer exercise.

This is the single current PRD. Earlier draft specifications were removed during workspace cleanup; the supporting research remains separate from product requirements.
