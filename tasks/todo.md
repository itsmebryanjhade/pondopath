# PondoPath full-scope completion tasks

Target: complete the full approved scope in dependency order, using fictional data. The earlier dated-release restriction is removed. Read [the plan](plan.md) for the complete scope and dependency rules. Existing pending work remains pending; this update does not claim implementation or verification. Run commands from the repository root with Node 24/npm.

## Integration execution queue

Track implementation acceptance in the existing [Tasks 16–21](../docs/superpowers/plans/2026-10-27-cash-flow-action-planner.md). This table coordinates those tasks rather than duplicating their completion checkboxes. Decompose the next milestone into small implementation slices before coding; verify each provider separately.

| Original task | Milestone | Current state |
| --- | --- | --- |
| 16 | XLSX import into the existing Review Inbox | Done — 6 November (`a9d3c01`); owning checks on Node 24 |
| 17 | n8n intake from one selected Google Sheet | Pending — runtime/access preflight |
| 18 | Selected Google Drive file | Pending — provider-specific access and proof |
| 18 | Selected OneDrive file | Pending — provider-specific access and proof |
| 19 | Private receipt-image extraction and review | Pending — provider evaluation and implementation |
| 20 | Messenger Page intake | Pending — access unverified |
| 20 | Approved Viber business/bot intake | Pending — access unverified |
| 20 | Business SMS intake | Pending — access unverified |
| 21 | Identified accounting/POS API or supported export | Pending — product/access not yet identified |

The R-tasks below retain the baseline and final-completion checks. R2/R3 can be addressed alongside independent feature work. R4 waits for the full implemented scope; provider blockers must be resolved or the advertised scope explicitly changed by Bryan before full completion is claimed.

## R1: Record the full-scope working boundary

**Description:** Record the complete approved feature scope and available development environment. Keep the fictional-data boundary and identify provider/environment questions as they become relevant.

**Status — 6 November:** complete. Recorded in [the plan](plan.md) ("Full target" and "Working environment and fictional data") and confirmed by Bryan.

**Acceptance criteria:**
- [x] Full approved scope is recorded, including XLSX, n8n, file sources, images, message channels and an identified accounting/POS path; calendar-based feature deferrals are removed.
  - The accounting/POS product itself is not yet chosen; the plan records identifying it as the first step of Task 21.
- [x] Fictional fixtures and the available working environment are identified; unverified provider access/allowances are recorded without blocking unrelated ready work.

**Verification:**
- [x] Compare the working boundary with Bryan's current direction and the PRD; check the links. No application suite is needed for this document task.
  - 6 November: links checked; the scope matches PRD FR-12–FR-16 and the accounting/POS source; Bryan confirmed it matches his current direction.

**Dependencies:** None. **Files likely touched:** `tasks/plan.md`, `docs/demo-and-verification.md`. **Estimated scope:** Small, 1–2 files.

## R2: Close the reminder-copy verification gap

**Description:** Finish the outstanding clipboard-denied and separate-session checks from original Task 8. Repair only a demonstrated failure.

**Status — 6 November:** passed; no product fix was needed. See `r2ReminderCheck` in [runtime evidence](../docs/mvp-runtime-evidence.json).

**Acceptance criteria:**
- [x] A denied clipboard still exposes a usable, accessible manual-copy path for the current approved draft.
- [x] Separate owner/finance sessions enforce exact-version approval and reject stale copy/approval after a relevant record change; copying sends no message.

**Verification:**
- [x] Exercise the actual browser fallback and two-session flow with fictional records. If a fix is needed, first reproduce it with an owning test; run `npm run test:unit -- lib/domain/reminders.test.ts` and `npm run test:integration -- tests/integration/reminders.test.ts` when their behavior is affected, using the isolated fixture rules.
  - Browser: the blocked-clipboard fallback was exercised on fictional `TEST-INV-001` in Bryan's ordinary development workspace (owner role, fictional test records; not the seeded SoloForge Demo Services workspace).
  - Two sessions: at Bryan's direction, verified by the owning tests on Node 24.22.1 (unit 3/3, integration 4/4) with separately signed-in owner and finance accounts. A simultaneous two-browser UI walkthrough was not performed.

**Dependencies:** R1. **Files likely touched:** `components/reminder-panel.tsx`, `lib/domain/reminders.test.ts`, `tests/integration/reminders.test.ts`, `docs/mvp-runtime-evidence.json` (product files only for a demonstrated failure). **Estimated scope:** Medium, up to 4 files.

