# PondoPath — AI-Assisted Cash-Flow Action Planner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver SoloForge's one-business MVP that connects verified payments, customer commitments, a correct 30-day forecast, reviewed reminders, and a working missed-commitment automation.

**Architecture:** Keep the existing Next.js application. Use pure TypeScript for the forecast, Supabase Auth and PostgreSQL for durable records and atomic business commands, and authenticated Server Actions for application writes. Add one bounded OpenRouter adapter and one Node-RED flow after the manual workflow works. Financial rules and authorization remain independent of AI.

**Tech Stack:** Next.js 16.4.3, React 19.3.0, TypeScript 5, Tailwind CSS 4, Supabase, OpenRouter, Node-RED, Vercel. Proposed development additions: Vitest, Zod, the two Supabase JavaScript packages, and the Supabase CLI. Use Node.js 24.x consistently for development and deployment.

**Spec:** [SoloForge PRD v1.0](../specs/SoloForge_Cash-Flow_Action_Planner_PRD_v1.0.md). Numerical reference: [sample business walkthrough](../../c01-sample-business-walkthrough.md). Read both alongside this plan.

**Status:** Native execution started October 27, 2026, Asia/Manila. Tasks 1–7 are implemented and verified in the dedicated development environment. Tasks 8–12 remain pending. Actual verification results are recorded in the execution ledger; examples below define required outcomes.

**Identity update (October 27; implemented):** PondoPath is the product name; SoloForge remains the builder brand. Added the approved P-shaped path logo, consistent sign-in/workspace branding and accessible login notifications. Verified one-time success feedback, repeatable error feedback and browser behavior. This does not advance Task 4 or change financial/authorization rules.

## Global Constraints

- One preconfigured business, Philippine pesos only, Asia/Manila dates, and English interface text.
- An owner login and a finance/admin login in that same business. No public registration, business onboarding, invitation flow, or multi-business switching.
- Manual forms and fictional seed records first. CSV/XLSX import is deferred.
- Reminders are reviewed copyable drafts for manual sending through the business's existing channel.
- One temporary what-if scenario at a time, changing one invoice's expected receipt date and/or amount.
- Store and calculate PHP amounts in integer centavos. The per-record limit is PHP 999,999,999.99; aggregate calculations must also remain within safe integer bounds.
- The live forecast covers today through today plus 29 days, inclusive. Audit timestamps are stored in UTC and displayed in local time.
- A payment promise is not actual cash. An actual receipt replaces the corresponding expectation rather than adding income twice.
- Customer statements and AI output are untrusted input. People confirm updates; only an owner approves reminders and voids posted movements.
- Node-RED checks every 15 minutes. More than 30 minutes without a successful run produces a stale-automation notice.
- AI: initial limit 50 requests per business per day; 20-second timeout; at least ten unambiguous and five ambiguous/adversarial evaluation replies.
- Preserve the existing Next.js agent-rules block. Read installed Next.js documentation before implementing framework behavior. Do not introduce an ORM, Python service, vector database, messaging provider, or a second workflow platform.

## Review Focus

Each condition below has an explicit test in its owning task; these supplement the PRD's examples.

1. **A request times out after the database committed:** the same request ID returns its original result without a second movement, even though the workspace revision has advanced. Tasks 4–5.
2. **A role or membership changes after a page was opened:** a previously authenticated browser cannot retain owner privileges through stale client state or profile metadata. Task 3.
3. **Midnight, invalid calendar dates, and an advanced forecast window:** use Manila's date, reject February 30, retain overdue unpaid expenses, and exclude stale expectations. Tasks 1–2 and 11.
4. **A customer contact or invoice changes while a reminder or AI proposal is open:** reject the stale confirmation; an approved draft cannot be copied as current after its approval basis changes. Tasks 7–9.
5. **A process stops between automation scan and completion:** show the stale/failed run and recover missed work without duplicate tasks or reopening human-completed tasks. Task 10.

## 1. Verified starting point and prerequisites

The repository contains the starter `app/page.tsx`, `app/layout.tsx`, `app/globals.css`, configuration, and project documents. No application data layer, product screens, tests, or service configuration exists yet. The local Graphify map identifies six source/config files; it does not index the PRD or CSS.

Existing `next.config.ts` enables `cacheComponents`, `partialPrefetching`, and `experimental.agentFeedback`. Preserve these initially. Put authenticated request-time Server Components behind `Suspense`; do not solve a build error by caching sensitive financial data or disabling unrelated framework behavior.

The shell currently resolves Node 26.12.0. Task 1 must select an actual Node 24 runtime before installing dependencies or treating build results as deployment evidence. Vercel supports 24.x and Node-RED currently recommends it; do not assume the existing shell runtime is deployment-compatible.

External prerequisites are execution gates, not reasons to delay pure calculation work:

| Gate | Needed by | Checkable condition |
| --- | --- | --- |
| Node 24.x | Task 1 | `node --version` reports v24; the same major is declared in `package.json` |
| Isolated Supabase development/test environment | Task 3 | Verified project/local URL, publishable key, two fictional users, and an identified nonproduction database; no existing live data is reset |
| Supabase CLI | Task 3 | Installed version and relevant `--help` checked; migrations and types reproducible |
| OpenRouter access and spending settings | Task 9 | Server key configured without printing it; exact model/provider and structured-output support recorded before a live evaluation |
| Separate Node-RED runtime | Task 10 | Runs on Node 24 with local editor access; exported flow contains no token or credentials |
| Hosting authorization/configuration | Task 12 | Environment selected and approved before any external deployment; no purchase or production-data access implied by this plan |

Prefer a local Supabase stack if Docker is already available. Otherwise use a dedicated nonproduction Supabase project after identifying the intended project. Do not install Docker, reset an existing database, or substitute a JSON/localStorage backend silently. Tasks 1–2 remain independently executable while access is resolved.

## 2. File map and responsibility boundaries

Paths below are proposed files, not files already created. Keep domain tests beside the code, and database/HTTP integration tests under `tests/integration/`.

