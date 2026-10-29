<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project scope

- Product: PondoPath by SoloForge — AI-Assisted Cash-Flow Action Planner.
- Requirements: `docs/superpowers/specs/SoloForge_Cash-Flow_Action_Planner_PRD_v1.0.md`. Read the sections and acceptance criteria relevant to the current task.
- Approved stack: Next.js, TypeScript, Tailwind CSS, Supabase, OpenRouter, Node-RED, Vercel, and planned n8n source intake (PRD revision 1.1). Inclusion in the PRD does not mean a tool or connector is installed, authorized, or verified.
- Keep the one-business MVP scope. Respect the PRD's exclusions and current user instructions.
- Deliver one reviewed feature slice at a time. Task 11 full verification is partially completed and paused; Task 12 demo/deployment preparation is on hold. Use focused checks for the current change and reuse existing evidence. Resume broad verification or demo/deployment work only when the user requests it.

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

## Simplicity, design, and correctness

- Reuse existing components, helpers, installed dependencies, and native controls before adding libraries or abstractions. Make the smallest complete change; avoid unrelated cleanup.
- Programmed rules own balances and forecasts. AI proposals require the PRD's human review. Payment promises must remain distinct from actual receipts.
- Preserve input validation, access checks, audit history, error handling, and accessibility. Never weaken a check just to make a test pass.
- Financial clarity and the user's task take priority over decorative design rules. Use Taste's app-screen route for this product; verify tables, amounts, states, keyboard access, and mobile behavior in a real browser.
- Run checks appropriate to the change. Money, authorization, duplicate handling, and recovery behavior need meaningful tests. Documentation-only changes need document checks, not unrelated application test runs.

## Local code map and focused reading

- Before broad code exploration, query a current `graphify-out/graph.json`. Inspect the relevant source before editing; the map can be incomplete or stale.
- Initial local map: `graphify extract . --code-only --no-cluster --max-workers 1`.
- After source changes, refresh with `graphify update . --no-cluster` and check results against the changed files. Use focused `rg` searches if mapping is unavailable or insufficient.
- Keep `.graphifyignore` exclusions in effect. Do not index secrets, dependencies, build output, or generated reports. Do not enable cloud services or automatic hooks as part of ordinary mapping.
- The code-only map does not index the PRD/research documents or unsupported files such as CSS. Read those directly when relevant. Avoid rereading the entire workspace for each task.

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