## R3: Close the phone-layout verification gap

**Description:** Finish the deferred narrow-screen check against the current UI, including navigation and assistant overlap.

**Status — 6 November:** passed after one CSS fix; see `r3PhoneCheck` in [runtime evidence](../docs/mvp-runtime-evidence.json). The check ran on the local dev server in an emulated 390×844 browser viewport, not on a physical phone or a production build.

**Acceptance criteria:**
- [x] A real browser reports the intended approximately 390px CSS viewport and no unintended horizontal overflow on the relevant Overview, Forecast and Follow-ups states; a clamped wider preview does not count.
- [x] Navigation, financial values, chart controls and assistant actions remain reachable without overlap, with keyboard/focus behavior preserved.

**Verification:**
- [x] Record actual viewport/document measurements and screenshots; exercise the affected interactions. If a defect requires code changes, run its owning UI test and targeted lint/typecheck. An unavailable viewport leaves this gate unverified.
  - Measurements are recorded in the evidence file. Screenshots were captured during the session but are not stored in the repository. The one defect, in-page links hiding section headings under the 124px phone top bar, was fixed in `app/workspace.css` and re-measured in the browser. No automated test covers that stylesheet, and ESLint/typecheck do not apply to CSS.

**Dependencies:** R1. **Files likely touched:** `components/workspace-shell.tsx`, one affected component/owning test if a defect is demonstrated, `docs/mvp-runtime-evidence.json`. **Estimated scope:** Medium, up to 4 files.

## Checkpoint A — after R1–R3

- [x] Full-scope working boundary is recorded; reminder and phone gaps have evidence or remain explicitly pending, without blocking unrelated implementation.
- [x] Owning checks for any fixes pass without weakened assertions; changed scope remains within the agreed release.
  - The only fix (the phone scroll offset) has no automated test; it was re-measured in the browser. No assertion or check was weakened.
- [ ] Coordinator/Bryan review the outstanding findings; full candidate verification waits for the implemented integration scope.
  - Outstanding findings for review: (1) full `npm run lint` fails only on the ignored local `.taste-skill/check-production-css.cjs` helper; (2) original Task 8's two-browser separate-session UI walkthrough stays open because R2 accepted the integration tests instead; (3) the machine's default Node is 26, so checks rely on the separate Node 24 binary.

## R4: Identify and verify the complete candidate

**Description:** After the full feature scope and baseline checks are complete, tie the final candidate to actual verification evidence. Reuse existing successful checks only when the candidate and environment still match.

**Acceptance criteria:**
- [ ] Candidate revision/build and any repairs are recorded. Consequential fixes receive focused review with no unresolved release blocker.
- [ ] Applicable checks pass. Reuse the 3 November gate only where its scope still matches; run one justified new gate for changed product code or an unmatched candidate, with no repeats for prose-only edits.

**Verification:**
- [ ] When a new code gate is justified: `npm run test:unit`, `npm run test:integration`, `npm run typecheck`, `npm run lint`, `npm run build`. Record Node version, outcomes and exact coverage; missing isolated-development credentials cannot count as an integration pass. No fixed old test count substitutes for current results.

**Dependencies:** R2, R3, checkpoint A, verified implementation of original Tasks 16–21 for the full advertised scope. **Files likely touched:** `docs/mvp-runtime-evidence.json`, `tasks/todo.md`; separately scope any newly demonstrated product repair. **Estimated scope:** Small, 1–2 evidence files.

## R5: Verify the required release environment

**Description:** Prove the complete candidate works in the intended authorized environment identified during implementation. Prepare a concrete destination/build/environment configuration before any deployment or sharing action.

**Acceptance criteria:**
- [ ] The intended authorized destination serves the candidate and keeps credentials server-only. A claimed public deployment requires proof at that actual URL; a local-only run is labelled as local.
- [ ] Owner and finance sign-in, business isolation, saved payment/reload, forecast and approved-copy flows work with the intended fictional fixtures; no ordinary/shared records are reset.

**Verification:**
- [ ] Exercise the actual required URL with the two intended roles and record results/limits. Reuse the R4 build where applicable; do not deploy, purchase services or change authentication settings on planning authority alone.