| Paths to create or modify | Responsibility | Task |
| --- | --- | --- |
| `package.json`, `package-lock.json`, `.nvmrc`, `vitest.config.mts`, `.gitignore`, `README.md` | Runtime, minimal test tooling, exact dependency versions, repeatable commands | 1 |
| `lib/domain/types.ts`, `lib/domain/money.ts`, `lib/domain/dates.ts`, corresponding `.test.ts` files | Shared money/date contracts and validation | 1 |
| `lib/domain/forecast.ts`, `lib/domain/forecast.test.ts`, `tests/fixtures/business.ts` | Pure forecast/scenario calculations and independent sample cases | 2 |
| `supabase/config.toml`, CLI-generated migrations, `lib/database.types.ts`, `scripts/seed-demo.mjs`, `tests/integration/helpers.ts`, `tests/framework/server-only.ts` | Schema, atomic functions, RLS, test fixtures and fictional seed setup | 3–5, 7–10 |
| `lib/supabase/server.ts`, `lib/supabase/browser.ts`, `lib/supabase/proxy.ts`, `lib/supabase/admin.ts`, `proxy.ts` | Request-scoped auth clients; isolated administrative setup/automation access | 3 |
| `lib/server/auth.ts`, `lib/server/workspace.ts`, `lib/server/commands.ts`, `lib/domain/commands.ts`, `.env.example` | Authorized snapshot, typed commands and boundary validation | 3–4 |
| `tests/integration/access.test.ts`, `records.test.ts`, `payments.test.ts`, `collections.test.ts`, `reminders.test.ts`, `automation.test.ts` | Real database permissions, concurrency, rollback and retry checks | Respective tasks |
| `app/login/page.tsx`, `app/login/actions.ts`, `app/(workspace)/layout.tsx`, `app/(workspace)/loading.tsx`, `app/(workspace)/error.tsx`, `app/page.tsx`, `app/layout.tsx`, `app/globals.css` | Login, protected shell, recoverable states, product identity | 3, 6 |
| `app/(workspace)/overview/page.tsx`, `app/(workspace)/invoices/page.tsx`, `app/(workspace)/invoices/[id]/page.tsx`, `app/(workspace)/expenses/page.tsx`, `app/(workspace)/actions.ts` | Three work areas and authenticated application actions | 6–8 |
| `components/workspace-shell.tsx`, `components/record-forms.tsx`, `components/payment-form.tsx`, `components/cash-forecast.tsx`, `components/collection-panel.tsx`, `components/reminder-panel.tsx`, `components/ai-assistant.tsx` | Accessible product controls, forms and contextual views | 6–9 |
| `lib/server/collections.ts`, `lib/server/reminders.ts`, `lib/domain/reminders.ts`, `lib/domain/reminders.test.ts` | Collection/task orchestration and reminder approval basis | 7–8 |
| `lib/server/ai.ts`, `lib/server/ai-context.ts`, `lib/domain/ai.ts`, `lib/domain/ai.test.ts`, `app/api/ai/route.ts`, `tests/integration/ai.test.ts`, `tests/fixtures/ai-replies.json`, `scripts/evaluate-ai.mjs` | Bounded provider request, output validation, quota and recorded evaluation | 9 |
| `lib/server/automation.ts`, `app/api/automation/followups/route.ts`, `automation/followups.flow.json`, `automation/settings.example.cjs` | Node-RED contract and limited server workflow | 10 |
| `tests/integration/acceptance.test.ts`, `docs/demo-and-verification.md` | Complete acceptance evidence, operational instructions and pitch facts | 11–12 |

Migration names are generated by `supabase migration new <name>` when executing each database task; record the resulting timestamped path in that task's completion notes. Names in this plan denote migration topics, not invented timestamp filenames. Keep SQL domain functions in their owning migration rather than creating a second unsynchronized schema directory.

## 3. Shared interfaces and database design decisions

These are implementation choices within the PRD. Keep these names consistent across tasks.

### Domain contracts

- `Cents = number`: a safe integer, never a floating-point peso amount. `LocalDate = string`: validated `YYYY-MM-DD`. `UUID = string`: validated UUID at external boundaries.
- `parseMoney(input: string, options?: { allowZero?: boolean }): Cents` trims outer whitespace, accepts digits with an optional one/two-digit decimal part, and rejects commas, currency text, negatives, exponent notation, empty strings, extra decimals and amounts over `99_999_999_999` centavos. Show the accepted input format beside amount fields. `formatPHP(cents: Cents): string` formats display only. `checkedSum(values: Cents[]): Cents` rejects unsafe aggregates.
- `manilaDate(now: Date): LocalDate`, `assertLocalDate(value: string): LocalDate`, and `addDays(date: LocalDate, days: number): LocalDate` perform date-only arithmetic without browser/server timezone drift.
- `ForecastInput = { referenceDate: LocalDate; availableCents: Cents; invoices: ForecastInvoice[]; expenses: ForecastExpense[] }`.
- `ForecastInvoice = { id: UUID; outstandingCents: Cents; expectation: { id: UUID; date: LocalDate; remainingCents: Cents; kind: 'assumption' | 'commitment'; needsReview: boolean } | null }`.
- `ForecastExpense = { id: UUID; dueDate: LocalDate; unpaidCents: Cents }`.
- `ForecastResult = { days: ForecastDay[]; firstShortage: { date: LocalDate; shortfallCents: Cents } | null; maxShortfallCents: Cents; incompleteInvoiceIds: UUID[]; staleExpectationIds: UUID[]; overdueExpenseIds: UUID[] }`.
- `ForecastDay = { date: LocalDate; expectedInCents: Cents; plannedOutCents: Cents; closingCents: Cents; invoiceIds: UUID[]; expenseIds: UUID[] }`.
- `calculateForecast(input: ForecastInput): ForecastResult`; `compareScenario(input: ForecastInput, override: { invoiceId: UUID; date: LocalDate; amountCents: Cents }): { baseline: ForecastResult; scenario: ForecastResult }`. Override is ephemeral; it may explicitly simulate a currently missing/stale expectation, labelled as a scenario assumption.

`WorkspaceSnapshot` contains the fixed business/cash cutoff, server-authorized actor and member labels, workspace `revision`, normalized customers/invoices/expenses, current expectations, task/reminder summaries, automation health, and `forecastInput`. SQL derives paid/outstanding/unpaid amounts and available cash from valid movements. Return these aggregates, not an arbitrarily truncated movement history. Detail/history reads are separately paginated. If the supported 1,000-invoice/expense demo size is exceeded, show an explicit size limit rather than silently omitting money.

### Application command contract

`WorkspaceCommand = { requestId: UUID; expectedRevision: number; type: CommandType; payload: object }`, implemented as a Zod discriminated union in `lib/domain/commands.ts`.

`CommandType` is limited to `set_opening_cash`, `save_customer`, `save_invoice`, `save_expense`, `post_cash_movement`, `void_cash_movement`, `confirm_expectation`, `save_followup`, `complete_followup`, `save_reminder`, `submit_reminder`, `approve_reminder`, `reject_reminder`, and `report_manual_send`.

