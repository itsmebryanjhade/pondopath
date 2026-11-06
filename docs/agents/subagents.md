# Project sub-agents

The coordinating agent uses the project-scoped roles below when their work helps the current task. Code reviews go to `code_reviewer` (`code-reviewer` in Claude Code); use the other specialists selectively instead of launching every role for every change. Codex definitions live in `.codex/agents/<role>.toml`; Claude Code definitions live in `.claude/agents/<role-with-hyphens>.md` with the same instructions. When changing a role's instructions, update both files.

### Codex

| Role | Model | Reasoning effort | Assigned work |
| --- | --- | --- | --- |
| `code_explorer` | `gpt-6-luna` | `high` | Read-only file/symbol/caller discovery and concise repository maps |
| `architect_reviewer` | `gpt-6-astra` | `xhigh` | Read-only design/specification review before implementation |
| `implementer` | `gpt-6.1-sol` | `high` | One agreed implementation slice within an explicit workspace and file scope |
| `security_auditor` | `gpt-6-astra` | `xhigh` | Read-only security, business-isolation, and financial-integrity review |
| `docs_researcher` | `gpt-6-luna` | `high` | Read-only current official documentation and version checks |
| `code_reviewer` | `gpt-6-sol` | `max` | Read-only review of completed code changes |

### Claude Code

The `.claude/agents/` frontmatter sets each role's model, effort and tools. Read-only roles get read/search tools and Bash only, without Edit or Write; the implementer cannot spawn agents.

| Role | Model | Effort | Tools |
| --- | --- | --- | --- |
| `code-explorer` | `sonnet` | `medium` | Read, Grep, Glob, Bash |
| `architect-reviewer` | `opus` | `high` | Read, Grep, Glob, Bash |
| `implementer` | `sonnet` | `high` | Read, Edit, Write, Grep, Glob, Bash |
| `security-auditor` | `opus` | `high` | Read, Grep, Glob, Bash |
| `docs-researcher` | `sonnet` | `medium` | Read, Grep, Glob, Bash, WebFetch, WebSearch |
| `code-reviewer` | `opus` | `high` | Read, Grep, Glob, Bash |

Claude effort is capped at `high` to conserve the owner's usage: never use `xhigh` or `max` for a sub-agent unless Bryan asks for it. Dispatch a role by its name as the Agent tool's `subagent_type`; do not override its model or effort. Prefer one combined review over parallel reviewers of the same change.

### Both tools

- Start specialists with an isolated context. Give each the target workspace, narrow task, relevant requirements, and available verification results; assign the implementer explicit allowed files and a prepared worktree when parallel writes need isolation.
- In Codex, if the dispatch tool has no named-agent option, use `fork_turns = "none"`, set `model` and `reasoning_effort` explicitly to that role's values above, and pass the `developer_instructions` from its role file. Do not rely on the parent model or default effort.
- Specialists do not delegate further. The coordinator combines their findings and requests any follow-up. Report unavailable agents, models, effort levels, or tools rather than silently substituting them.
- All roles except `implementer` are instructed to avoid edits. Codex role files do not create separate read-only permissions, and a Claude tool list removes Edit/Write but still allows Bash: sub-agents otherwise inherit the parent session's permissions. Do not widen permissions just to run a specialist.