**Dependencies:** R1, R4. **Files likely touched:** `docs/demo-and-verification.md`, `.env.example` (names/placeholders only), `docs/mvp-runtime-evidence.json`. **Estimated scope:** Medium, up to 3 files.

## R6: Prove the existing follow-up worker

**Description:** Demonstrate Node-RED against the R5 app environment using a labelled, eligible fictional missed commitment. Keep missed-commitment scheduling owned by Node-RED unless a separately reviewed migration is chosen; n8n intake must not schedule the same job twice.

**Acceptance criteria:**
- [ ] The worker reaches the intended app and records a successful run; a repeated scan creates no duplicate task.
- [ ] Pause/restart behavior and operator startup are documented accurately. The editor stays loopback-only; no continuous-hosting or automatic-payment/message claim is made.

**Verification:**
- [ ] Record one actual worker run and repeat/restart outcome with owned fictional fixtures. Use `node scripts/verify-automation.mjs` only if changed worker behavior or an unresolved runtime concern justifies its isolated local harness; it cannot replace proof of remote connectivity when remote operation is required.

**Dependencies:** R5. **Files likely touched:** `automation/README.md`, `docs/automation-verification.md`, `docs/automation-runtime-evidence.json`. **Estimated scope:** Medium, up to 3 evidence/runbook files.

## Checkpoint B — after R4–R6

- [ ] Candidate checks, the required app environment and the actual worker path have matching evidence.
- [ ] No Critical/Important release finding remains open; external-access blockers are reported explicitly.
- [ ] Coordinator/Bryan confirm the candidate includes the completed advertised integrations and is stable enough for the final end-to-end rehearsal.

## R7: Rehearse the complete fictional journey

**Description:** Run the existing fictional-data journey against the complete candidate, adding the verified integration paths without weakening the AI and human-review boundaries.

**Acceptance criteria:**
- [ ] The guide's fixed reference date/business and money checkpoints match saved records through commitment, reminder, verified partial payment, forecast and CSV review; reload preserves the result. Use a separate eligible missed-commitment fixture when the main promise is not yet overdue.
- [ ] One bounded real AI request uses the existing approved provider allowance and produces a reviewed proposal; manual fallbacks remain available. Record the full advertised feature journey and label manual sending and historical provider evidence accurately; source-specific integration gates must already have passed.

**Verification:**
- [ ] Record the complete rehearsal and exact outcomes. Do not reset shared fixtures or rerun a paid evaluation benchmark to prepare a recording. A blocked live provider remains an unverified advertised capability until resolved.

**Dependencies:** R5, R6, checkpoint B, source-specific acceptance evidence for every advertised integration. **Files likely touched:** `docs/demo-and-verification.md`, required recording artifact, existing pitch deck only if a demonstrated claim mismatch needs correction. **Estimated scope:** Medium, up to 3 files.

## R8: Complete the release handoff

**Description:** Package the proven full-scope fictional-data application when its acceptance and verification gates pass; retain its exact candidate and operator instructions.

**Acceptance criteria:**
- [ ] Required app/deck/video/PRD links open with the intended viewer's access, and claims match the delivered scope. Existing prepared materials are reused rather than rebuilt without a reason.
- [ ] Operator startup/recovery notes and remaining limits are recorded. Bryan reviews the release decision; any upload, public sharing or actual submission uses its separately established authorization.

**Verification:**
- [ ] Open each required artifact/link as an intended viewer and perform one short candidate smoke check. Record the handoff and unresolved items; do not mark a failed or blocked requirement complete.

**Dependencies:** R7. **Files likely touched:** `docs/demo-and-verification.md`, `tasks/todo.md`, `docs/project-status.md`. **Estimated scope:** Medium, up to 3 files.

## Release checkpoint — after R7–R8

- [ ] R1–R8 and the relevant original acceptance criteria have evidence; no additional feature is advertised as working without its checks.
- [ ] The full-scope fictional-data application is reviewed and handed off after all required gates pass, with no date-based feature cuts.
- [ ] A stable candidate is retained with honest provider/hosting limitations. Real-business pilot gates remain separate; unfinished advertised integrations prevent a full-completion claim.

## Continuing implementation

The integration queue above is part of this completion plan. Follow the [implementation sequence](plan.md#implementation-sequence), starting with XLSX and reusing the existing inbox/CSV foundation. A source with missing access remains pending while other ready slices proceed. Do not mark a milestone complete from a fixture-only demonstration, skip its safeguards, or silently remove it to report 100%.