Payload field names are fixed below. Monetary fields are `Cents`, IDs are `UUID`, dates are `LocalDate`, and text is `string`. A missing optional `id` creates a record; a supplied `id` edits it. Reject unknown fields.

| Command | Payload fields |
| --- | --- |
| `set_opening_cash` | `amountCents`, `date` |
| `save_customer` | `id?`, `name`, `contactName`, `email?`, `phone?` |
| `save_invoice` | `id?`, `number`, `customerId`, `amountCents`, `dueDate`, `reason?` |
| `save_expense` | `id?`, `label`, `payee`, `amountCents`, `dueDate`, `reason?` |
| `post_cash_movement` / `void_cash_movement` | The explicit Task 5 payloads |
| `confirm_expectation` | `invoiceId`, `amountCents`, `date`, `kind: 'assumption' \| 'commitment'`, `sourceNote`, `nextFollowupDate`, `assigneeId` |
| `save_followup` | `id?`, `invoiceId`, `expectationId?`, `assigneeId`, `date`, `nextAction` |
| `complete_followup` | `followupId`, `outcome`, `nextAction?`, `nextDate?`, `assigneeId?`; next fields required together while invoice unresolved |
| `save_reminder` | `id?`, `invoiceId`, `recipient`, `body` |
| `submit_reminder` / `approve_reminder` | `reminderId`, `draftVersion: number`, `basis` |
| `reject_reminder` | `reminderId`, `draftVersion: number`, `reason` |
| `report_manual_send` | `reminderId`, `draftVersion: number`, `basis`, `channel`, `reportedSentAt: UTC ISO timestamp` |

Record text limits: names/labels/recipient 200 characters, invoice/reference identifiers 100, notes/reasons/outcomes 4,000, reminder body 2,000. Reject empty required text. Preserve Unicode names. A manual-send timestamp cannot be later than the current server timestamp; fictional sample notes do not prove delivery.

`runCommand(command: WorkspaceCommand): Promise<CommandResult>` in `lib/server/commands.ts` validates input, obtains the current actor, and calls the transactional database command. `CommandResult = { revision: number; recordId: UUID; replayed: boolean }`. Server Actions return `ActionResult<T> = { ok: true; data: T } | { ok: false; code: ErrorCode; message: string; fieldErrors?: Record<string,string> }`.

Error codes: `UNAUTHENTICATED`, `FORBIDDEN`, `VALIDATION_ERROR`, `NOT_FOUND`, `STALE_VERSION`, `DUPLICATE_REFERENCE`, `POSSIBLE_DUPLICATE`, `REQUEST_ID_REUSE`, `LIMIT_REACHED`, `SERVICE_UNAVAILABLE`. Map them to 401/403/422/404/409/409/409/409/429/503 for HTTP routes. Keep Server Action errors structured; never expose SQL/provider stacks.

`getWorkspace(): Promise<WorkspaceSnapshot>` and `getRecordHistory(kind: 'invoice' | 'expense', id: UUID, cursor?: string): Promise<{ events: AuditEvent[]; nextCursor: string | null }>` reauthorize on each request. History pages contain 20 events in deterministic timestamp/ID order. `requireActor(): Promise<{ userId: UUID; businessId: UUID; role: 'owner' | 'finance' }>` checks verified identity plus current database membership; do not accept a role/business from the browser or editable profile metadata.

### Persistence and authorization

Use public tables with RLS and explicit grants, plus a non-exposed `private` schema for transactional implementations:

| Table | Essential data/constraint |
| --- | --- |
| `businesses` | PHP, opening date/cents, `revision`, demo flag/reference date, AI daily limit 50; opening lock after first actual movement |
| `memberships` | `(business_id,user_id)` key; owner/finance role and display label; no self-service role changes |
| `customers` | Business, name, contact name and optional email/phone; same-business references |
| `invoices`, `expenses` | Business, number/label, total cents, original due date, invoice customer/expense payee, created/updated timestamps; composite same-business foreign keys |
| `cash_movements` | Receipt/expense-payment kind, exactly one matching parent, amount/date/reference, request ID, void reason/actor/time, immutable effect metadata used for corrections |
| `expectations` | Invoice, original promised/assumed amount, remaining amount/date, kind, state `active/needs_review/superseded/fulfilled`, source note and confirmed actor/time; at most one active-or-needs-review row per invoice |
| `followups` | Invoice, optional expectation, assignee/date/outcome/next action; state and completion source; unique automatic expectation/type key and correction movement key |
| `reminders` | Invoice, recipient snapshot, body/version, state, approval basis, reviewer/time/rejection reason, optional manual-send report |
| `command_receipts` | Business/request ID unique, canonical payload digest, original result; supports safe retries |
| `audit_events` | Business, actor, entity, before/after or precise change, UTC time and correction reason; append-only to application users |
| `automation_runs` | Business, run ID, start/finish/status/error code; last-success derived without touching financial revision |
| `ai_usage` | Business and Manila date unique; atomically reserved request count, model/provider and minimal outcome metadata; no full customer text in logs |

Mutable customers, invoices, expenses, expectations, follow-ups and reminders carry an integer `version` incremented on change, in addition to the workspace revision. Reminder approval bases use the relevant record versions. Automation-run health and AI usage reservations do not advance the financial/workflow revision. Business command writes and automatic follow-up changes do.

`private.reference_date(business_id uuid) returns date` supplies the authoritative transaction date: Manila's server date, or the configured fixed date only for a business marked fictional demo. All cutoff/future/stale checks use it. The snapshot supplies this same reference date to TypeScript and the UI. Neither a browser payload nor Node-RED may override it.

AI quota days, audit timestamps, manual-send report validation and automation's 30-minute health clock always use actual server time, even in fictional-date mode. Only the financial schedule/forecast clock is simulated.

RLS permits only current members' reads; membership rows expose the current user's membership. Use an authorized snapshot function for the two member display labels. Revoke direct INSERT/UPDATE/DELETE from `anon` and `authenticated` on business tables. An authenticated user cannot bypass financial/approval rules using Supabase's REST API.

Public RPC wrappers `workspace_snapshot`, `workspace_history`, and `workspace_command` are `SECURITY INVOKER`. Their private implementations have explicitly justified `SECURITY DEFINER`, empty `search_path`, fully qualified names, no dynamic SQL, an `auth.uid()` check and current membership/role verification. Revoke default PUBLIC/anon execute, grant only the necessary wrapper/private signatures to authenticated. These functions are an intentional, narrowly audited privilege boundary, not a fix for an RLS error. Private helpers are not exposed as REST endpoints.

