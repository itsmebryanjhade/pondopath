# Codex and Claude Code collaboration

Use one shared project rule set and assign independent work explicitly. Markdown files provide context; they do not share chat history, enforce a file lock or grant tool permissions.

## Shared instructions

- `AGENTS.md` at the repository root is the shared instruction source. Read each applicable nested `AGENTS.md` before editing its directory.
- Claude Code v2.1.277+ supports `AGENTS.md` directly under its default Project instructions setting when no project/ancestor `CLAUDE.md` takes precedence. The locally checked CLI is v2.1.302. Personal or organization settings can change loading: verify the actual instruction files with `/context all` in Claude's session.
- If a Claude session cannot load `AGENTS.md` directly, a root `CLAUDE.md` containing the real import `@AGENTS.md` is the supported fallback. Keep the rules in `AGENTS.md`; do not maintain a second copy. Prefer direct loading when the session supports it.
- Use [the documentation index](../README.md) for topic routing, [the full-scope plan](../../tasks/plan.md) and [checklist](../../tasks/todo.md) for delivery order, the PRD for requirements, and dated evidence for actual verification. Existing historical checklists do not establish new results.
- Skills, connectors and sub-agent configurations depend on the running tool. `.codex/agents/` and its GPT model identifiers configure Codex, not Claude; `.claude/agents/` holds the matching Claude Code roles. A file under `.agents/skills/` is not proof that Claude automatically loaded a native skill; `.claude/skills/pondopath-change/` is a pointer that lets Claude discover the shared workflow, whose Claude Code mapping replaces the Codex-only skill names. Invoke an available required skill, or open its actual instructions when accessible; identify any unavailable required workflow or connector and the affected work instead of claiming it ran. Preserve the shared correctness and verification rules.

## Assign the work first

Bryan chooses one coordinator. That agent maintains shared task status, assigns each slice and integrates completed work. This coordinator role is separate from the internal specialist roles in [sub-agent routing](subagents.md).

Before editing, the coordinator records or gives both agents the same assignment details:

```text
Task and acceptance criteria:
Agent and mode (implement / read-only review or research):
Base commit, branch and absolute working folder:
Owned files and allowed changes:
Shared dependencies or decisions needed first:
Focused checks and handoff destination:
```

Each agent confirms its working folder, branch, current changes and assigned scope. Re-check a file before editing if another session could have changed it. Preserve other people's edits. If required work crosses the assigned files or changes a shared contract, coordinate ownership before making that change; do not silently expand the assignment.

The coordinator owns shared checklist updates. Other agents report their status and evidence in their handoff instead of concurrently rewriting `tasks/todo.md`, the PRD or shared evidence files. Keep the existing checklist as the status source rather than starting a competing task list for each tool.

## Choose the working mode

| Mode | Arrangement |
| --- | --- |
| One implements, one reviews or researches | They may use the same working folder. The second agent makes no edits, commits, branch switches or state-changing test runs there. |
| Both implement simultaneously | Give each a separate Git worktree and branch from the agreed base commit, with explicit file ownership. Coordinate overlapping contracts and integrate sequentially. |

Worktrees belong to the same repository; they are not another numbered product or another GitHub repository. New worktrees start from committed files. The current documentation reorganization and any other uncommitted work will not appear automatically in a new one: preserve and deliberately checkpoint the intended changes before starting parallel implementation. Never copy ignored environment files or secrets into version control to share them.

Do not run Git mutations in another agent's working folder. Stage explicit owned paths, preserve unrelated changes, and leave integration to the coordinator. A branch or worktree isolates edits; it does not guarantee that the result merges without conflicts.

## Shared services and handoff

- Use separate local ports for concurrent app servers. Coordinate browser control so one agent does not navigate away during another's check.
- Worktrees can still use the same Supabase project and external accounts. Serialize migrations, shared demo changes and worker operations. Use the existing isolated fixture rules for tests; never reset the shared business to prepare another agent's task.
- Keep one scheduler responsible for each job. Coordinate Node-RED/n8n changes, credentials, provider calls and paid evaluations through the coordinator within the user's existing authorization.
- Hand off the task, working folder, base/result commit or uncommitted state, exact changed files, checks actually run and their results, unverified items and remaining dependencies. Claim completion only for the assigned scope.
- The coordinator reviews and integrates one slice at a time, then runs checks appropriate to the combined change. Reuse unaffected evidence; do not have both agents repeat the same broad suite.

## Official Claude Code references

- [Instruction loading, AGENTS.md and imports](https://code.claude.com/docs/en/memory).
- [Parallel sessions with worktrees](https://code.claude.com/docs/en/common-workflows#run-parallel-sessions-with-worktrees).
