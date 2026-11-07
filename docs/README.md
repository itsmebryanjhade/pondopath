# Documentation index

Choose the page that answers the current question; this index is not a requirement to read every document. The PRD defines requirements, source defines implementation, and dated evidence records what was actually checked. Return to the [project overview](../README.md) for the entrypoint.

Completion planning: [full approved scope](../tasks/plan.md) and [task checklist](../tasks/todo.md), ordered by dependencies rather than a deadline. Planning does not claim completed execution.

## Current project

| Need | Document |
| --- | --- |
| Product requirements | [PRD — contents version 1.1, canonical v1.0 filename](superpowers/specs/SoloForge_Cash-Flow_Action_Planner_PRD_v1.0.md) |
| Current delivery boundary and holds | [Project status](project-status.md) and [delivery sequence](superpowers/plans/2026-11-02-pondopath-delivery-sequence.md) |
| Module and process boundaries | [Architecture](architecture.md) |
| Local setup | [Development](development.md) |
| Database access and financial invariants | [Database](database.md) |
| Brand and UI references | [Design system](design-system.md) |
| Repeatable steps and rules for polishing a screen | [UI/UX polish playbook](ui-polish-playbook.md) |
| Checks, isolated fixtures and recorded gate | [Testing](testing.md) |
| Accounts, CSV review and AI assistant | [Product guide](product-guide.md) |

## Verification and demonstration

- [AI verification](ai-verification.md) and [recorded evaluation](ai-evaluation.json).
- [Automation verification](automation-verification.md), [worker runbook](../automation/README.md) and [runtime evidence](automation-runtime-evidence.json).
- [Demo script and recording guide](demo-and-verification.md); [Task D runtime evidence](mvp-runtime-evidence.json).
- [Editable pitch deck](../deliverables/PondoPath_Pitch_Deck_v3.pptx). Prepared materials are not evidence of a live rehearsal, video, deployment or submission.

## Agent context

- [Codex and Claude Code collaboration](agents/collaboration.md): shared instructions, task ownership, separate working copies and handoff requirements.
- [Root instructions](../AGENTS.md), [on-demand project workflow](../.agents/skills/pondopath-change/SKILL.md), [sub-agent models and dispatch](agents/subagents.md), [local code mapping](agents/repository-map.md).
- Scoped instructions: [app](../app/AGENTS.md), [components](../components/AGENTS.md), [lib](../lib/AGENTS.md), [Supabase](../supabase/AGENTS.md), [tests](../tests/AGENTS.md), [scripts](../scripts/AGENTS.md), [automation](../automation/AGENTS.md), [docs](AGENTS.md).
- Existing specialist workflows remain in the installed skill catalog. The project skill routes to them rather than copying their manuals. Role definitions remain in `.codex/agents/`.

## Specifications, plans and review history

These dated documents retain their paths and original decisions. Apply newer approved requirements when they supersede an earlier default; do not treat an old checklist as current verification.

- [Original implementation plan](superpowers/plans/2026-10-27-cash-flow-action-planner.md).
- [Invite-only onboarding plan](superpowers/plans/2026-10-27-invite-only-onboarding.md) — the registration default is superseded by [public sign-up](superpowers/plans/2026-10-30-public-signup.md).
- [Landing-page plan](superpowers/plans/2026-10-27-landing-page.md).
- [Cash-overview design plan](superpowers/plans/2026-10-28-cash-overview-design.md) and [QA](superpowers/reviews/cash-overview/design-qa.md).
- [Figma dashboard-port plan](superpowers/plans/2026-10-28-figma-dashboard-port.md) and [QA](superpowers/reviews/figma-port/design-qa.md).
- [Brand-refresh plan](superpowers/plans/2026-10-28-pondopath-brand-refresh.md).
- [Workspace-fidelity slices](superpowers/plans/2026-10-28-workspace-fidelity-slices.md) and [workspace design specification](superpowers/specs/2026-10-28-main-workspace-design.md).
- [Delivery sequence](superpowers/plans/2026-11-02-pondopath-delivery-sequence.md) — later evidence in this document qualifies its older summaries.

## Research and fictional case

- [C01 open-source audit](research/c01-open-source-audit.md).
- [C01 verification ledger](research/c01-verification-ledger.md).
- [Fictional business walkthrough](research/c01-sample-business-walkthrough.md).

These support the project's reasoning and examples; they do not establish customer outcomes or override current requirements. Ignored `.superpowers/`, `.taste-skill/` and `graphify-out/` files remain tool-managed local artifacts, outside this maintained documentation set.