For business writes, lock the business row first, then parent records in stable ID order. After authorization, check the existing request ID **before** rejecting an old revision: an exact retry must return the original result. A reused ID with changed payload fails. A new command compares the revision, validates current parent balances, writes all changes/audit/receipt, and increments the revision in one transaction. Failed commands leave no partial write. One global business revision is a deliberate small-team simplification; UI retries never silently overwrite unseen changes.

Normal app operations use the user's cookie-bound Supabase client. A separate `server-only` administrative client is restricted to the token-authenticated automation route; it must not replace user authorization in general application actions. Standalone seed/test scripts instantiate their own administrative client after checking their intended nonproduction environment; do not import Next.js `server-only` modules into ordinary Node scripts. Automation RPC execute is granted only to `service_role`; its business ID is fixed by the server and cannot be supplied by Node-RED.

## 4. Ordered implementation tasks

### Task 1: Establish the runtime and money/date test foundation

**Dependencies:** None. **Files:** `package.json`, `package-lock.json`, `.nvmrc`, `vitest.config.mts`, `.gitignore`, `README.md`, `lib/domain/{types,money,dates}.ts`, `lib/domain/{money,dates}.test.ts`.

**Interfaces:** Produces `Cents`, `LocalDate`, `UUID`, `parseMoney`, `formatPHP`, `checkedSum`, `manilaDate`, `assertLocalDate`, `addDays` as defined above. Add `test:unit = vitest run lib/domain`, `typecheck = next typegen && tsc --noEmit`; preserve existing dev/build/lint commands.

- [x] Select Node 24.x; set `.nvmrc` to `24` and `engines.node` to `24.x`. Record original baseline results from `npm run lint` and `npm run build`; diagnose existing failures separately. Install exact compatible versions of Vitest and Zod, recording versions in the lockfile. Configure Vitest's Node environment; no DOM/React testing packages yet.
- [x] Write the following money/date assertions plus invalid-input cases for empty text, `1e3`, `1,000`, `0.001`, negative amounts, a value over the record limit, invalid leap dates, and unsafe sums:

```ts
expect(parseMoney('40000.00')).toBe(4_000_000);
expect(parseMoney('0', { allowZero: true })).toBe(0);
expect(() => parseMoney('0')).toThrow();
expect(checkedSum([4_000_000, 2_000_000])).toBe(6_000_000);
expect(manilaDate(new Date('2026-10-26T16:00:00Z'))).toBe('2026-10-27');
expect(addDays('2026-10-26', 29)).toBe('2026-11-24');
expect(() => assertLocalDate('2026-02-30')).toThrow();
```

- [x] Run `npm run test:unit -- lib/domain/money.test.ts lib/domain/dates.test.ts`; confirm failure from missing domain implementations, not broken tooling.
- [x] Implement the declared functions. Convert decimal strings by splitting digits and padding centavos, not by multiplying `parseFloat`. Date arithmetic must validate round trips and remain timezone-independent. Run the same tests and `npm run typecheck`; require all pass.
- [x] Commit only this task's files: `test: establish money and date contracts`. Record installed versions and baseline failures, if any, in the task notes.

### Task 2: Implement the forecast and temporary scenario engine

**Dependencies:** Task 1. **Files:** `lib/domain/forecast.ts`, `lib/domain/forecast.test.ts`, `tests/fixtures/business.ts`.

**Interfaces:** Consumes the money/date helpers; produces `calculateForecast` and `compareScenario`. Fixtures export `initialCase()`, `delayedCase()`, and `partialCase()` returning independent `ForecastInput` objects. The first two use October 26; the partial case uses October 29 so its recorded receipt is not a future actual movement.

- [x] Write tests for the three sample cases and the review-focus date/window cases:

```ts
expect(calculateForecast(initialCase()).days).toHaveLength(30);
expect(calculateForecast(initialCase()).days.at(-1)?.date).toBe('2026-11-24');
expect(calculateForecast(initialCase()).firstShortage).toBeNull();
expect(calculateForecast(delayedCase()).firstShortage)
  .toEqual({ date: '2026-10-30', shortfallCents: 4_000_000 });
expect(calculateForecast(partialCase()).firstShortage?.shortfallCents).toBe(2_000_000);
```

Also assert initial Friday closing cash `1_000_000`, delayed Monday closing cash `1_000_000`, stale inflow excluded, overdue unpaid expense charged on the reference date, unplanned partial remainder flagged, zero remaining expectation excluded, safe aggregate failure, and an expectation outside the window excluded. A scenario must leave a deep-frozen input unchanged, reject negative/over-outstanding amounts, and allow zero as an explicit no-receipt scenario.
- [x] Run `npm run test:unit -- lib/domain/forecast.test.ts`; confirm a genuine red test.
- [x] Implement a 30-element daily accumulator with source IDs. Apply due-now expenses and exclude needs-review/stale expectations. Return positive shortfall magnitudes while retaining negative daily closing balances. No random/probabilistic forecasting and no AI calls.
- [x] Run unit tests and type checking. Add a deterministic 1,000-record fixture and measure computation separately from database/network time; require the PRD's one-second computation target on the demo machine, recording the measured duration.
- [x] Commit `feat: calculate traceable cash forecasts and scenarios`.

### Task 3: Establish authenticated persistence and protected reads

**Dependencies:** Task 1; identified Supabase test environment. **Files:** Supabase config, CLI-generated `workspace` migration, Supabase clients/proxy, `lib/server/auth.ts`, `lib/server/workspace.ts`, generated `lib/database.types.ts`, login files, `.env.example`, `scripts/seed-demo.mjs`, `tests/integration/helpers.ts`, `tests/integration/access.test.ts`, Vitest integration configuration and README.

**Interfaces:** Produces `requireActor`, `getWorkspace`, `getRecordHistory`, `WorkspaceSnapshot`, and `private`/public read-RPC boundaries. Test helpers export `createTestBusiness()`, `signInAs(role)`, `callCommand(client, command)`, and `disposeTestBusiness(fixture)`; administrative cleanup touches only IDs created by that test fixture.

