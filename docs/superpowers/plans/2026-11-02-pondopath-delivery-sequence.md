# PondoPath Delivery Sequence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task by task. Steps use checkbox syntax for tracking. Bryan selected native execution. Deliver and review one slice at a time.

**Goal:** Finish a truthful, working hackathon demonstration of PondoPath, then deliver the approved data-intake ideas without weakening its financial safeguards.

**Architecture:** Keep the existing Next.js, Supabase, programmed forecast, OpenRouter text assistant, and Node-RED follow-up flow. All new sources feed one business-scoped Review Inbox: receive, validate and match, stage a proposal, obtain human review, apply an authorized command, and refresh the forecast and history. This file sets delivery order; the [detailed implementation plan](2026-10-27-cash-flow-action-planner.md) owns Tasks 11–21, exact interfaces, files, and acceptance checks.

**Tech Stack:** Next.js 16, TypeScript, Supabase, OpenRouter, Node-RED, planned n8n, Vercel only for an authorized deployment.

**Spec:** [SoloForge Cash-Flow Action Planner PRD v1.1](../specs/SoloForge_Cash-Flow_Action_Planner_PRD_v1.0.md), especially FR-01–FR-17 and AC-01–AC-20.

## Global constraints

- One private business per account, Philippine pesos, Asia/Manila dates. Public owners and invited finance teammates have different permissions.
- Programmed rules own balances, dates, duplicates, and access checks. AI can propose or explain; it cannot post cash, approve reminders, or send messages.
- A payment promise or message saying “paid” is not verified cash. Every imported or extracted change is reviewed before it reaches financial records.
- Manual forms and non-AI reminder templates remain usable when a provider or connector is unavailable.
- Use fictional data for the hackathon. Provider authorization, paid services, deployment, live messaging, and real customer data are separate gates.
- Run focused checks for each slice; run the full suite and production build once after the submitted feature set is frozen. Preserve unrelated worktree changes.

## Review focus

1. **New owner versus invited teammate (Tasks 11–12):** each reaches only the intended business and cannot acquire owner-only authority.
2. **Repeated or changed external row (Tasks 14–18):** retry does not duplicate a movement; a stale or conflicting proposal remains for review.
3. **Claimed or partial payment (Tasks 14, 19–20):** no imported text or image becomes available cash until staff verifies and confirms an actual movement.
4. **Source outage or revocation (Tasks 17–20):** connection status is visible; existing records and manual workflows remain available.
5. **Narrow screen (Tasks 11, 13):** Forecast, Follow-ups, next actions, and the assistant remain reachable without horizontal overflow or covered controls.

## Status and delivery decision — 2 November 2026

Tasks 1–10 are recorded complete. Task 11 remains partial: its final evidence record and remaining checks are outstanding. Task 12 is on hold. Task 13's current worklist has the focused browser/keyboard evidence recorded under Task B; adding intake reviews still depends on Task 14. Task 14 has an applied development database foundation and four focused integration tests; it has no user-facing Review Inbox yet. Tasks 15–21 have no completed delivery slice. The recorded 29 October full-suite results predate later uncommitted sign-up, UI, and intake changes and are not a final check of the current tree.

**Hackathon release boundary:** Complete Tasks 11 and 12, plus Task 13 if the next-action panel remains visible. Task 14 plus Task 15 is the preferred extra demonstration of reduced manual entry if it passes its own gate before feature freeze. Do not make Tasks 16–21 or an unverified provider part of a submission claim. The full product vision continues through Tasks 14–21 after the hackathon as separately reviewed slices.

### Task A: Confirm the submission boundary

**Files:** Update this delivery record and the eventual pitch/demo checklist; no product-code change.

**Owner:** Bryan took over Task A on 2 November. The organizer email and shared event brief confirm building through 8 November and Demo Day on 10 November; they do not give an exact submission hour. Bryan will handle the cutoff, form requirements, feature claims, and final preparation window. These steps remain unchecked until he confirms them.

- [ ] Record the organizer's exact submission cutoff, required PRD/deck/video/demo links, and whether a public deployed URL is required. The event date is not the submission cutoff.
- [ ] List only the capabilities that will be demonstrated as working. Mark the rest “planned” in the pitch and video.
- [ ] Reserve the last preparation window for one rehearsal, link checks, and submission rather than new features.

### Task B: Finish the next-action slice (detailed Task 13)

**Files:** Existing next-action helper/component, Overview and Follow-ups callers, and owning tests. The detailed plan defines the interface.

- [x] Check keyboard operation, source links, empty/stale states, and one narrow browser layout. Run the owning next-action tests and typecheck.
- [x] Show Bryan the reviewed current worklist. The later Review Inbox slice adds pending intake reviews to this same worklist.

