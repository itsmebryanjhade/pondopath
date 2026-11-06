# PondoPath full-scope completion plan

## Goal

Finish the full approved PondoPath scope in dependency order, without calendar-based feature cuts or a smaller demo release taking priority over the integrations. Bryan superseded the earlier dated-release staging with this direction. **The fictional-data boundary remains unchanged.** Real-business use still requires its separate operational and data-handling checks.

The active coordination checklist is [todo.md](todo.md). The existing [PRD](../docs/superpowers/specs/SoloForge_Cash-Flow_Action_Planner_PRD_v1.0.md) and [detailed implementation plan](../docs/superpowers/plans/2026-10-27-cash-flow-action-planner.md) remain authoritative for requirements, acceptance criteria and original Tasks 1–21. Historical event dates and verification records remain history; they no longer set the scope of this plan.

## Full target

- Existing owner/finance access, financial records, verified payments, forecasts, commitments, reminder review/copy, scenarios, history, AI assistance and next-action worklist.
- Review Inbox, CSV **and XLSX** import.
- **n8n intake** from a selected Google Sheet, then selected Google Drive and OneDrive files.
- Private receipt-image upload/extraction with editable source-linked proposals.
- Separately verified Messenger Page, approved Viber business/bot and business SMS intake.
- An identified accounting/POS source through its actual supported API or file export.
- Existing Node-RED missed-commitment automation, final browser/role checks, environment proof and a truthful complete handoff.

All imported/extracted information goes through the shared human-review boundary. Promises, images and messages saying “paid” do not become verified cash automatically. Manual forms remain usable when a source fails. A provider whose access is unavailable stays visibly unverified; it is not silently counted as finished or removed from the target.

## Baseline

The [recorded 3 November gate](../docs/mvp-runtime-evidence.json) passed 271 unit/UI tests, 112 integration tests, typecheck, lint and a production build. These are historical results, not a new gate for the expanded application.