- [x] Install exact `@supabase/supabase-js`, `@supabase/ssr` and CLI versions; inspect CLI help. Create the core schema/RLS migration using the documented CLI workflow. Include all table responsibilities above, with later command functions added by their owning tasks. Add `test:integration` as a separate non-skipping Vitest run over `tests/integration`. Missing test credentials must fail this command clearly rather than report a pass. Use built-in `process.loadEnvFile` for the ignored `.env.test.local`, with no fallback to a live environment.
- [x] Write real API access tests: anon cannot read records; owner/finance can read their own snapshot; a separate test business cannot be read or referenced; direct table writes and role self-promotion fail. After opening an owner session, change its database membership to finance or remove it; the next authorized operation must reflect that change. Do not count an RLS test using only a service-role client as authorization evidence.
- [x] Run integration tests; verify the expected permission/schema failure before installing the implementation. Implement current-cookie clients with `getClaims()` verification, per-request server clients and current-membership lookup. Configure `proxy.ts` to preserve refreshed cookies and cache-control headers. No public signup flow; configure two provisioned fictional accounts. Keep key values out of stdout and committed fixtures.
- [x] Apply the migration to the identified nonproduction environment, generate real database types, and run access tests. Verify login/logout/expired-session recovery in a real browser, and preserve `cacheComponents` using `Suspense` around authenticated content. Do not use shared caching for user financial snapshots.
- [x] Commit `feat: secure the single-business workspace`. Record migration filename, CLI/package versions and environment label without secrets.

### Task 4: Save operational records through atomic commands

**Dependencies:** Task 3. **Files:** `lib/domain/commands.ts`, `lib/server/commands.ts`, CLI-generated `record_commands` migration, `tests/integration/records.test.ts`; extend test fixtures and generated database types.

**Interfaces:** Produces the `WorkspaceCommand` union, `runCommand`, `ActionResult`, and `workspace_command` dispatcher. Implement `set_opening_cash`, `save_customer`, `save_invoice`, `save_expense`; define later command variants in their owning tasks, not empty executable handlers.

- [x] Write red tests: opening cash is owner-only; parent/customer IDs must belong to this business; invalid totals/dates fail; a new invoice gets a labelled due-date assumption; an exact request retry returns `replayed: true`; same request ID/different payload fails; stale revisions cannot overwrite. Seed a posted movement through the test setup and prove opening cash locks afterward.
- [x] Run `npm run test:integration -- tests/integration/records.test.ts`; confirm the new contract fails before implementation.
- [x] Implement transactional SQL validation and append-only audit with the lock/retry order above. Disallow `businessId`, actor, approval or role overrides in request payloads. Return structured command errors. Add a supported invoice/expense correction path with owner-only total/due-date corrections after posting and a floor equal to valid linked payments; lock identity/counterparty once any movement has been posted.
- [x] Run access/record integration tests and unit tests. Force an audit/write failure in the isolated test database and verify record/revision/request receipt all roll back; remove the test-only fault mechanism afterward. Confirm direct REST writes still fail.
- [x] Commit `feat: save validated operational records atomically`.

### Task 5: Post, retry, and correct actual money movements

**Dependencies:** Tasks 2 and 4. **Files:** CLI-generated `cash_movements` migration, command schemas, snapshot aggregation, `tests/integration/payments.test.ts`, sample fixtures.

**Interfaces:** Add `post_cash_movement` payload `{ kind: 'receipt' | 'expense_payment'; parentId: UUID; amountCents: Cents; date: LocalDate; reference: string; duplicateReviewed?: boolean; duplicateReviewReason?: string }`; add owner-only `void_cash_movement` payload `{ movementId: UUID; reason: string }`. The outer envelope supplies request ID/revision. Preserve effect metadata needed to reopen auto-resolved follow-ups correctly.

- [x] Write tests for actual partial/full receipt and expense payment, cutoff/future-date rejection, overpayment rejection, duplicated request/reference, possible duplicate warning and reviewed override. Normalize references with trim/case-folding; nonempty references remain unique within the business, including void history. A corrected entry uses a new reference and retains the original movement in its audit explanation.
- [x] Add the exact retry-after-timeout test and two simultaneous `20_000`-peso receipt attempts against a `30_000`-peso remaining balance. At most one new attempt can post; the other must conflict. Assert sample receipt results: cash `6_000_000`, outstanding/remaining expected `3_000_000`, Friday shortfall `2_000_000` centavos.
- [x] Run red integration tests, then implement all effects in one SQL transaction. Query authoritative unpaid totals while locked, reduce the current expectation by the valid receipt amount bounded at zero, resolve only applicable automatic tasks, invalidate affected reminder approvals and bump the revision. Record actual cash independently from promises.
- [x] Test void: cash returns to `4_000_000`, outstanding to `5_000_000`, latest expectation becomes needs-review and adds no projected inflow; never revive a superseded promise. Reopen only a task auto-resolved by that movement; otherwise attach/create the duplicate-safe correction task. Human-completed tasks stay completed. Test repeated void, failed transaction and subsequent authorized total/date correction. Run all access/record/payment tests.
- [x] Commit `feat: record and correct duplicate-safe cash movements`.

### Task 6: Deliver the first usable financial workflow

**Dependencies:** Tasks 2–5. **Files:** protected layout/states and overview/invoice/detail/expense routes; `app/(workspace)/actions.ts`; `components/{workspace-shell,record-forms,payment-form,cash-forecast}.tsx`; root page/layout/CSS; demo seed script; README.

**Interfaces:** Server pages consume `getWorkspace()` and `calculateForecast(snapshot.forecastInput)`. `executeWorkspaceAction(command: unknown): Promise<ActionResult<CommandResult>>` validates and delegates to `runCommand`, then refreshes affected paths. Client forms preserve inputs and request IDs on recoverable failures and render fresh values after a conflict.

- [x] Read Taste's `references/app-screens.md` and the installed Next.js guidance for request-time rendering. Select one app design direction, keeping the existing stack; put design working files in ignored `.taste-skill/`. Use native controls, semantic tables and an accessible SVG line chart plus a daily text/table alternative; no chart/component framework solely for this screen.
- [x] Create one shared shell naming the product, business and signed-in role. Add three navigation areas, clear data freshness/cutoff information and visibly labelled fictional-date mode. Login redirects to `/overview`; protect every action independently of the layout. Add loading, empty, failure and retry states.
- [x] Wire customer/invoice/expense/opening-cash forms and verified receipt/expense-payment forms to the real database command path. After saving, refetch the snapshot; never show an optimistic payment as posted before confirmation. Show available cash separately from expected receipts, first shortage, largest shortfall and contributing records.
- [x] Verify in a real browser: enter the sample records, record a receipt, refresh and re-login, then verify the exact saved balances/forecast as both roles. Use a fixed demo reference date October 29 for the interactive payment story, labelled everywhere; the opening cutoff remains October 26. Calculation tests retain the walkthrough's original October 26–November 24 horizon. Date mode is server configuration of the fictional business, never an untrusted URL/browser override.
- [x] Run lint, typecheck, unit and integration tests, and the production build; inspect keyboard flow and 390/768/1440px layouts. Commit `feat: deliver the persistent cash planning workspace`. **Milestone:** this is the first complete working financial slice; do not substitute static mockups for it.