**Evidence — 2 November:** The actual signed-in development app was measured at 390 × 843 CSS pixels. Overview and Follow-ups both had document/client widths of 390px; their current empty worklist fit within the page. Tab moved from the last Overview metric link to the next interactive control without trapping focus; the visible focus outline was present. Enter on the existing source-invoice link reached DEMO-001. The live demo had no pending worklist items, so populated action links and missed/completed/reminder states were checked through the owning helper/render fixtures, not presented as a populated live journey. A regression test exposed identical accessible names for actions on different invoices; link names now include both the action and source detail. Final checks: 13/13 tests across next-actions, Overview rendering and Follow-ups rendering; typecheck and changed-file lint passed. No business records or automation jobs were changed, and no full-suite/build/paid-AI run was performed. The preview was restored to its normal size and left on Follow-ups for Bryan's review.

### Task C: Deliver the optional intake differentiator (detailed Tasks 14–15)

**Files:** Review Inbox/source-scoped service and page, intake integration tests, CSV parser/upload/mapping/preview and tests. Do not re-create the already applied development schema.

- [x] Complete Task 14 first: business-scoped staged items with source evidence, current/proposed values, safe edit/reject/clarify/confirm, transactional and idempotent application, and role/revision checks.
- [x] Add pending intake reviews to the existing next-action worklist, with source links and role-aware actions; do not create a second task system.
- [x] Complete Task 15 on top of the inbox: bounded manual CSV upload, explicit mapping, new/changed/unchanged/invalid/duplicate results, and repeat-import protection. Keep manual forms.
- [x] Demonstrate one fictional CSV row reaching review and changing an invoice only after confirmation; repeat the import without duplication. Run owning money/access/retry tests and one browser journey.
- [ ] If either task misses its acceptance gate before feature freeze, omit the import from the hackathon demo and finish Task 12 with the already working core.

**2 November Task C evidence:** The real signed-in localhost journey uploaded the five-row fictional CSV, previewed two valid proposals, held one invalid amount and both duplicate-ID rows, and staged only the valid proposals. Confirming `SAMPLE-INV-001` created one PHP 12,500 invoice with PHP 0 verified receipts. Re-importing returned the original applied result and the existing second pending item without duplicates. One fictional invoice remains saved and the second proposal remains available for Bryan to review. Manual forms remain in their existing routes.

Seven focused isolated-business intake integration tests pass. Thirty-eight existing/extended owning domain/UI tests pass, plus the new applied-invoice render regression passes separately. Type checking and scoped ESLint pass. The SQL verification forced a failure after the core financial command but before intake outcome persistence, checked complete rollback, then confirmed a successful retry and replay; its fixture, temporary auth user and fault trigger/function were rolled back. Both review findings were addressed: source A → B → A supersedes obsolete B, and item-specific links work independently of the 20-item inbox pagination. The local migration filenames match the applied development history. No full suite, production build, deployment, external connector or paid AI run was performed.

**CSV boundaries:** UTF-8 only; 512 KiB, 100 rows, 24 columns, 16 KiB per record. PHP amounts and ISO dates; invoice/expense proposals only. Customer selection uses existing business customers; a mapped customer column contains explicit PondoPath customer IDs. Reuse the same CSV source and stable row IDs. Owner creates sources; finance can stage/review permitted records. The source endpoint currently accepts signed-in, same-origin session requests; n8n credentials and provider connections are later tasks. The worklist shows the first 20 pending reviews; the inbox paginates all items. SQL/CSS are not covered by the local graph extractor and were inspected directly.

The measured narrow browser layout was 480 CSS pixels with no document overflow. The preview's viewport override did not reach 390 CSS pixels, so a 390px phone check is not claimed. No additional live manual-form submission or external source-endpoint client was exercised. The parser's 16,384-character record cap and database's 16 KiB retained-evidence cap are separate limits; a Unicode-heavy row may reach the evidence limit first. Bryan requested stopping repeated processes; the slice is handed back for review without further broad checks.

### Task D: Close the current MVP verification gate (detailed Task 11)

**Files:** Existing acceptance tests and the final evidence record. Product-code fixes only for a demonstrated failure.

- [ ] Check document overflow at approximately 390px and assistant/chart overlap. Bryan explicitly chose **Leave the phone check for later** on 3 November; this is not claimed as verified. Forecast and Follow-ups were reached through the live navigation at a measured 1056px with no document overflow.
- [x] Verify the newer public-sign-up journey and current database migration state against the intended development project. Real isolated signup/private-workspace cases pass; all 18 local migration versions/names match the development project. Four renamed files retain identical SQL.
- [x] Run the final unit, integration, type, lint and production-build gate. On 3 November: 271/271 unit/UI tests across 36 files; 112/112 integration tests across 12 files; typecheck, ESLint and Webpack build pass on Node 24.22.1. The initial shell used Node 26, so the required runtime was selected from an existing installation and checked without changing global settings. No full-suite repeats are needed for documentation/history changes.
- [x] Reconcile and save the relevant uncommitted slices and aligned migration filenames as local commits. Correct the README's obsolete invite-only description and finish the evidence record. No push, merge or deployment.

