# AI assistant verification — 29 October 2026

Scope: implementation-plan Task 9, using fictional data in the dedicated development project. Node-RED and deployment remain separate tasks.

## Implemented

- Three bounded tasks: explain the cash plan, extract a selected customer's proposed payment details, and draft a reminder. Questions and replies support English, Tagalog and Taglish; the user can request a response language.
- A native accessible dialog uses PondoPath's existing controls. Calculated cash facts remain visible separately from AI prose. Structured replies are validated before display; no raw model HTML is rendered.
- Extraction/drafting send selected invoice fields and the reference date; unrelated cash/expense details are excluded. Explanations receive calculated forecast facts and at most 30 invoice/30 expense details, with omissions identified.
- The server retrieves authorized context and rechecks membership/revision after inference. AI has no financial mutation, approval or messaging tools. Reviewed proposals reuse existing validated commands; invoice changes clear prior proposals and their review forms.
- Origin and content-type checks, a 16 KiB actual-body limit, field limits, a 20-second provider timeout, bounded output, no fallback routing and an atomic per-business daily allowance are enforced. The counter's date uses actual Manila time, independent of the fictional forecast date.
- Only demo businesses are enabled. Missing credentials, provider errors, exhausted allowance and stale records leave manual entry/templates available.

## Model and reuse decisions

Evaluated model: `openai/gpt-4.1-mini`, pinned provider `openai`. The public endpoint metadata confirmed `response_format` and `structured_outputs` support. Requests require supported parameters, use strict JSON schemas, disable fallback routing and set provider data collection to `deny`. No real customer data was used; these settings do not establish production privacy readiness.

Ruling: retain the planned direct OpenRouter fetch and reuse existing review/forms plus a native dialog. InvoiceShelf supplied a workflow reference; its PHP/Vue code was not copied. Assistant-ui was assessed as an optional MIT UI library, but adding its runtime dependencies was not justified for three bounded tasks. No new package or general-purpose agent framework was added.

## Evidence

- Unit checks cover malformed/foreign/excess/stale output, exact source quotations, incomplete details, claimed payment, multiple installments and relative/uncertain wording. Missing-key fallback also exercises the existing manual reminder template.
- Five new integration checks pass against real signed-in Supabase sessions: atomic concurrent allowance, blocked direct counter changes, unauthorized record context, invalid model sources, and records changing during inference. Only the outbound model transport is mocked in the handler integration tests; separate live HTTP tests use the actual provider.
- Final live evaluation: **10/10 explicit extractions and 5/5 ambiguous/adversarial review cases passed**, with English, Tagalog and Taglish cases. Financial revision and available cash remained unchanged. Machine-readable results are in `ai-evaluation.json`; this is a small fixture evaluation, not a general language-quality guarantee.
- The final 15-call run reported a maximum end-to-end request time of 3,339 ms and a total reported OpenRouter charge of USD 0.0065568. This excludes prior development attempts and is not a future pricing estimate.
- Earlier repeated live runs exposed inconsistent model handling of installments and weekday-only dates. Programmed review guards now prevent those outputs from silently becoming receipt plans; failing regression tests were observed before the fixes.
- Browser checks on actual localhost: Tagalog explanation with source links; Taglish PHP 20,000 / 6 November proposal and exact calculated cash impact; required unchecked confirmation in the original receipt-plan form; invoice switching removes the prior proposal; real Tagalog reminder prefilled in the existing draft form. No demo records were saved and no message was sent.
- Native Escape closes the dialog and returns focus to its launcher. The 480px narrow viewport has a full-width dialog and no document overflow; normal preview size was restored afterward. Draft fields and source notes remained editable.
- Final production build/TypeScript and lint passed. The full unit suite passed before the final missing-key test addition; that added test is verified separately. No new database security advisor finding; the pre-existing managed-Auth leaked-password notice remains unchanged.

## Review and limits

A fresh read-only review identified excessive extraction context and retained proposals after invoice changes. Both were corrected, with a failing minimization assertion and an actual browser invoice-switch check. No remaining consequential review finding was identified.

No end-to-end financial save or reminder approval/send was repeated on the seeded business. Existing commands, permissions and audit controls remain the save boundary. No production deployment, real-data pilot, ongoing automation or broad model benchmark is claimed. Graphify refresh remains blocked by the previously recorded Windows policy; focused source inspection was used.

Next.js note: an explicit default Node runtime export was rejected with Cache Components enabled; omitting that redundant export restored compilation. No qualifying framework feedback draft remained after the reporting review.
