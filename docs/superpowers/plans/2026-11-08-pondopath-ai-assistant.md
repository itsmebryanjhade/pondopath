# PondoPath assistant, import, and laptop offline implementation plan

Updated 9 November 2026 after review and demo-slice scoping. Proposed implementation for [the design](../specs/2026-11-08-pondopath-ai-assistant-design.md). Build steps and acceptance checks are pending owner approval to start.

> Planning only. After the owner asks to start, work one task at a time through the project's [change workflow](../../../.agents/skills/pondopath-change/SKILL.md). Use Superpowers executing-plans, the scoped tests and the project code reviewer. Obtain separate owner approval before applying a migration to the hosted development project or enabling a live provider evaluation.

**Goal**

Improve the workspace assistant first, then reduce the time and typing needed to reach a usable forecast from Excel, CSV or a connected Google Sheet. Make adding records by hand faster. Add a laptop offline view and workbook preview later, after the demo. No AI works offline.

**Architecture**

Extend the current assistant endpoint and use `assistant-ui` inside the signed-in React dialog. The authorized server supplies facts, reserves usage and validates suggestions for the existing forms. File and Google imports share Add Records and the Review Inbox. The laptop can open a saved forecast and preview files locally, then continue review online.

**Stack**

Node 24, the installed Next.js App Router and React, `@assistant-ui/react` `0.15.33`, Supabase Postgres, Gemini Developer API, Zod and Vitest. The optional OpenRouter transport is reserved for a later release. Reuse the existing file readers and Google connector. Use browser storage and a narrowly scoped service worker for the laptop pilot. Evaluate a local model runtime separately.

## Before implementation

- Use the latest PondoPath worktree on `codex/xlsx-import` unless the owner selects another branch. Check the worktree status and nested guidance. Read the relevant App Router docs in the installed Next.js package before editing the route or signed-in frame.
- Review [Supabase rules](../../../supabase/AGENTS.md), [database rules](../../database.md), [isolated test guidance](../../testing.md) and [AI verification](../../ai-verification.md). Use provider docs at implementation time to recheck model availability, schema compatibility and $0 pricing. Keep all secrets in the server environment. Use existing test configuration through the test runner without printing it.
- Use the spec's acceptance IDs as the checklist. Use fictional records and owned fixtures for tests that save data. Preserve the seeded demo business, historical evaluation evidence and unrelated worktree edits.
- Keep every stage independently usable. If hosted approval or provider access is pending, record that gap and use mocked assistant results for the local checks. The file and offline flows work with programmed rules while the cloud assistant is unavailable.

## Delivery order

**First release = the hackathon demo slice, online only.** Everything in it needs a connection, and no AI works offline. Task numbers stay fixed so references keep working. Deferred items stay in the plan for later.

| Order | Tasks | Milestone |
| --- | --- | --- |
| 0 | Step 0 | Short `assistant-ui` spike. Decide the library or plain React before building the dialog. |
| 1 | 2 | Gemini and the existing daily allowance. |
| 2 | 7 | Workbook onboarding in one review, plus the optional **Help match columns**. |
| 3 | 7A | Faster manual entry: amount shorthand, date defaults, **Save and add another**, and **Add a record from text**. |
| 4 | 3–6 | Cloud chat with source links, the **+** tools and **Review draft**, then demo verification with Gemini. |
| Later | 1 | Per-member per-minute limit and its table. Revisit the optional provider backup after the demo. |
| Later | 8 | Rework of the Google connection. The existing connection keeps working. |
| Later | 9 | Laptop view of a saved forecast and a local file preview. Read-only, no AI. |
| 5 | 11 | Contextual AI entry points on Forecast, Invoice detail and Follow-ups. |
| Later | 10 | The optional local model (separate pilot). |

## Review focus

- A partly paid invoice and a settled row in the same file. Task 7 checks the opening balance boundary and keeps any unsupported balance visible in review.
- A 300-row file retried after partial success. Task 7 checks bounded processing and stable source IDs across tabs.
- A renamed Google header or expired connection during reconnect. Task 8 checks recovery and no repeated proposal.
- A laptop restart or account switch. Task 9 checks saved-view isolation, expiry, offline Excel preview and current access when review resumes.
- A missing or incompatible downloaded model. Task 10 checks recovery and independence of the basic offline flow.

## Step 0 — Check `assistant-ui` before building on it

- [x] In a scratch branch or throwaway file, install the pinned package under Node 24 (`npm install --save-exact @assistant-ui/react@0.15.33`). Mount `useLocalRuntime` and the thread, message and composer primitives in a minimal component, and run the type check and build.
- [x] Mount it inside the native dialog and check focus, Escape, phone width and reduced motion. If it conflicts with the existing dialog or adds disproportionate weight, use a plain React message list with the same request and response contract and skip the package in Task 4.
- [x] Record the decision and the reason in one line before starting Task 4. Do not keep spike code unless it is the chosen approach.

