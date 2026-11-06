---
name: pondopath-change
description: Use when implementing or reviewing a nontrivial PondoPath application change and selecting its project-specific engineering workflow. Excludes documentation-only and trivial visual or configuration edits.
---

# PondoPath change workflow

Select only the workflow rows relevant to the current change. This skill preserves the project's engineering requirements without loading the routing table for every prompt. Use the installed skill catalog and current locations; do not copy the upstream manuals into this project.

## Mandatory skill workflow

Before every implementation task:

1. Read this file, the current task or implementation-plan step, and the relevant PRD sections.
2. Select the skills below that match the work. Open their actual `SKILL.md` instructions using the installed skill catalog; do not rely on their names or remembered summaries. Reuse instructions already read in the current context unless they changed.
3. Announce newly applied skills briefly, inspect the affected source and callers, then follow the selected workflow. Load referenced skill resources only when needed.
4. Complete the applicable verification before reporting success. Record what was checked and disclose anything not checked.

These rules apply without the user repeating a skill name. Use Superpowers as the primary development workflow, Ponytail as the simplicity constraint, and the other skills for the relevant engineering or design concerns. Do not run two equivalent planning, testing, or debugging workflows for the same task.

| When | Required skill instructions |
| --- | --- |
| Starting a development task | `superpowers:using-superpowers`; `ponytail:ponytail` in full mode unless the user chooses another level |
| A new feature or material behavior/scope change needs design | `superpowers:brainstorming`; reuse settled PRD decisions rather than restarting discovery |
| Turning agreed requirements into a build sequence | `superpowers:writing-plans` |
| Implementing an agreed plan | `superpowers:executing-plans`; `agent-skills:incremental-implementation` for small, verifiable slices |
| Changing calculations, validation, permissions, or other nontrivial behavior | `superpowers:test-driven-development`; cover meaningful failure cases and PRD acceptance criteria |
| An error, failing check, or unexpected behavior occurs | `superpowers:systematic-debugging` before proposing a fix |
| Designing APIs or module boundaries | `agent-skills:api-and-interface-design` |
| Handling authentication, financial/customer data, secrets, or external integrations | `agent-skills:security-and-hardening`; `agent-skills:source-driven-development` for current official integration guidance |
| Working with Supabase | `supabase:supabase`; also `supabase:supabase-postgres-best-practices` when designing/reviewing database schemas, queries, or policies |
| Building or changing screens/components | `design-taste-frontend`; its `references/app-screens.md` for dashboard/admin screens; `agent-skills:frontend-ui-engineering` for accessibility and interaction behavior |
| Verifying browser behavior | `agent-skills:browser-testing-with-devtools`; use the available authorized browser tool for real interaction and screenshots |
| Changing code or managing Git history | `agent-skills:git-workflow-and-versioning`; preserve unrelated user changes |
| Reviewing completed implementation | `agent-skills:code-review-and-quality`; use `superpowers:requesting-code-review` when its review workflow applies |
| About to claim completion, passing checks, or a fixed bug | `superpowers:verification-before-completion` |
| Exploring code relationships or finding affected files | `graphify`, following the local-map rules below |

Use installed skill names and current catalog locations rather than hard-coding plugin-cache versions. If a required skill is unavailable, report the missing skill and the affected work; never claim to have loaded it. User instructions and higher-priority runtime instructions take precedence over skill defaults. A skill does not independently authorize purchases, deployments, external messages, or broader access.

## Claude Code mapping

The table above names Codex skills; the Superpowers, Ponytail, Agent Skills and Supabase plugins are not installed for Claude Code. In a Claude session, use the equivalent below instead of reporting each Codex skill as missing. A plugin skill (`engineering:`, `design:`) applies only when the session lists it; otherwise follow the written rule. Project sub-agents are in `.claude/agents/` (see [sub-agent routing](../../../docs/agents/subagents.md)).

| Codex skill | Claude Code equivalent |
| --- | --- |
| `using-superpowers`, `ponytail` | The rules under "Simplicity, design, and correctness" below |
| `brainstorming`, `writing-plans`, `executing-plans`, `incremental-implementation` | Plan mode for new design or scope; the session task list for small verifiable slices |
| `test-driven-development` | Write the failing owning test first, per the rules below; `engineering:testing-strategy` when listed |
| `systematic-debugging` | `engineering:debug` when listed; otherwise reproduce, isolate, then fix |
| `api-and-interface-design` | `engineering:architecture` or `engineering:system-design` when listed; `architect-reviewer` agent for plan review |
| `security-and-hardening`, `source-driven-development` | `security-review` skill or `security-auditor` agent; `docs-researcher` agent for current official guidance |
| `supabase`, `supabase-postgres-best-practices` | [Database rules](../../../docs/database.md) and `supabase/AGENTS.md` |
| `design-taste-frontend`, `frontend-ui-engineering` | [Design guidance](../../../docs/design-system.md); `design:accessibility-review` when listed (Taste is installed for Codex only) |
| `browser-testing-with-devtools` | `run` skill or the built-in browser with `.claude/launch.json` |
| `git-workflow-and-versioning` | Root `AGENTS.md` Git rules: preserve unrelated changes, stage explicit paths, commit only when asked |
| `code-review-and-quality`, `requesting-code-review` | `code-review` skill or `code-reviewer` agent |
| `verification-before-completion` | Run the owning checks and report exact commands, results and gaps before any completion claim |
| `graphify` | `graphify` (same skill) |

## Simplicity, design, and correctness

- Reuse existing components, helpers, installed dependencies, and native controls before adding libraries or abstractions. Make the smallest complete change; avoid unrelated cleanup.
- Programmed rules own balances and forecasts. AI proposals require the PRD's human review. Payment promises must remain distinct from actual receipts.
- Preserve input validation, access checks, audit history, error handling, and accessibility. Never weaken a check just to make a test pass.
- Financial clarity and the user's task take priority over decorative design rules. Use Taste's app-screen route for this product; verify tables, amounts, states, keyboard access, and mobile behavior in a real browser.
- Run checks appropriate to the change. Money, authorization, duplicate handling, and recovery behavior need meaningful tests. Documentation-only changes need document checks, not unrelated application test runs.

Load only relevant PRD sections and scoped instructions for the assigned files. The canonical PRD is `docs/superpowers/specs/SoloForge_Cash-Flow_Action_Planner_PRD_v1.0.md` (contents version 1.1); paths in this skill are repository-root relative.

- For documentation-only work, use [docs instructions](../../../docs/AGENTS.md) and focused document checks instead of application suites.
- For code exploration or a map refresh, consult [mapping guidance](../../../docs/agents/repository-map.md).
- For delegation, consult [role/model routing](../../../docs/agents/subagents.md); do not launch every specialist automatically.
- Use the actual checks and fixture boundaries in [testing](../../../docs/testing.md). Report commands actually run, outcomes and gaps; do not reinterpret historical evidence as a fresh pass.