**3 November Task D:** The code verification gate passes. The overall mobile/readiness gate remains partial because the owner deferred the phone check. A single fresh-context review found no Critical/Important issues or deferred minors in public-signup isolation, navigation/loading, draft revision handling and Inbox callers; Task C's prior focused review was reused. Existing CSV browser evidence was reused, with no second import or financial-record changes. The [runtime evidence](../../mvp-runtime-evidence.json), under `taskDGate`, records the exact scope. No new verified Next.js feedback issue arose.

The Supabase security advisor flags eight intentionally authenticated, scoped `SECURITY DEFINER` functions and disabled leaked-password protection. The reviewed identity/business/role checks and revoked anonymous execution were retained; no broad permission changes were made. Email confirmation remains disabled for the development-only immediate signup test. Wider-launch security and provider-retention work remain separate from a fictional-data demo.

### Task E: Prepare the reproducible demo and submission (detailed Task 12)

**Files:** README, environment example, final evidence/demo notes, fictional seed script, pitch deck, video/demo link, and deployment configuration only if needed.

- [ ] Rehearse one persistent fictional journey: opening cash and obligations, invoice due-date assumption, delayed commitment, Friday shortfall, owner-reviewed reminder, verified partial receipt, smaller gap, and missed-commitment follow-up.
- [ ] Show one real bounded AI request and one actual Node-RED run. Label copied/manual messages honestly; never imply automatic sending or bank settlement.
- [ ] Document setup, environment variable names, Supabase migrations, Node-RED runtime, provider/model, fictional reference date, and manual fallbacks without secrets.
- [ ] Prepare the pitch deck around the problem, measurable before/after example, product distinction, role of rules versus AI, live proof, limitations, and next steps. Record a short demo video or provide a working demo link as the organizer requires.
- [ ] If a public URL is required and the destination is authorized, configure and smoke-test that deployment, including login, save, forecast, AI, and Node-RED reachability. Otherwise use the verified local demo and label its scope.
- [ ] Confirm the PRD, deck, video/demo, and project-name links open for a viewer, then submit before the confirmed cutoff.

## Approved expansion sequence after the hackathon gate

Every item below is a separate reviewed feature. The detailed Task 14–21 instructions remain authoritative for exact tests, file boundaries, and provider-specific acceptance.

| Order | Detailed task | Deliverable and release evidence |
| --- | --- | --- |
| 1 | 14 — Review Inbox | Finish the shared human-review path first. It is required by all later intake sources. |
| 2 | 15 — CSV | Manual import with mapping, row-level errors, and repeat-safe application. May be pulled into the hackathon demo through Task D. |
| 3 | 16 — XLSX | Reuse the same inbox and mapping; verify multi-sheet/date/formula cases and parity with the CSV fixture. |
| 4 | 17 — Google Sheet via n8n | One selected, authorized sheet; scheduled read and deterministic change comparison. Prove a real edited row reaches review, with visible retry/connection state. |
| 5 | 18 — Google Drive, then OneDrive | One selected file per provider; verify each authorization and real changed-file read independently. |
| 6 | 19 — Receipt images | Private upload, visible source image and editable extracted fields. Measure clear/difficult fictional-image accuracy; staff confirms any actual payment. |
| 7 | 20 — Business messages | Check actual Messenger Page, Viber business/bot, and business SMS access separately. Build the first accessible channel and prove one real signed/replay-safe event into review. |
| 8 | 21 — Named accounting/POS | Start only when a target business identifies a product and its authorized API or export. A supported CSV/XLSX export may already satisfy the need. |

## Readiness gates

**Hackathon demo ready:** Current AC-01–AC-13 checks pass; the selected optional intake acceptance checks pass if advertised; a fictional saved journey, real AI request, and real Node-RED workflow work; deck/video/links and submission are complete. This is not a real-data production claim.

**Expanded capability ready:** Each advertised source passes its own real authorization, replay, review, outage, and browser checks. Fixture-only demonstrations are labelled as fixtures.

**Real-business pilot ready:** Separately enable and test email verification, address the Node-RED runtime security findings before network exposure, verify provider retention and data deletion, backup/export/restore, operating costs, and support ownership. No real customer data is used until these gates pass.

## Self-review

FR-01–FR-11 and AC-01–AC-13 map to Tasks 1–12; FR-17 and AC-19 map to Task 13; FR-12–FR-16 and AC-14–AC-20 map to Tasks 14–21. Each later intake slice depends on the shared review boundary. The hackathon release boundary does not present planned integrations as working, and the real-data pilot has separate operational gates.