**Decision on 9 November 2026.** Use `@assistant-ui/react` `0.15.33` in Task 4 and load it when the dialog opens. The isolated Node 24.22.1, Next.js 16.4.3 and React 19.3.0 spike passed type checking, the Webpack production build, and Chrome checks at 1880px, 1100px and 375px with fictional replies. Focus, Escape, retained conversation and reduced motion passed. The library added about 165 KiB of gzipped JavaScript on open and no initial JavaScript in the comparison build.

## Task 1 — Reserve both usage limits atomically

**Later (not in the demo slice).** Keep the existing daily allowance (`businesses.ai_daily_limit`). If the demo needs more chat turns, the owner can raise the demo business's value to about 30 as a data change. That needs no migration. Do the per-member limit and its table after the demo.

**Files**

Create one CLI-named migration under [Supabase migrations](../../../supabase/migrations). Extend the [quota integration tests](../../../tests/integration/ai-quota.test.ts) and add [local SQL tests](../../../supabase/tests/ai_quota.test.sql).

**Contract**

Keep `public.reserve_ai_request(p_expected_revision bigint, p_model text, p_provider text) returns integer`. The integer is the daily reservation count. It continues to derive membership from `auth.uid()`, check demo status and enforce the expected revision. Add `AI_MEMBER_LIMIT` as the distinct member-cap failure.

- [x] Before writing the migration, decide whether the per-member limit needs its own counter table. A simpler mechanism is fine if it passes the concurrency tests below. Ask the owner before applying any migration to the hosted development project.
- [x] Add a test with one owned demo fixture whose configured daily limit is below 30 and another whose configured limit is 50. In the first, parallel owner and finance attempts stop at the lower configured limit. In the second, seed only the owned fixture's current Manila-day usage row to 29 with the fixture admin, then issue two eligible parallel reservations. Assert exactly one reaches 30 and the other returns `AI_LIMIT`. Check the stored counts and the behavior of legacy callers.
- [x] Test six concurrent same-member reservations in one minute, five successes and one `AI_MEMBER_LIMIT`. Check a different member can still reserve within the shared allowance. For clock boundary and rollback cases, use an isolated local SQL fixture with controlled counter timestamps. Prove the next minute starts a new counter, an older minute cannot overwrite it, and a rejected daily reservation leaves the member row unchanged. Keep cases that race a minute boundary from depending on wall-clock sleep.
- [x] Prove anonymous and nonmember calls fail, missing and stale revisions reserve nothing, and owner and finance clients cannot write to the daily count or access the private counter directly. Verify an unrelated business has independent counts and cannot read the fixture's daily usage.
- [x] Check `supabase --version` and the relevant `migration`, `db`, and advisor help. Create the migration with `supabase migration new ai_assistant_usage_limits`. In `private.ai_member_usage`, add `business_id`, `user_id`, `minute_start timestamptz`, and `request_count integer` bounded to 1–5. Use the membership composite key and a cascading foreign key. Enable RLS, revoke application table grants and keep the schema unexposed.
- [x] Replace the private reservation implementation in the migration. After membership, business and input checks, compare revision with `IS DISTINCT FROM` so nulls also fail. Derive the UTC minute and Manila date from one real transaction timestamp. Upsert the member row only if the stored minute is older or the same minute is below five. Raise `AI_MEMBER_LIMIT` when the upsert returns no row. In the same transaction, upsert the daily count with `least(business.ai_daily_limit, 30)` and raise `AI_LIMIT` if exhausted. The exception rolls back the earlier member increment. Keep the public invoker signature and restricted grants, the private definer's empty search path and schema-qualified objects.
- [x] Applied [the migration](../../../supabase/migrations/20261108175928_ai_assistant_usage_limits.sql) to a disposable local Supabase database and verified its migration history. The 12 local SQL assertions passed, including clock rollover and rollback. Separate competing database connections verified the two daily limits, the member limit and access isolation. Advisors matched the baseline. Node 24 type checking and ESLint on the quota test passed.
- [ ] Obtain owner approval for hosted application, then run `npm run test:integration -- tests/integration/ai-quota.test.ts` against the dedicated development project. Preserve its project guard. Coordinate the rollout with the Task 2 HTTP 429 mapping.

**Local result on 9 November 2026.** The private member table keeps both limits in the same database transaction. The baseline test reproduced a reservation with a missing revision. The migration rejects that request without consuming either allowance.

## Task 2 — Add the free provider adapters and retry contract

**Demo slice.** Gemini handles each request using the existing workspace allowance. The verified Task 2 OpenRouter transport remains available for later evaluation. Task 3 removes the backup request option and response metadata from the demo API.

**Files**

