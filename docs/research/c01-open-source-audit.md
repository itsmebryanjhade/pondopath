# C01 open-source source-code reuse audit

Date: October 26, 2026 (Philippines)

Scope: read repository metadata, selected licenses, relevant implementation files and one dedicated forecast unit-test file. This is static research. No project was cloned, installed, executed or merged, and no third-party test suite was run. Public code is evidence of implementation, not customer demand or verified accuracy.

## 1. Actual Budget — strongest forecast source to study

Repository: [actualbudget/actual](https://github.com/actualbudget/actual). Snapshot inspected: `d0dd62899c043e03cb677943f3e8f2abea6708ff`. [MIT license at that snapshot](https://github.com/actualbudget/actual/blob/d0dd62899c043e03cb677943f3e8f2abea6708ff/LICENSE.txt).

Specific inspected files:

- [forecast-projection.ts](https://github.com/actualbudget/actual/blob/d0dd62899c043e03cb677943f3e8f2abea6708ff/packages/loot-core/src/server/forecast/forecast-projection.ts): date context, posted/scheduled amount grouping, per-day running balances and the lowest combined balance.
- [forecast-projection.test.ts](https://github.com/actualbudget/actual/blob/d0dd62899c043e03cb677943f3e8f2abea6708ff/packages/loot-core/src/server/forecast/forecast-projection.test.ts): the inspected file contains one test combining posted and scheduled deltas, expecting balances 110, 70 and 70. Presence of a test is not evidence that it passed in this session or that all edge cases are covered.
- [forecast-filters.ts](https://github.com/actualbudget/actual/blob/d0dd62899c043e03cb677943f3e8f2abea6708ff/packages/loot-core/src/server/forecast/forecast-filters.ts): the opening portion confirms query/rule/type dependencies behind filtering.
- [Balance Forecast report documentation](https://github.com/actualbudget/actual/blob/d0dd62899c043e03cb677943f3e8f2abea6708ff/packages/docs/docs/experimental/balance-forecast-report.md): identifies the feature as experimental and describes posted transactions plus simulated schedules and their assumptions.

What could be adapted: the small projection pattern and its separation of scheduled changes from posted transactions, the lowest-balance output, and focused test scenarios. Retain applicable notices when copying covered code.

What prevents direct pasting: Actual model types, internal path aliases, date utilities, filters, schedule objects and ledger conventions. The projection reconstructs a starting balance from transactions before the selected start date; it does not simply take our user-entered cash balance as its main starting input. An adaptation needs an explicit opening-balance representation and date/amount contracts. Inspecting the filter dependency shows that lifting the whole module can pull in the application's query and transaction-rule machinery.

Recommendation: use as a reference and a candidate for selective adaptation. For a small one-currency 30-day calculation, writing a smaller tested function in our own domain may be less work than carrying Actual's abstractions. Do not fork the whole personal-finance application for C01. The prototype still needs payment-blocker/commitment case logic.

## 2. Node-RED — genuine open-source low-code automation option

Repository: [node-red/node-red](https://github.com/node-red/node-red). [Apache-2.0 license](https://github.com/node-red/node-red/blob/main/LICENSE) inspected. Its [official description](https://nodered.org/about/) documents a browser-based flow editor and Node.js runtime; the [interval trigger recipe](https://cookbook.nodered.org/basic/trigger-at-interval) documents periodic triggers.

Possible use: a limited flow that checks due follow-ups and triggers recalculation or creates an internal task after an approved status update. It supplies orchestration, not a financial model, document-blocker rules, a database-backed case product or reliable user communication by itself. Those contracts and failure handling still need implementation.

Recommendation: consider as a separately running automation tool if selected for the hackathon's low-code requirement. Do not copy the editor/runtime into our Next.js application. Choose one automation approach rather than adding both Node-RED and n8n. Node-RED itself is Apache-licensed; each third-party node or shared flow needs its own review. No specific node set or production deployment has been selected.

## 3. InvoicePlane — business-record reference; PHP coupling

Repository: [InvoicePlane/InvoicePlane](https://github.com/InvoicePlane/InvoicePlane). Snapshot of implementation inspected: `f666d6dc973e686a304ce77931db42456b442f37`.

[Mdl_payments.php](https://github.com/InvoicePlane/InvoicePlane/blob/f666d6dc973e686a304ce77931db42456b442f37/application/modules/payments/models/Mdl_payments.php) was reviewed in part. It defines invoice/payment relationships, required payment fields, validation against an outstanding balance and additional payment-recording code. It depends on CodeIgniter's model, database, input and helper layers. Reading it is not a security or correctness audit of that application.

[composer.json](https://github.com/InvoicePlane/InvoicePlane/blob/develop/composer.json) identifies MIT and PHP dependencies. The actual [LICENSE.txt](https://github.com/InvoicePlane/InvoicePlane/blob/develop/LICENSE.txt) contains the application's MIT-style grant plus separate trademark and CodeIgniter terms. GitHub metadata returns `NOASSERTION` for the combined license file; do not replace reading the file with an assumed simple repository badge.

What could help: model the distinction between an invoice's amount, recorded payments and remaining balance, plus forms and workflow interactions. InvoicePlane is an invoice-management application, not proof of a complete future cash-planning and payment-blocker product.

Recommendation: reference the business concepts and assess particular files only if there is a clear benefit. PHP/CodeIgniter code is not a drop-in module for the current TypeScript/Next.js project. Do not transplant gateway, tax or money handling wholesale. Check the exact chosen snapshot and relevant notices before copying any file; the initial license/composer reads used the default branch.

## 4. Midday — relevant Next.js/TypeScript reference, AGPL licensing

Repository: [midday-ai/midday](https://github.com/midday-ai/midday). Snapshot inspected: `51587319f26a0ffaa9dfccab1920373cb65689b7`. [AGPL-3.0 license](https://github.com/midday-ai/midday/blob/51587319f26a0ffaa9dfccab1920373cb65689b7/LICENSE) inspected, including its remote-network source-offer provision for modified covered programs. This is not an MIT-style permissive copying choice; resolve applicable licensing before incorporating covered source.

Files inspected:

- [revenue-forecast-chart.tsx](https://github.com/midday-ai/midday/blob/51587319f26a0ffaa9dfccab1920373cb65689b7/apps/dashboard/src/components/charts/revenue-forecast-chart.tsx), opening portion: separate actual and forecast display, revenue breakdown data, chart-library and project utility dependencies.
- [reports.ts](https://github.com/midday-ai/midday/blob/51587319f26a0ffaa9dfccab1920373cb65689b7/packages/db/src/queries/reports.ts), imports and the opening portion of `getRevenueForecast`: a monthly revenue projection pulling several sources through database queries, team/currency context, recurring invoice/transaction calculations and collection metrics. The full forecast function and its helpers were not audited.
- [Revenue Forecast documentation](https://github.com/midday-ai/midday/blob/51587319f26a0ffaa9dfccab1920373cb65689b7/apps/website/src/app/docs/content/revenue-forecast.mdx): describes known revenue sources, actual/forecast display, assumptions and double-counting warnings. Product documentation's accuracy and confidence claims have not been independently validated here.

Recommendation: study interactions and data distinctions. Its monthly revenue forecast is not the same as a daily cash balance including payroll and supplier outflows. Source reuse brings AGPL obligations and database/schema dependencies; do not assume a chart is a self-contained permissive component or that its confidence percentages are calibrated for our data.

## 5. Small MIT prototype checked and deprioritized

[initPM/cash-flow-forecasting](https://github.com/initPM/cash-flow-forecasting) has an [MIT license](https://github.com/initPM/cash-flow-forecasting/blob/main/LICENSE). Its README describes a React/Vite simulation with synthetic transactions, a hardcoded opening balance and simplified recurrence; persistence and user transaction editing are future work. It also contains setup text pointing to a different repository. These are reasons for caution, not proof of malicious code.

The implementation and tests were not reviewed. Use it, at most, for a visual/scenario reference after further inspection. Do not present its screenshot or README as a tested financial engine, a production product or customer validation.

## 6. InvoiceShelf — relevant workflow reference, not a drop-in assistant

Added October 26, 2026 after Bryan supplied the repository and feature screenshots. This remains source research and a feature proposal, not a final PRD or authorization to merge code.

Repository: [InvoiceShelf/InvoiceShelf](https://github.com/InvoiceShelf/InvoiceShelf). Snapshot inspected: `4eb39e671a2646cd9e308baf4d2a7df4e5fd0544`, default branch `3.x`.

- [README](https://github.com/InvoiceShelf/InvoiceShelf/blob/4eb39e671a2646cd9e308baf4d2a7df4e5fd0544/README.md) explicitly labels 3.x an alpha preview for testing, not production data, and directs production users to 2.x. The website lists stable 2.4.7 as released October 21, 2026. Do not assume every advertised 3.x feature is included in the stable release.
- [composer.json](https://github.com/InvoiceShelf/InvoiceShelf/blob/4eb39e671a2646cd9e308baf4d2a7df4e5fd0544/composer.json) and package.json identify PHP/Laravel and Vue. The current SoloForge starter uses Next.js/React/TypeScript. Adapting workflow ideas is different from pasting these application modules into our codebase.
- [LICENSE](https://github.com/InvoiceShelf/InvoiceShelf/blob/4eb39e671a2646cd9e308baf4d2a7df4e5fd0544/LICENSE) is AGPL-3.0, with composer declaring AGPL-3.0-only. Section 13 describes a corresponding-source offer for remote users of a modified covered program. This is not permissive MIT copying; the scope of a combined implementation needs review before reuse.
- The [AI product page](https://invoiceshelf.com/ai) describes read-only data tools and in-editor drafting using the operator's OpenRouter key. It says requests go from the instance to the model provider. Self-hosting the application does not mean this AI runs offline or that model usage is free. Its "no hallucinated numbers" marketing statement was not independently verified.
- [resources/ai/prompts/chat-system.md](https://github.com/InvoiceShelf/InvoiceShelf/blob/4eb39e671a2646cd9e308baf4d2a7df4e5fd0544/resources/ai/prompts/chat-system.md) was read as source data. It asks the model to use tools for real records, remain read-only and acknowledge missing results. A prompt does not establish enforced authorization or accuracy. No complete assistant package was extracted, executed or assessed as a reusable standalone component.
- [PaymentService.php](https://github.com/InvoiceShelf/InvoiceShelf/blob/4eb39e671a2646cd9e308baf4d2a7df4e5fd0544/app/Domains/Receivables/Application/PaymentService.php), lines 1–150, shows payment creation and allocation inside a database transaction, and a payment event after commit. It depends on Laravel, InvoiceShelf models, allocation logic, numbering, currency and mail services. The allocation helper and payment test suite were not audited.

Useful ideas: answers grounded in saved records, approved drafts, invoice/payment separation, remaining balances and a visible history of changes. These support the existing C01 task; they are not unique market capabilities.

### E-invoicing applicability

The README describes a separate [official E-Invoicing module](https://github.com/InvoiceShelf/module-e-invoicing) for EN 16931 XML embedded in a ZUGFeRD/Factur-X PDF, requiring Gotenberg. The module's root inventory was inspected, but its implementation and license were not audited. UBL and Peppol sending are described as planned in the core README.

[European Commission information](https://ec.europa.eu/digital-building-blocks/sites/spaces/DIGITAL/pages/467108661/European%2BStandard%2Band%2BSpecifications) identifies EN 16931 as a European e-invoicing standard. [BIR RR 11-2025](https://bir-cdn.bir.gov.ph/BIR/pdf/RR%20No.%2011-2025.pdf) describes separate Philippine invoice-system, structured-data and reporting requirements. This limited check does not establish current applicability to a particular business or certify Philippine compliance. No compliance deadline is adopted here.

Recommendation: defer compliant invoice issuance. Our first workflow can record existing invoices and commitments; adding a European invoice format does not directly resolve the selected payment-timing and coordination problem. Revisit only for a demonstrated buyer requirement.

## 7. Crater — distinguish the open-source application from the current platform

[crater-invoice-inc/crater](https://github.com/crater-invoice-inc/crater) is a Laravel/Vue invoicing application. Its [readme.md](https://github.com/crater-invoice-inc/crater/blob/master/readme.md) and [LICENSE](https://github.com/crater-invoice-inc/crater/blob/master/LICENSE) were read on the default master branch: AGPL-3.0, with payment, expense and invoice concepts. Metadata showed the repository was not archived and its latest push was August 10, 2024. That timestamp is a maintenance signal, not a security verdict. No implementation or tests were executed.

[crater.financial](https://crater.financial/) now advertises embedded AR/AP, Financial Copilot, payments, accounting and lending. Its [API documentation](https://docs.crater.financial/) requires contacting the provider for sandbox keys and later live keys. The platform's advertised capabilities must not be assumed to be included in the old open-source repository. Philippine availability, price and access were not established.

Recommendation: use the record and workflow concepts as references. Do not make the two-week MVP depend on provider onboarding, payment processing or lending. A generic financial chatbot would also overlap Crater's advertised positioning.

## 8. firmai/python-business-analytics — learning material, not a ready cash-flow engine

[Repository](https://github.com/firmai/python-business-analytics), tree snapshot `7897af0aa0f40257c4184e0f203279425c3027dd`. The README and complete, untruncated file-tree inventory were inspected. It is an educational collection linking business analytics projects and datasets, including customer segmentation, demand forecasting, loan classification and bankruptcy prediction. The tree includes an example notebook and data; linked external notebooks were not inspected.

No LICENSE, COPYING or NOTICE file was found in the repository tree, and the README contained no license statement. Do not treat public visibility as permission to copy code or datasets; externally linked materials also need their own license review.

Recommendation: learning reference only for now. An explainable cash projection from explicit dates does not require adopting a Python prediction pipeline. Predicting customer payment behaviour would require suitable historical data and evaluation, neither of which has been established for our demo.

## Feature proposal from these references — not a PRD

Keep the agreed A + B + limited D workflow: collections, a 30-day cash plan and owner-reviewed scenarios. Add one focused assistant with two initial jobs:

1. Explain a selected cash shortage using values returned by the programmed forecast and link to the underlying invoice and expenses. Show assumptions and missing information; do not ask the language model to invent balances or payment probabilities.
2. Turn a pasted customer reply into a proposed amount/date update and a reminder draft. Show the original text and the cash impact before saving. Human confirmation triggers the same validated rules as manual entry. Messages are reviewed before any authorized send.

Retain the existing partial-payment and change-history work rather than introducing a separate full invoicing product. Customer claims of payment remain unverified until checked against an actual receipt. The core continues to work when AI is unavailable.

Implementation alternatives for a later decision: (a) keep our current app and selectively use suitable libraries and ideas, recommended for the focused demo; (b) extend InvoiceShelf, gaining invoicing breadth but taking on a different stack, AGPL obligations and version choices; (c) integrate a separate invoicing platform later, after access, synchronization and actual customer need are established. No approach beyond research has been implemented.

Testable value proposition: fewer repeated updates from customer message to follow-up and cash-impact review. Existing products already have assistants and collections features, so this is a customer-fit hypothesis, not a verified market-wide gap. No repository is selected for wholesale merging.

## Maintenance snapshot and limits

Metadata checked: all five repositories were unarchived. Last pushed dates were October 26 for Actual Budget, InvoicePlane and Node-RED; June 13 for Midday; September 24 for the small prototype. A recent push is not proof of maintenance quality, security, a stable release or support. Default-branch features may be unreleased; Actual explicitly labels its forecast experimental.

## Shared libraries previously checked

The useful components from the superseded C07 shortlist are retained here. Their license texts were checked during the earlier research; no package has been installed or integrated.

| Component | Potential use | License previously checked |
| --- | --- | --- |
| [Papa Parse](https://www.papaparse.com/docs) | CSV parsing/export if that format is included; its escapeFormulae option can protect exported text from spreadsheet formulas | [MIT](https://github.com/mholt/PapaParse/blob/master/LICENSE) |
| [ExcelJS](https://github.com/exceljs/exceljs) | Alternative if XLSX support is required | [MIT](https://github.com/exceljs/exceljs/blob/master/LICENSE) |
| [Zod](https://github.com/colinhacks/zod) | Validate request, import and AI extraction structures | [MIT](https://github.com/colinhacks/zod/blob/main/LICENSE) |
| [TanStack Table](https://github.com/TanStack/table) | Optional sorting/filtering support if a regular table is insufficient | [MIT](https://github.com/TanStack/table/blob/main/LICENSE) |

Choose one spreadsheet parser for the agreed formats. Schema validation does not replace remaining-balance limits, duplicate handling or verified forecast assumptions. For the one-currency PHP demo, checked integer centavos and explicit decimal-string parsing avoid rounding ambiguity. Retain applicable notices and inspect exact versions before reuse. Current package compatibility has not been tested.

The earlier n8n research remains relevant only as an alternative: its [repository license](https://github.com/n8n-io/n8n/blob/master/LICENSE.md) uses the Sustainable Use License with separate enterprise-file terms. Its [use-case guidance](https://support.n8n.io/article/can-i-use-your-license-for-my-use-case) distinguishes configured workflows from offering an automation service to outside users. Third-party workflow templates need their own source/license review. Node-RED is the latest proposed low-code option; neither has been installed.

**Update, 6 November 2026:** both automation tools are now in use with separate jobs: Node-RED runs the missed-commitment follow-ups, and n8n 2.46.6 runs the optional operator route for Google Sheet intake (own development and fictional-data demo, within its Sustainable Use License). The parsing libraries in use are Zod, csv-parse and read-excel-file (not Papa Parse or ExcelJS); TanStack Table is still not needed. In-app sign-in connectors are planned instead of more automation platforms; see [connector landscape research](connector-landscape-2026-11.md).

## Proposed reuse strategy for C01

1. Keep the existing Next.js project rather than merging unrelated application repositories.
2. Pick a file parser and input schema approach only for agreed formats and requirements.
3. Assess Actual's projection pattern against a smaller domain-specific implementation; port only useful parts and test date boundaries, centavo precision, actual/expected separation and double counting.
4. Use one low-code tool for a genuinely working follow-up/recalculation flow if that is part of the approved design.
5. Implement the chosen case process using our own explicit states and validation. Keep the core independent of AI; use AI to explain calculated results and propose reviewed updates from pasted customer replies.

Before copying: choose an exact version/commit, inspect the relevant file/dependency licenses, retain required notices and document adaptations. Verify organizer rules on pre-existing code and attribution. This audit does not grant blanket clearance for a combined commercial product. No runtime compatibility, security scan, build test or integration result is claimed.