### Task 7: Connect commitments, follow-ups, history and scenarios

**Dependencies:** Tasks 5–6. **Files:** collections migration, `lib/server/collections.ts`, command schemas/actions, `components/collection-panel.tsx`, invoice detail and overview, `tests/integration/collections.test.ts`.

**Interfaces:** Add `confirm_expectation` payload `{ invoiceId; amountCents; date; kind; sourceNote; nextFollowupDate; assigneeId }`; add `save_followup` and `complete_followup` with explicit outcome, next action/date and assignee. All IDs/dates are validated. `previewExpectation(input: ForecastInput, proposal: { invoiceId; date; amountCents }): { baseline; scenario }` delegates to `compareScenario`; this preview performs no write.

- [x] Write tests: confirmation changes expected cash/date but not available cash or original due date; one active expectation; partial promise leaves visible unplanned remainder; supersession preserves history and resolves old automatic tasks without recording payment; assignee must be a current same-business member; unresolved follow-up completion requires an outcome/next action/date. Stale confirmation after another update fails.
- [x] Run red tests, then implement commitment/task commands and invoice history reads. Retain pasted customer replies as source notes; a reply proposing several installments requires staff to select one active expectation. Do not compress multiple dates into an invented installment schedule.
- [x] Implement collection filters for unpaid/due/overdue, current promise/source, needs-review/no-expectation/no-next-action, and the next follow-up. Add contextual history with pagination. Void/correction events must be understandable and link to the retained record.
- [x] Add a single unsaved scenario control to overview/invoice detail. Show before/after first-shortage date and amount, ending cash and remaining uncertainty; discarding or navigating away clears it. Verify delayed sample receipt changes Friday from `+10_000` to `-40_000` pesos and saving a promise leaves real cash unchanged. Run collection/payment tests and check concurrent changes in two browser sessions.
- [x] Commit `feat: connect customer commitments to cash actions`.

### Task 8: Implement versioned reminder approval and manual sending

**Dependencies:** Tasks 6–7. **Files:** reminders migration, `lib/domain/reminders.ts`, `lib/domain/reminders.test.ts`, `lib/server/reminders.ts`, `components/reminder-panel.tsx`, command schemas/actions, `tests/integration/reminders.test.ts`.

**Interfaces:** `reminderBasis(input: { invoiceId; invoiceVersion; outstandingCents; contactVersion; expectationId; expectationVersion; referenceDate }): string` returns a deterministic digest. `getApprovedReminderText(id: UUID): Promise<ActionResult<{ text: string }>>` rechecks current authorization and approval basis immediately before copying. Add reminder command variants for save, submit, approve, reject and report-manual-send; approval references the exact draft version/basis.

- [ ] Write domain/integration tests for the state sequence Draft → Awaiting review → Approved → optional Reported sent manually, owner-only approval, rejection reason, and renewed review after body/recipient/balance/commitment/contact changes. Changing the relevant reference date also requires review if the wording depended on that date.
- [ ] Run red tests, then implement state transitions and approval invalidation inside database transactions. Save the recipient snapshot and exact approved body/version. A stale global revision rejects confirmation; unrelated changes need a refreshed confirmation but do not erase a still-valid historical approval automatically.
- [ ] Add a deterministic non-AI reminder template, editable preview, owner review controls and copy action using the server-checked approved text. Draft for the outstanding balance; never the original total after a part payment. Avoid claiming email/phone validation establishes delivery.
- [ ] Verify copy failure/fallback, stale draft in a second session, finance rejection on direct approval requests and manual-send reporting with channel/user-entered time. Show explicit labels: copying is not delivery; reported sending is unverified. Run reminder/access/payment tests and browser checks.
- [ ] Commit `feat: review and approve accurate payment reminders`.

### Task 9: Add bounded AI assistance and evaluate it

**Dependencies:** Tasks 6–8; configured OpenRouter gate. **Files:** AI usage migration/functions, AI domain/server/context modules, AI route and component, test/evaluation fixtures and script, `.env.example`, verification document.

**Interfaces:** `AiRequest = { task: 'explain' | 'extract_reply' | 'draft_reminder'; invoiceId?: UUID; reply?: string; tone?: 'polite' | 'firm'; expectedRevision: number }`. `requestAssistant(input: AiRequest): Promise<AiProposal>` retrieves authorized data itself. Extraction/drafting require the selected `invoiceId`; extraction additionally requires nonempty `reply`. `AiProposal` is discriminated by `task`, matching the request's literal: explanation adds `{ summary: string; recordIds: UUID[] }`; extraction adds `{ invoiceId: UUID | null; amountCents: Cents | null; date: LocalDate | null; reason: string | null; sourceQuotes: string[]; needsReview: boolean; issues: string[] }`; draft adds `{ body: string; recipient: string; invoiceId: UUID }`. Every response also has `sourceRevision: number`. It never executes a workspace command.

- [ ] Create 15 fictional evaluation replies: ten explicit single-invoice/amount/date examples and five cases covering ambiguous date, conflicting amounts, multiple installments, claimed prior payment and prompt injection/other invoice reference. Write tests for invalid JSON/schema, unknown record IDs, over-balance amount, stale revision, missing amount/date as null, provider failure, 20-second abort and atomic 50-request daily cap. Reject a mismatched/missing Origin on the browser-only AI POST route and non-JSON bodies. Enforce the 16 KiB limit on actual bytes read, not only Content-Length; reply limit is 4,000 characters and draft body 2,000. Return a clear error on excess.
- [ ] Run red tests. Implement `fetch` against the OpenRouter chat completion endpoint rather than adding another AI SDK. Validate the request/response with Zod. Load only the selected invoice/current forecast facts; allowlist returned source IDs. The model has no direct database/mutation/send tools. Show programmed amounts beside explanations, and source text beside proposed changes.
- [ ] Pin one supported model and exact provider endpoint in server configuration after checking current capabilities, privacy settings and cost. Require supported structured-output parameters and disable fallback routing. Missing configuration returns a recoverable unavailable state. Reserve usage atomically before each outbound request; failed attempts still consume that day's slot. No indefinite retries; at most one in-flight request per assistant panel. Keep full messages out of diagnostics.
- [ ] Run mocked-provider integration tests, then `node --env-file=.env.test.local scripts/evaluate-ai.mjs` against the real configured model. In Vitest, alias `server-only` to the empty `tests/framework/server-only.ts` and mock the Next.js request-cookie adapter plus only outbound OpenRouter fetches; retain real signed-in Supabase clients and quota/membership checks. Direct handler tests do not prove real HTTP/session behavior, which Task 11 checks separately. The evaluation script uses `TEST_APP_BASE_URL`, `TEST_FINANCE_EMAIL` and `TEST_FINANCE_PASSWORD`, refuses a missing environment marker, signs in with the provisioned fictional account, and calls the running app with session cookies and the matching Origin. This exercises normal quota/context/output validation; the actual OpenRouter key stays in the app server environment. Record fixture IDs, expected/observed fields, model/provider, latency and usage/cost when supplied; redact keys and distinguish unavailable cost from zero. Require ≥9/10 correct explicit extractions, all five ambiguous/adversarial cases held for review and zero automatic writes. Record actual results; a failed live evaluation blocks claiming the AI feature complete.
- [ ] Verify human confirmation still uses Tasks 7–8's validated commands, stale proposals refresh, and manual entry/templates work with the AI key removed. Commit `feat: add evaluated AI explanations and proposals`.