The existing Review Inbox, CSV pipeline and next-action worklist provide the foundation for the remaining intake features. The former baseline gaps were closed on 6 November: R3 (phone layout/assistant overlap, with one scroll-offset fix) and R2 (clipboard-denied fallback in the browser; separate-session reminder rules on the owner/finance integration tests at Bryan's direction). See the [runtime evidence](../docs/mvp-runtime-evidence.json).

## Implementation sequence

| Order | Original task / deliverable | Dependencies and evidence |
| --- | --- | --- |
| 1 | Task 16 — XLSX import | Reuse the delivered CSV/Review Inbox contracts; verify safe workbook parsing, dates/formulas/limits and equivalent reviewed results |
| 2 | Task 17 — n8n and one selected Google Sheet | Verify runtime/license/hosting and authorized sheet access; establish scoped external intake, status/replay controls and a real edited-row journey |
| 3 | Task 18 — Google Drive, then OneDrive | Reuse the proven intake and file parsers; deliver and verify selected-file access, changes, retries and revoked access for each provider independently |
| 4 | Task 19 — Receipt images | Use the existing inbox; implement private upload, source-linked editable extraction and clear/difficult-image evaluation |
| 5 | Task 20 — Business messages | Use the inbox and n8n intake boundary; evaluate Messenger, Viber and SMS separately and implement one accessible channel per reviewed slice |
| 6 | Task 21 — Named accounting/POS | Identify the actual product and access/export first; reuse CSV/XLSX where a supported export satisfies the requirement |
| 7 | R4–R8 — Full completion verification and handoff | After implementation gates and R2/R3, identify the final candidate, verify its intended environment/worker paths and rehearse the complete advertised scope |

**XLSX import is delivered (6 November). Next: the Task 17 n8n/Google Sheet runtime and access preflight.** Provider documentation/access preflights may run alongside other work. Receipt-image work depends on the inbox, not on finishing every file connector; it can proceed independently when its contract and file ownership are clear. Shared schema, financial-command and inbox edits remain coordinated and sequential.

The integration rows are coordination milestones, not permission to implement a large feature in one patch. Before coding a milestone, read its original task, inspect current callers and split its parser, service/API, UI and verification work into small end-to-end slices. Keep each implementation task focused on at most roughly five files and meaningful acceptance/failure checks. Keep the original task pending until its actual evidence passes.

## Completion checkpoints

1. **Baseline:** R1–R3 track the agreed full scope/environment and the existing reminder/mobile gaps. Independent ready feature work may proceed while these checks are addressed.
2. **Per feature:** owning tests, actual browser behavior, applicable access/retry/recovery checks and focused review pass before advertising support. A fixture alone is not proof of a real provider connection.
3. **Final candidate:** completed integration gates plus baseline checks feed R4; R5/R6 prove the intended application and worker paths; R7/R8 complete the full fictional-data journey and handoff.

Reuse existing evidence when its scope still matches. Run focused checks after each slice and one justified broad gate for the final changed candidate. Do not repeat broad suites for documentation-only changes. Never lower assertions, validations or permissions to claim completion.

## Architecture and sub-agents

- Keep the existing Next.js/Supabase/programmed financial rules and bounded OpenRouter assistant. New sources stage proposals; they do not write financial tables with a service-role key.
- Keep one scheduler responsible for each job. Node-RED retains missed-commitment follow-ups unless a separately reviewed migration is chosen; n8n handles source intake without duplicating that job.
- Coordinator owns dependencies, source contracts and evidence. Use the explorer/docs researcher for narrow questions, the architect for nontrivial boundary decisions, one implementer per assigned slice, and the existing GPT-6 Sol/max reviewer for consequential fixes. Use the security auditor where the change warrants it.
- Parallelize independent investigation or explicitly isolated slices. Serialize shared browser interaction and shared-file/schema edits; do not launch every specialist for each task.

## Working environment and fictional data (R1, 6 November)

Recorded from the repository and local configuration; only variable names were inspected, never secret values.

| Area | Current state |
| --- | --- |
| Application | Local Next.js dev server at `http://localhost:3000` (`.claude/launch.json` → `npm run dev`). No Vercel project is linked in this checkout and nothing is deployed. |
| Node | Node 24 is required. The machine default is v26.12.0; the already-installed Node 24.22.1 binary is used for recorded checks without changing the global default. |
| Database | The authorized Supabase development project **soloforge-cashflow-dev** (Singapore), configured in `.env.local`. See [database](../docs/database.md). |
| Integration tests | `.env.test.local` (`TEST_ENVIRONMENT=isolated-development`) targets the same development project. Each run creates and removes its own unrelated test business and owner/finance accounts; shared workspaces are never reset. |
| Fictional workspaces | **SoloForge Demo Services**, from `scripts/seed-demo.mjs`: Demo Owner/Demo Finance accounts, fixed reference date 2026-10-29, used for the scripted demo numbers. **Bryan's ordinary development workspace**: current date, fictional test records (for example `TEST-INV-001` and the "Fictional CSV walkthrough" source), used for the Task 16 and R2/R3 browser checks. |
| Sample files | `public/samples/pondopath-invoices.csv` and `.xlsx`, both fictional. |
| AI | OpenRouter is configured (key, model and provider names in `.env.local`). A `GEMINI_API_KEY` entry also exists locally but no application code reads it. |
| Worker | Node-RED in `automation/` with `.env.automation.local`; loopback-only editor, run manually. See its [runbook](../automation/README.md). |
| Not installed or unverified | n8n (not installed); Google Sheets/Drive and Microsoft OneDrive access; Messenger Page, Viber business/bot and SMS provider access; receipt-image provider; the accounting/POS product; the final hosting target. |

The fictional-data boundary applies to every environment above. No real customer data, public exposure, purchases or provider sign-ups are authorized by this record.

## Decisions and access still needed

| Item | Handling |
| --- | --- |
| n8n operating setup and exact supported runtime/license | Verify official guidance and choose a setup before installation; no service purchase is inferred |
| Google, Microsoft and message-provider access | Establish the actual authorized account/scopes per source; an unavailable source blocks its own dependent slice, not all other work |
| Receipt-image provider and allowance | Evaluate fictional samples and record privacy/usage behavior before enabling the advertised scanner |
| Accounting/POS product | Obtain its actual identity and supported API/export; do not invent a universal connector |
| Intended final hosting environment | Prepare a concrete build/destination/configuration and verify the actual authorized target before claiming deployment |

Removing the calendar constraint does not grant new provider access, authorize public exposure or purchases, or permit real customer data. Missing access and failed checks remain visible. New implementation has not been started by this planning update, and no original feature or verification task has been marked complete.
