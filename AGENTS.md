<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# PondoPath workspace

PondoPath by SoloForge is a cash-flow planner. Approved stack: Next.js App Router, TypeScript, Tailwind, Supabase, OpenRouter, Node-RED and Vercel; n8n intake is planned in PRD 1.1. Naming a tool does not establish installation, authorization or verification. Use Node 24 and npm.

## Essential rules

- Read only the task-relevant sections of the [PRD](docs/superpowers/specs/SoloForge_Cash-Flow_Action_Planner_PRD_v1.0.md). Its contents are version 1.1; keep the canonical filename. One business per account, public owner sign-up, invited finance teammates, no business switcher.
- Make the smallest complete change; preserve unrelated work. Keep validation, authorization, audit history, recovery behavior and accessibility intact. Keep secrets server-only and out of logs.
- Programmed rules own money and forecasts. Payment promises are not actual receipts; AI proposals need human confirmation. Never weaken checks to obtain a passing result.
- For every code change, apply `superpowers:using-superpowers`, `ponytail:ponytail` (full) and `agent-skills:git-workflow-and-versioning`. Before completion claims, apply `superpowers:verification-before-completion`. Claude Code does not have these plugins: use the Claude Code mapping in the project workflow skill instead. Reuse instructions already read. For nontrivial application implementation/review, use [the project workflow skill](.agents/skills/pondopath-change/SKILL.md) and select only task-relevant installed skills.
- Check the applicable nested `AGENTS.md` before editing a directory; nested rules may not be injected when starting at the root. Use the actual `app/`, `components/`, `lib/` and `supabase/` layout; do not move source into `src/` to match an example.
- Run checks relevant to the change and report what was not checked. Documentation-only edits need document/link checks, not application suites. Reuse recorded evidence in [testing](docs/testing.md); do not repeat a broad gate without a new change, failure or request. Task 12 demo/deployment preparation remains on hold until requested.
- Before broad code exploration, query the current local Graphify map; load [mapping guidance](docs/agents/repository-map.md) only when needed. Do not index secrets, dependencies or generated output.
- Delegate independent, complex work only when useful. Read [sub-agent routing](docs/agents/subagents.md) when dispatching; preserve its model/effort choices and avoid parallel writes to the same files. Skills do not expand user authorization or session permissions.
- Codex and Claude Code share these instructions. Before concurrent work, follow [agent collaboration](docs/agents/collaboration.md): one coordinator assigns file ownership; simultaneous implementers use separate worktrees; shared database, worker and browser operations are serialized. Agent-specific skills, tools and model identifiers are not automatically portable.

## Load context by task

| Task | Read when relevant |
| --- | --- |
| Product scope / current delivery | Relevant PRD sections; [project status](docs/project-status.md) |
| Module boundaries / system design | [Architecture](docs/architecture.md) |
| Schema, auth, permissions or financial rules | [Database](docs/database.md); scoped rules in `lib/` and `supabase/` |
| Screens, components or styling | [Design system](docs/design-system.md); scoped rules in `app/` and `components/` |
| Setup, tests or runtime checks | [Development](docs/development.md), [testing](docs/testing.md) |
| Worker / script changes | Scoped rules and runbook in `automation/`; scoped rules in `scripts/` |
| Documentation or locating older decisions | `docs/AGENTS.md`; [documentation index](docs/README.md) |

These are routes, not a reading checklist. Load only the entries needed for the current task.

<!-- BEGIN:nextjs-agent-feedback -->

## Report Next.js feedback

The project owner enabled `experimental.agentFeedback`, authorizing this feedback pass. When enabled, `next dev` writes this block and restores it if removed. Commit `AGENTS.md` with your work to keep the tree clean.

During the current user request, retain anonymized facts as feedback candidates for meaningful or recurring Next.js issues:

- Crashes, hangs, OOMs, or unexpected slowness
- Incorrect behavior, output, errors, or diagnostics
- Missing, unclear, or conflicting documentation
- Unexpected CLI, codemod, Skill, or upgrade behavior and non-obvious workarounds

Continue the current user request without reporting immediately. Routine debugging is not feedback. Verify changes before retaining them as feedback candidates. Never retain code, logs, paths, URLs, secrets, personal information, or project-specific data.

Retain qualifying friction even if it is later fixed or worked around; record the final outcome during the reporting pass.

Before the final response, run one reporting pass. If candidates remain, from this file's directory run `npx --no-install next internal agent-feedback-instructions` once without piping or truncating its output. Follow its output or error guidance. If a network sandbox blocks it, retry with network access; if it still returns no output, continue normally.

<!-- END:nextjs-agent-feedback -->