### Task 10: Add the real Node-RED follow-up workflow

**Dependencies:** Tasks 7–8; separate Node-RED runtime. **Files:** automation migration/functions, `lib/server/automation.ts`, `app/api/automation/followups/route.ts`, flow/settings examples, `.env.example`, `tests/integration/automation.test.ts`, verification document.

**Interfaces:** The token-only HTTP endpoint accepts a discriminated body: `{ operation: 'scan' }`, `{ operation: 'create'; runId: UUID; expectationIds: UUID[] }`, or `{ operation: 'finish'; runId: UUID; success: boolean; errorCode?: string }`. Scan returns `{ runId; referenceDate; candidates: { expectationId; remainingCents; date }[] }`; create returns `{ created; existing; skipped }`; finish returns `{ completed: true }`. No customer contact data, caller-supplied business ID, arbitrary SQL or financial-write operation is accepted. Authorized manual checks call the same domain workflow through a user Server Action.

- [ ] Write tests: wrong/missing token fails; a valid token cannot approve reminders or post cash; passed date means strictly before today's Manila/reference date; scan/create rechecks current expectation state; repeated creation is unique by expectation/type; fulfilled/superseded/needs-review entries skipped; human-completed tasks not reopened; member manual checks use the same duplicate rules. Test two concurrent create calls.
- [ ] Add run and idempotent-task functions with server-fixed business scope. Restrict automation RPC grants to `service_role`; authenticated users cannot directly invoke them. Compare token digests with Node's constant-time crypto operations. Cap candidates/batches at 1,000 with explicit error instead of silently dropping work, and enforce a 64 KiB actual request-body limit; no broad administrative endpoint.
- [ ] Build the Node-RED flow: Inject every 900 seconds and on manual trigger → scan HTTP request → filter candidates → one create request (or none if empty) → finish success; Catch/HTTP-failure path → finish failure where reachable. Use only built-in nodes. Read app URL/token from the runtime environment, not exported JSON or Debug nodes. Bind the local editor to loopback; secure it before any network exposure.
- [ ] Import the actual flow and run it against the development app, not a mocked endpoint. Repeat the run, simulate an interrupted run and restart/catch-up, then record a receipt and run again. Record last attempt/success/error; UI is stale if a run never succeeded or success is over 30 minutes old. A failed connection before reaching the app cannot be recorded as a server-observed attempt; the stale notice must still expose the outage.
- [ ] Run automation/collection/payment tests and verify manual fallback in the browser. Commit `feat: automate missed-commitment follow-ups`. Record Node-RED version, run evidence and the laptop-sleep limitation.

### Task 11: Verify the complete MVP against the PRD

**Dependencies:** Tasks 1–10. **Files:** `tests/integration/acceptance.test.ts`, relevant owning tests, `docs/demo-and-verification.md`; change product files only for a demonstrated failure.

**Interfaces:** Reuses all prior contracts. Add `verifyAcceptanceFixture()` in the acceptance test file rather than another application abstraction. Test fixtures are isolated from the interactive demo business.

- [ ] Exercise AC-01 through AC-13 using independent sample cases and the coverage table below. In integration tests, use real authenticated clients and database commands; mock only the external model for repeatability. Preserve Task 9's separate real-model evidence.
- [ ] Run `npm run test:unit`, `npm run test:integration`, `npm run typecheck`, `npm run lint`, and `npm run build` on Node 24. No missing-environment skips count as passing integration evidence. Fix failures in the owning code and add a regression case where meaningful.
- [ ] Use `npm run start` and real browser interaction at 390/768/1440px. Check keyboard-only completion, accessible names/focus, recoverable validation, empty/loading/failure/AI-unavailable/stale-automation states, reload/re-login, two-session conflicts and session expiry while a form is open. Set `TEST_APP_BASE_URL` to this isolated running app and add real HTTP checks for unauthenticated AI access, mismatched Origin, invalid automation token and a valid user session after proxy refresh; these must not call the paid model. Evaluate async Server Components in the browser rather than pretending Vitest rendered them.
- [ ] Measure normal save/refetch time and forecast computation on the 1,000-record dataset. Record actual device/network conditions against the two-second record-operation and one-second computation targets. Check no keys/customer message bodies appear in browser bundles, responses, public flow exports or diagnostics. Review RLS/function grants and dependency audit findings without blanket upgrades or disabling checks.
- [ ] Commit `test: verify the integrated cash-flow planning MVP` with an evidence table listing commands, outcomes, limitations and reviewer identity if a real user walkthrough occurred. Do not assign fabricated time savings, willingness to pay or judge scores.

### Task 12: Prepare the reproducible demo and hosting handoff

**Dependencies:** Task 11. **Files:** `README.md`, `.env.example`, `docs/demo-and-verification.md`, demo seed script, optional small deployment configuration changes justified by verification.

**Interfaces:** `node --env-file=.env.local scripts/seed-demo.mjs` provisions fictional users/data only when an explicit demo marker and intended environment are present; it refuses live/unknown environments. User-provided passwords come from uncommitted environment values, never committed defaults. Seed reset is not a public HTTP feature.