[Provider transport](../../../lib/server/ai-provider.ts), [assistant service](../../../lib/server/ai.ts), [request schemas](../../../lib/domain/ai.ts), [route](../../../app/api/assistant/route.ts) and their [provider](../../../lib/server/ai-provider.test.ts), [service](../../../lib/server/ai.test.ts), [route](../../../lib/server/ai-route.test.ts) and [handler integration](../../../tests/integration/ai-handler.test.ts) tests. Keep the [existing disclosure](../../../components/ai-assistant.tsx), its [presentation test](../../../lib/ui/ai-assistant.test.ts) and the [missing-key check](../../../scripts/verify-mvp.mjs) current with the provider change.

**Contract**

The demo calls server-owned `aiConfig()` for Gemini and keeps the existing normalized value and usage. Keep the legacy task success envelope and the trusted-origin, JSON and 16 KiB body guards.

- [x] Verified the published stable `gemini-3.1-flash-lite` model ID and OpenRouter's `:free` variant and provider routing options. Task 6 verifies the Gemini account quota. A future rollout verifies the optional free endpoint. [Gemini model](https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite) · [OpenRouter free variants](https://openrouter.ai/docs/guides/routing/model-variants/free)
- [x] Add mocked-fetch tests that check Gemini is default and only one provider call occurs. The separately tested backup transport for a later release uses a named `:free` route, a single provider slug, required structured parameters, disabled fallback, `data_collection: "deny"` and zero prompt, completion and request price ceilings. Test missing configuration and attempted paid routing. Expect zero calls and zero reservations for both.
- [x] Use `GEMINI_API_KEY` and a server-controlled `PONDOPATH_AI_DEMO_BUSINESS_ID` for the single reviewed fictional workspace. Compare the ID and `is_demo` against the authenticated snapshot before inference and again on the fresh snapshot. The demo reserves through the existing `reserve_ai_request` function and rechecks user, business, role, revision and access after inference. When the opt-in or provider config is absent, show the manual fallback.
- [x] Use the stable `gemini-3.1-flash-lite` model with Gemini REST `generateContent`. Send the key in the `x-goog-api-key` header. Map the system instruction to `systemInstruction` and the bounded JSON context to a user text part. Set `generationConfig.responseFormat.text` to `{ mimeType: "APPLICATION_JSON", schema }` using Gemini's supported schema subset, with a maximum of 1,800 output tokens and one candidate. Parse the final text candidate and handle an empty, blocked, truncated or invalid reply as an unusable result. Retain the 20-second timeout, bounded read and server-side validation. [Gemini REST reference](https://ai.google.dev/api/generate-content) · [Gemini structured output](https://ai.google.dev/gemini-api/docs/structured-output)
- [x] Reuse the OpenRouter chat-completions transport with strict schema, the approved `:free` slug and `provider.max_price: { prompt: 0, completion: 0, request: 0 }`. Keep the provider selector and key server-side. Verify the exact free endpoint and account settings before any later backup rollout. [OpenRouter provider routing](https://openrouter.ai/docs/guides/routing/provider-selection) · [OpenRouter structured output](https://openrouter.ai/docs/guides/features/structured-outputs)
- [x] Use `AI_PROVIDER_BUSY` for upstream transient failure and `AI_TIMEOUT` for timeout. Map `AI_LIMIT` and `AI_MEMBER_LIMIT` to 429, stale data to 409 and unusable output or configuration to the existing unavailable response. The demo endpoint rejects client provider selection and returns no backup metadata. Failed requests after reservation consume the slot.
- [x] Run the focused provider, service, route, domain and disclosure tests on Node 24. Run TypeScript and ESLint on the Task 2 files. Task 3 preserves the standalone provider tests and verifies that the demo endpoint calls Gemini once and rejects backup selection.
- [ ] With approval for dedicated hosted development verification, run `npm run test:integration -- tests/integration/ai-handler.test.ts` with provider calls mocked. The fixture opts in only its isolated fictional workspace. The existing daily reservation can be checked before Task 1 is deployed.

## Task 3 — Build bounded chat context and validate proposals

**Files**

[AI contracts](../../../lib/domain/ai.ts), [assistant service](../../../lib/server/ai.ts), a small chat context module at `lib/domain/assistant-chat.ts` and targeted tests in `lib/domain/assistant-chat.test.ts`, [route tests](../../../lib/server/ai-route.test.ts) and [handler integration tests](../../../tests/integration/ai-handler.test.ts).

**Contract**

Add `task: "chat"` with `question`, `history`, optional `context`, optional `intent`, and the common `expectedRevision` and `language` fields. A history pair is `{ question, answer }`. Context is `{ page, record? }`, with `page` in `overview | forecast | cash | invoices | expenses | followups` and a selected `{ kind: "invoice" | "expense", id }`. Optional intent is `draft_reminder` or `draft_followup`. Map the provider's chat result to a proposal with `task: "chat"`, `sourceRevision`, `kind`, `summary`, app-rendered `facts`, verified `sources`, and a typed `draft` or `null`. A local clarification uses the same proposal envelope with `usage`, `model` and `provider` set to `null`.

- [x] Add tests for the three completed-pair limit, text lengths and request byte limit, unknown fields and forged actor/record data. A foreign ID is rejected before provider use. When a typed draft request lacks an unambiguous invoice or follow-up date, return a clarification before reserving or calling Gemini. A selected record is verified against the actor's current snapshot and an eligible exact invoice match can be selected before applying the context cap.
- [x] Implement `buildAssistantChatContext(workspace, request)` using the existing forecast and worklist, bounded invoice/bill projections, and a short vetted help set. Send one selected record for targeted drafts. For general forecast context include forecast facts and capped records, retaining only IDs for records sent. Test that provider input excludes unrelated records, private contact details, raw imported rows, credentials and unrestricted history. Source labels and links are assembled by the app from the verified ID map, including existing paginated expense links.
- [x] Implement `validateAssistantChatReply(request, context, value, freshWorkspace)` for the spec's JSON envelope. Check schema, fact and record membership in the sent projection, fresh revision and the matching invoice, unpaid balance, draft length and due date. Accept at most one draft. Return a clarification instead of a draft when the user needs to choose an invoice or supply an unambiguous date. Use the existing app calculations and show amounts and dates as server-rendered facts. Treat all provider output as untrusted text and data.
- [x] In `lib/domain/ai.test.ts`, send `PHP 20000 on 2026-11-06` with its exact quote and a model amount of `1_000_000` centavos or a date of `2026-11-07`, each tested separately. Both must return `needsReview`. Add passing tests for an exact match and `₱1,250.50`, and review cases for two distinct values, unsupported formats and quotes that omit the values. In `validateAiProposal`, scan the original reply and the validated exact quotes for PHP-marked amounts and full ISO dates. Normalize with `parseMoney` and `assertLocalDate`, require the unique values to match the model proposal and appear in the quotes, and add a review issue and blank the unsupported field on mismatch. Keep existing bounds, ambiguous-reply and paid-claim checks. The client must keep the prefilled confirmation path closed whenever `needsReview` is true.
- [x] Verify "What should I do first?" can use existing worklist ordering. Test a follow-up question with a prior exchange, an invented ID or URL, an injected label, a stale revision and a response for a different invoice. Ensure generated text cannot create commands, external links or an automatic payment.
- [x] Run `npx vitest run lib/domain/assistant-chat.test.ts lib/domain/ai.test.ts lib/server/ai.test.ts lib/server/ai-route.test.ts`. Add isolated handler coverage for the authenticated chat request, changed membership or revision, quote mismatch, and rejection of backup selection.

**Verified on Node 24.22.1.** 98 focused tests and 8 isolated handler integration tests passed with mocked Gemini. TypeScript and ESLint passed. Task 4 connects the chat UI, Task 5 connects the review forms, and Task 6 verifies the live Gemini configuration and quota.

## Task 4 — Add conversation and the + menu

**Files**

[Current dialog](../../../components/ai-assistant.tsx), [workspace frame](../../../components/workspace-frame.tsx), scoped [workspace styles](../../../app/workspace.css), [package manifest](../../../package.json), [lockfile](../../../package-lock.json) and [assistant UI tests](../../../lib/ui/ai-assistant.test.ts).

- [x] Test the launcher, empty state, three page-aware starters, language selector, **New chat**, composer, **Workspace tools** menu and its five exact labels, including **Add a record from text**. Opening any of those controls makes no fetch. Invoice actions preselect the open invoice or show the existing invoice picker.
- [x] Verify the published package and lock it with `npm install --save-exact @assistant-ui/react@0.15.33` under Node 24. If Step 0 chose plain React, skip this install and keep the same contract. Review the lockfile delta and run the app's type and build checks. Mount `AssistantRuntimeProvider` with `useLocalRuntime` and the library's thread/message/composer primitives inside the native dialog. Configure a single local thread with PondoPath's controls and no cloud client, history adapter, tool execution or automatic resubmission. [LocalRuntime documentation](https://www.assistant-ui.com/docs/runtimes/custom/local-runtime)
- [x] Keep the separate editable source-reply input. The local adapter posts a strict Task 3 DTO to the same-origin endpoint using the existing session and its abort signal. Send only the latest three completed text pairs, trimmed oldest first to the request-byte limit. Never include the entire workspace, prior tool parts or credentials in the request. Retain the input and last attempted request on failure. Disable duplicate submissions and clear or ignore a superseded run on reset and actor/business change. A source link may close the dialog while retaining the current conversation.
- [x] Map an authorized result to plain text and named data parts for verified facts, source links and the draft review control. Render these with PondoPath components, including the existing form handoff in Task 5. Keep input available after provider errors so the user can edit or send again. Gemini is the demo's only provider. A local clarification can return without using the provider. Prove each explicit action makes one endpoint call and that opening, reset, rendering and client history make no model or cloud requests. Limit, stale, blocked and unavailable states keep the regular forms usable. [Rendering message data](https://www.assistant-ui.com/docs/primitives/message)
- [x] Keep native dialog focus behavior. The **+** menu uses button semantics, keyboard navigation, visible focus and Escape returning focus to the trigger. Keep the existing reduced-motion convention and clear state at phone widths. Verify the three agreed widths and ensure the phone More menu and assistant launcher still cooperate.
- [x] Run `npx vitest run lib/ui/ai-assistant.test.ts lib/ui/workspace-navigation.test.ts`. Verify the basic chat, a failed request, Escape and a reset with an in-flight response in an authorized browser with mocked providers.

**Integration verified on Node 24.22.1.** A clean `npm ci`, TypeScript, scoped ESLint and `next build --webpack` passed. The library suite passed 698 tests. The isolated assistant handler passed 8 tests and reminder approval passed 4 tests.

Chrome used fictional owner and finance accounts with Gemini mocked. At 1880px, 1100px and 375px the dialog fit and keyboard focus, Escape, reduced motion and the mobile More menu worked. Opening the launcher, choosing starters or tools and reviewing a draft sent no assistant request. Each explicit send made one request despite a rapid second submit. A provider limit preserved the input for a manual retry.

Chrome verified multiple turns, the actual forecast facts and an internal source link, the exact second invoice and its customer, and zero writes before Save. New chat discarded an in-flight result. A workspace revision change hid earlier facts, links and draft controls. A date clarification used no allowance and the date-only reply retained the chosen invoice. Validated extraction showed the exact quote and cash impact. An amount mismatch blocked confirmation. Route and handler tests cover origin and session checks, foreign records, lost membership, changing revisions, and rejection of backup selection.

This verifies AI-01, AI-02, AI-04 and the demo checks in AI-05 and AI-06 against the mocked provider. AI-03's editable follow-up form remains in Task 5. The live provider and multilingual evaluation remain in Task 6. **Add a record from text** opens manual entry until Task 7A.

## Task 5 — Connect the review cards to existing forms

**Files**

[Assistant dialog](../../../components/ai-assistant.tsx), [follow-up form](../../../components/followup-panel.tsx), [reminder form](../../../components/reminder-panel.tsx), [collection review](../../../components/collection-panel.tsx), and their focused tests.

- [ ] Test that **Review draft** opens the correct invoice's editable form without a call to `executeWorkspaceAction`. A user save goes through the existing command, actor and revision checks. A stale card hides its form and cannot submit with a newer revision. Finance can prepare a reminder and requests owner approval through the existing flow.
- [ ] Reuse `ReminderPanel` with `suggestedBody`. Export the existing `FollowupForm` with optional `proposed: { nextAction, date }` for a new task, preserving edit behavior and the normal assignee field. Use the existing `CollectionPanel`, source wording and cash-impact preview for a valid reply extraction. Bind each review to the original invoice and revision. Allow editing in the form before a person submits.
- [ ] Run `npx vitest run lib/ui/ai-assistant.test.ts lib/ui/followup-panel.test.ts lib/ui/reminder-panel.test.ts lib/ui/customer-invoices.test.ts`. Verify drafts open and edit normally. Exercise save and approval with mocked actions or owned fixtures, including denial of an unauthorized or stale action. Use navigation and previews when browsing the shared demo.

## Task 6 — Verify and enable the fictional demo slice

**Demo slice.** Verify Gemini before enabling AI. Use the existing daily quota. The backup and Task 1 hosted migration follow the demo.

- [ ] Run `node --version`, `npm run typecheck`, `npx vitest run lib` and ESLint on the changed TypeScript files. Run the authorized Task 2 handler integration check. Run the Task 1 hosted quota check when that migration is approved. Run the project build before enabling the demo. Report unavailable checks and the reason.
- [ ] Provision an authorized isolated fictional workspace for the test. Check the Gemini Free tier with billing disabled and read its active quota in AI Studio. Keep the key and opt-in workspace ID on the server. Record the model, availability and external usage.
- [ ] With authorized free access, evaluate Gemini against the [15 fictional reply fixtures](../../../tests/fixtures/ai-replies.json) and one three-turn source, explanation and draft exchange per language. Require AI-07, including exact app figures and links and no writes on proposal or review. Stay within the configured workspace and provider limits. Run the live evaluation once with owner approval because it uses provider allowance.
- [ ] Record a new dated evaluation under `docs/superpowers/reviews/` with pass counts by language, routes, response time, usage, version checks and gaps. The [original evaluator](../../../scripts/evaluate-ai.mjs) writes the historical evaluation path and provisions its own business. Use its fixture cases and a signed-in controlled evaluation against the opted-in business rather than overwriting that evidence.
- [ ] Check Gemini failure, quota exhaustion and the manual workflow at 1880px, 1100px and 375px. When Gemini is unavailable, retain the input and keep manual paths available. Real-data use requires separate approval and privacy review.

## Task 7 — Make workbook onboarding a single review

**Build order.** Start after Task 2. The optional mapping help uses the same provider and daily usage checks.

**Files**

[Add Records](../../../components/add-records.tsx), [preview parts](../../../components/add-records-parts.tsx), [file actions](<../../../app/(workspace)/imports/actions.ts>), [reader](../../../lib/domain/reader.ts), [CSV rules](../../../lib/domain/imports.ts), [XLSX reader](../../../lib/domain/xlsx.ts), [bulk review](../../../components/intake-bulk-confirm.tsx) and their owning tests. Add optional mapping help to the [assistant route](../../../app/api/assistant/route.ts) and its existing schema, service and tests.

- [ ] Write failing cases for a 300-row fictional workbook with invoice and bill tabs, a partly paid invoice (₱50,000 original, ₱30,000 open), a settled row, ambiguous dates and a repeated upload. Check exact programmed counts and amounts, source references, valid ready rows and clear exceptions. Include an interrupted batch and retry, expecting one proposal per stable source record. Check that an earlier payment already reflected in opening balances adds no movement.
- [ ] Extend the existing preview to select relevant sheets in one pass and show group totals and exceptions. Keep the current file safety checks, set an explicit total workbook bound, and stage in bounded batches. Retain sheet and row references and the existing stable IDs. Apply the existing confirmation rules to each eligible row. Show a partly paid row in balance review when the current command cannot preserve its open amount and original total. Show the count and amount of excluded open rows where known. The current XLSX limit is 512 KiB; keep it unless the 300-row fixture exceeds it.
- [ ] Use the programmed mapping first. For an explicit **Help match columns** request, add `suggest_import_mapping` to the same authenticated, fictional-demo assistant boundary and reservation rules. Accept up to 24 short headers with temporary IDs and three masked sample rows. Return existing mapping fields paired with selected column IDs and any unresolved fields. Test rejected unknown IDs and conflicting assignments, no provider call before a user asks, no raw workbook upload to the model, and manual mapping when the provider fails. The person confirms the mapping before it is saved.
- [ ] Run the owning XLSX, CSV, Add Records, bulk review and assistant route tests on Node 24. Use a fictional browser walkthrough from the original workbook to the forecast. Record elapsed setup time, fields typed, ready and held totals, and the result of a repeat import. Run intake integration checks in authorized isolated fixtures.

## Task 7A — Make manual entry faster

**Build order:** right after Task 7.

**Files**

[Manual entry](../../../components/manual-entry.tsx), [record forms](../../../components/record-forms.tsx), [customer picker](../../../components/customer-select.tsx), [AI contracts](../../../lib/domain/ai.ts), [assistant service](../../../lib/server/ai.ts) and [assistant dialog](../../../components/ai-assistant.tsx), with their tests.

- [ ] Write failing tests for the programmed help: `25k`, `1.2M` and `₱25,000` show the plain amount and save through `parseMoney`; invalid shorthand shows a clear message; an invoice's due date defaults to the plan date plus 30 days and a bill's to the plan date; the quick date choices set the right dates; **Save and add another** keeps the customer and clears number and amount; the next-number suggestion (1024 then 1025) is editable and the duplicate-number rule still applies on save.
- [ ] Implement the converter in the form layer only. The command payload and `parseMoney` stay unchanged. Check keyboard use and the three agreed widths.
- [ ] Add the `extract_record` task to the assistant contracts: up to 1,000 characters in, at most three proposals out, each with kind, number or label, party, amount, due date and an exact source quote. Reuse the reply-extraction checks: an amount must match one amount in the text, and a date one unambiguous full date. Unmatched values are blank and flagged.
- [ ] Match a customer by exact name against the authorized list on the server. With no match, open the form with the **+ Add a new customer…** panel prefilled with the proposed name. Send customer display names only.
- [ ] Add **Add a record from text** to the **+** menu. A proposal opens in the existing form, prefilled and editable, one at a time. Test that opening makes no `executeWorkspaceAction` call, that nothing is saved until the normal **Add** button, and that no provider call happens before **Send**.
- [ ] Run the owning form, manual-entry, assistant route and assistant UI tests on Node 24. Check ENTRY-01 and ENTRY-02 with five fictional notes in English, Tagalog and Taglish, using mocked providers for automated checks.

## Task 8 — Reuse Connect Google for online sync

**Later:** the existing Google connection keeps working. Revisit this after the demo.

**Files**

[Google setup](../../../components/google-connect.tsx), [connection actions](<../../../app/(workspace)/imports/google-actions.ts>), [Google sync service](../../../lib/server/google-sync.ts), [sync tests](../../../lib/server/google-sync.test.ts) and [connector integration tests](../../../tests/integration/google-connect.test.ts).

- [ ] Trace the current setup, automatic due check and **Sync now** paths. Use the existing selected-file permission, saved tab and mapping, source claim and Review Inbox. Review the recorded D2 evidence in [testing](../../testing.md) before repeating live checks.
- [ ] Test an online reopen or reconnect while the workspace is open, an unchanged repeat, one new row, one edited row and a renamed mapped header. Reuse the existing due check on reconnect if needed and coalesce repeated attempts. Confirm row changes appear once for review and the last good forecast stays visible on failure.
- [ ] Keep access recovery and mapping review in the existing connection screen. If changed headers need a separate recovery fix, document the exact gap before extending the connector. Obtain owner approval before applying any hosted migration. Verify with mocked failures and owned fixtures, then use an authorized fictional Sheet for any live proof.

## Task 9 — Add the laptop offline view and Excel preview

**Later:** after the demo. No AI runs offline. This only reads a saved forecast and previews a local file, and saves nothing to records.

**Files**

Plan `app/offline/page.tsx` for the offline entry, `public/pondopath-offline-sw.js` for the public shell and assets, `lib/ui/offline-workspace.ts` and its focused tests for saved state, and a laptop preview component. Reuse the [forecast](../../../lib/domain/forecast.ts), [Add Records](../../../components/add-records.tsx) and file validation from Task 7.

- [ ] Read the installed Next.js PWA and client component guides. Prove the preview can parse a supported XLSX and CSV on the device with network blocked. Reuse programmed validation and run the same rows through the online preview to compare counts, cents and dates.
- [ ] Add explicit **Save for offline** after sign-in. Store the scoped saved forecast with plan date, revision and refresh time for up to 24 hours. Cache public shell assets separately. Add tests for expiry, sign-out, user or business switch and an offline restart. Check that no protected HTML, API responses or credentials go into the offline asset cache.
- [ ] Show the last saved forecast and **Last synced** time. Preview files in memory and reopen the local file after closing the preview. When online, **Continue review** uses the current session, business, file checks and duplicate rules before staging. Exercise a stale or revoked session and a changed record. Financial confirmation uses the normal online workflow.
- [ ] In a real laptop browser, save the view, block network access, restart, open the forecast and preview an Excel file without any AI model. Reconnect and continue review once. Check the online assistant and Add Records at phone width. Record the supported browser and exact offline checks.

## Task 10 — Evaluate one optional laptop model

**Later:** after the first release works.

- [ ] After Task 9 passes, choose one small model and record its runtime, license, download size and laptop requirements. Use a separate opt-in download and a narrowly scoped local runtime beside the offline view. Limit the pilot to explanations of saved app facts and suggestions for masked worksheet samples.
- [ ] Check a cold start after closing the browser and blocking the network. Try the English and Taglish fixture questions and column samples. Verify exact app figures and allowed column suggestions, and test an unavailable model or cleared model cache. Workbook preview must still open. Record first-answer time and the laptop/browser used.
- [ ] Present the result for a separate demo decision. Keep the cloud assistant and the offline workbook path usable regardless of the local evaluation.

## Task 11 — Contextual AI entry points

Updated 9 November 2026 to align with the AI-native financial workspace vision. Task 11 is now part of the **hackathon MVP** — not a later follow-up — and replaces the former stub.

**Vision:** PondoPath should feel like an AI-native financial workspace where AI assistance is accessible in context, beside relevant cards, records, and workflows. All contextual actions open the **single shared AI Assistant** (`components/ai-assistant.tsx`) with pre-filled page or record context. No separate AI implementations are introduced.

**Build order:** After Tasks 4 and 7A are verified. The contextual buttons extend `assistantPage()` and `WORKSPACE_TOOLS`; they do not replace the launcher or the + menu.

**Files**

Contextual trigger components: `app/(workspace)/forecast/page.tsx`, `app/(workspace)/invoices/[id]/page.tsx`, `app/(workspace)/follow-ups/page.tsx`, and their owning test files. Assistant context routing: `lib/ui/assistant-chat-adapter.ts`. Shared assistant entry: `components/ai-assistant.tsx`, `components/ai-assistant-launcher.tsx`. Shared tests: `lib/ui/ai-assistant.test.ts`.

**Deferred to Phase 2 (post-hackathon):** Expenses contextual buttons, Review Inbox context integration, smart dismissible suggestion chips, proactive push notifications, autonomous AI task creation, and broad cross-page suggestions.

### Acceptance criteria

- [ ] **CTX-01** Contextual AI trigger buttons render on the Forecast page (beside the first projected gap), Invoice detail page (beside outstanding-balance summary), and Follow-ups page (beside the first open follow-up task).
- [ ] **CTX-02** Each contextual trigger opens the existing `AiAssistant` dialog with the correct page context pre-filled. No second assistant instance is created.
- [ ] **CTX-03** Opening a contextual trigger makes **zero** provider calls. `executeWorkspaceAction` is not called on open.
- [ ] **CTX-04** The assistant correctly pre-fills the page or record context via `assistantPage()` / the context argument. The correct starter question is pre-suggested or pre-filled in the composer.
- [ ] **CTX-05** Role and revision checks pass. Finance can open the assistant context; owner approval is still required for any financial record mutation. A stale context surfaces the existing stale-revision error.
- [ ] **CTX-06** All existing tests (770+ unit, TypeScript, ESLint, build) continue passing after the contextual additions.
- [ ] **CTX-07** Contextual trigger buttons meet the 44 px minimum touch target, receive visible keyboard focus, support Escape, and pass the existing reduced-motion convention.
- [ ] **CTX-08** No automatic Gemini call occurs simply because a page containing a contextual button renders.

### Contextual entry points (Phase 1 MVP)

| Page | Trigger location | Pre-filled context | Suggested starter |
| --- | --- | --- | --- |
| Forecast | Beside the first projected cash gap | `page: "forecast"` | "Explain our first cash shortage" |
| Invoice detail | Beside the outstanding-balance summary | `page: "invoices"`, `record: { kind: "invoice", id }` | "Explain this outstanding balance" or "Draft a payment reminder" |
| Follow-ups | Beside the first open follow-up task | `page: "followups"`, `record: { kind: "invoice", id }` | "Help me follow up on this invoice" |

Context-aware capabilities per page (responses grounded in existing workspace tools and authorized context):

- **Forecast:** Explain shortage, analyse risk, suggest short-term actions.
- **Invoice detail:** Explain outstanding balance, draft payment reminder, plan follow-up. *(Existing + menu tools already support this; contextual button provides one-click entry.)*
- **Follow-ups:** Prioritise open tasks, suggest message tone, draft follow-up text.

### Authorization and safety

- Finance users may open any contextual entry point and see the assistant with correct context.
- Owner approval is still required before saving any AI-proposed financial action (existing approval workflow; not bypassed by contextual entry).
- Revision check is applied on the fresh snapshot after inference; a stale context returns the existing stale-revision error.
- Zero automatic Gemini calls on page render; triggers are user-initiated only.
- No silent database writes from AI proposal or review (inviolable rule; unchanged by this task).

### Phase 2 — Post-hackathon scope

- Expenses: Summarize upcoming obligations, flag concentration risks.
- Review Inbox: Explain a staged import row, ask about mapping decisions. Extend the chat context with `page: "review"` and `record: { kind: "intake", id, reviewVersion }`. Enforce `pending` or `needs_match` status before and after inference. Test a version or status change without a workspace revision change. Show a safe Inbox source link.
- Smart dismissible suggestion chips triggered by deterministic client-side rules (e.g., overdue invoice → "AI can help draft a reminder"). No automatic Gemini requests on render.
- Proactive AI notifications and broader autonomous actions.

### Implementation checklist

- [ ] Read the existing `assistantPage()` mapping in `lib/ui/assistant-chat-adapter.ts` and `WORKSPACE_TOOLS` before adding context routes. Extend only the strictly needed routes.
- [ ] Add a lightweight `AiContextButton` component (or reuse an existing button variant) for the contextual trigger. It must call `openAssistant({ page, record?, starterText? })` from the existing launcher API; no new state stores or providers.
- [ ] Write failing tests: contextual trigger renders beside the right element; clicking it calls the launcher with the correct context object; zero `fetch` or `executeWorkspaceAction` calls occur on render or on open; the existing assistant tests continue to pass unmodified.
- [ ] Add the trigger to the Forecast page beside the first projected gap. Use the programmed gap calculation already exposed to the page; do not re-fetch from the provider.
- [ ] Add the trigger to the Invoice detail page beside the outstanding-balance summary. Bind `record.id` from the route params; verify the record belongs to the authenticated workspace before passing context.
- [ ] Add the trigger to the Follow-ups page beside the first open task row. Bind `record.id` from the row; apply the same ownership check.
- [ ] Extend `assistantPage()` and `generatePageStarters()` to handle the new context routes and produce the agreed starter texts. Keep existing routes unchanged.
- [ ] Verify role check: a finance user opening any contextual trigger sees the assistant with correct context; the server enforces owner approval before any financial mutation.
- [ ] Run `npx vitest run lib/ui/ai-assistant.test.ts` and the owning page tests. Confirm zero regressions.
- [ ] Verify actual opening, keyboard focus, Escape, 44 px touch targets and reduced-motion at 1880 px, 1100 px and 375 px with mocked providers.
- [ ] Run `npm run typecheck`, `npm run lint`, and `next build --webpack`. Report any failures.
- [ ] Record PASS / FAIL / BLOCKED against CTX-01 through CTX-08 before claiming completion.