- [ ] Document installation, exact Node/package/CLI versions, environment variable names, migrations, first setup and how to run the app and separate Node-RED process. Distinguish development, integration-test and demo environments. Keep `.env.example` placeholders visible in Git by explicitly allowing that one file in `.gitignore`.
- [ ] Record service settings without secrets: Supabase environment and role configuration, chosen OpenRouter model/provider/limit, demo reference date, Node-RED host/bind address and Vercel runtime. Required names: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server/setup only), `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `OPENROUTER_PROVIDER`, `AUTOMATION_TOKEN`, `AUTOMATION_BUSINESS_ID`; Node-RED uses `APP_BASE_URL` and its environment token. Test-only variables use `TEST_` prefixes and never point silently to production.
- [ ] Prepare the demonstration: original due-date assumption → customer promises Monday → Friday gap → owner-reviewed reminder → verified partial payment → smaller gap → missed-commitment check. Identify what remains uncertain and what the owner still decides. Use independent seed cases or explicitly advance the fictional date; never show a future actual receipt as current real cash.
- [ ] Prepare the Vercel configuration and an exact deployment procedure. Run it only after the intended destination/environment is authorized. Then smoke-test login, saved payment, forecast, approved-copy flow, real AI request and Node-RED connectivity against the deployed build. If authorization or a provider is unavailable, retain the working local demo and label the unverified remote component; do not call it deployed.
- [ ] Commit `docs: prepare the verified demo and deployment handoff`. Before any real-data pilot, separately verify backup/export/restore, continuous automation hosting, data handling and operating costs. These are launch gates, not completed hackathon capabilities.

## 5. Coverage and delivery sequence

| PRD requirement | Owning tasks | Evidence |
| --- | --- | --- |
| FR-01 / AC-01 | 3–4, 8, 10–11 | Authenticated/anonymous/cross-business/direct-write/role-change tests |
| FR-02 / record corrections | 1, 3–4, 6 | Validated record forms, permissions and audit |
| FR-03 / AC-03–05, AC-12 | 4–6, 11 | Real partial/full payments, idempotency, rollback, void and concurrent writes |
| FR-04 / AC-02, AC-06 | 1–2, 5–6, 11 | Exact sample arithmetic, overdue/stale/window rules and source-linked UI |
| FR-05–06 / AC-08, AC-12 | 7, 9, 11 | Commitments/tasks/history and reviewed message-to-plan updates |
| FR-07 / AC-10 | 8, 11 | Versioned owner approval, invalidation and honest manual-send labels |
| FR-08 / AC-07 | 2, 7, 11 | Read-only scenario and unchanged source records |
| FR-09 / AC-08–09 | 9, 11 | Mocked failures plus recorded real-model evaluation |
| FR-10 / AC-11 | 10–11 | Imported working Node-RED flow, repeat/catch-up and stale-state evidence |
| FR-11 / AC-12 | 3–5, 7–8, 11 | Transactional audit, correction history and stale-confirmation handling |
| AC-13 / usability | 6–11 | Production-build browser checks, keyboard/mobile/error states |
| Sustainability/practicality/feasibility | 9–12 | Measured operation/model usage, supported manual fallback, reproducible setup and clearly unverified commercial claims |

Target checkpoints use consecutive calendar days within the remaining two-week budget, not fourteen working days. Record the organizer's actual deadline before execution and shorten this schedule if fewer days remain; preparing a plan does not restart the user's countdown. These are targets, not a guarantee of completion:

| Calendar build days | Target |
| --- | --- |
| 1–2 | Tasks 1–3: calculation tests and real access/persistence gate |
| 3–5 | Tasks 4–6: atomic financial operations and first complete browser workflow |
| 6–8 | Tasks 7–8: commitments, scenarios, history and approvals |
| 9–10 | Tasks 9–10: evaluated AI and real Node-RED flow |
| 11–12 | Task 11: integrated correctness/security/usability checks |
| 13–14 | Task 12: fixes, rehearsal, evidence and authorized hosting handoff |

Tasks are dependent: execute in order; individual tests within a task can run concurrently where isolated. If access is unavailable, continue independent pure-domain work and report the precise integration gate. If the first complete financial slice slips beyond day 5, surface the schedule risk before adding polish. Do not silently drop a PRD P0 feature, replace real integrations with unlabeled mocks, or remove money/security tests to fit the deadline. Scope changes belong in an explicit PRD decision.

## 6. Verification references and plan self-review

Documentation checked for this plan on October 27, 2026:

- Installed Next.js guides: `node_modules/next/dist/docs/01-app/02-guides/authentication-with-cache-components.md`, `02-guides/server-actions.md`, `02-guides/testing/vitest.md`, and `01-getting-started/15-route-handlers.md`. Request-time auth needs a boundary; actions reauthorize; Vitest is not evidence for async Server Component rendering.
- [Supabase SSR clients](https://supabase.com/docs/guides/auth/server-side/creating-a-client) and [database functions](https://supabase.com/docs/guides/database/functions): request-scoped auth, cookie/refresh handling, and careful function privilege boundaries. The changelog Markdown index could not be fetched by the web reader; recheck relevant changes before installing chosen versions.
- [Vitest setup](https://vitest.dev/guide/): use its Node test environment for domain/integration tests; record the installed compatible version rather than inventing one here.
- [OpenRouter structured outputs](https://openrouter.ai/docs/guides/features/structured-outputs) and [provider selection](https://openrouter.ai/docs/guides/routing/provider-selection): support and enforcement vary by endpoint; pin routing and validate responses regardless of requested schema.
- [Node-RED security](https://nodered.org/docs/user-guide/runtime/securing-node-red), [supported Node versions](https://nodered.org/docs/faq/node-versions), and [Vercel Node versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions): separate runtime, protected local editor, and Node 24 alignment. No service access or deployment was verified by reading these pages.

Self-review of this plan: every FR/AC has an owning task above; the five Review Focus conditions have explicit tests; domain names and units are shared; migrations remain CLI-generated; infrastructure gates and author-selected defaults are stated. No product code, dependencies, database schema, service resources or deployments were created while preparing this plan.

## 7. Execution handoff

Recommended execution: **native**, one task at a time in this chat, with a review after the completed branch. The tasks share a single transaction/snapshot contract; a persistent implementer reduces repeated handoffs for this solo two-week build. An independent whole-branch review remains valuable before shipping.

Alternative: **subagent-driven**, using a fresh implementer and reviewer per task. This offers more independent checks but repeats context and increases coordination/cost. Follow the user's selected method and the applicable Superpowers execution skill; do not spawn agents merely because this plan lists the option.

Review this concrete plan and select the execution method before beginning implementation. Preserve existing user changes, including the renamed PRD, agent rules, ignore configuration and survey images. Never stage unrelated files automatically.
