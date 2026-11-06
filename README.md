# PondoPath by SoloForge — Cash-Flow Action Planner

A one-business Philippine B2B hackathon MVP connecting collections, a 30-day cash forecast, and reviewed follow-up actions. Scope is defined in the [PRD](docs/superpowers/specs/SoloForge_Cash-Flow_Action_Planner_PRD_v1.0.md) and [implementation plan](docs/superpowers/plans/2026-10-27-cash-flow-action-planner.md).

Presentation materials: [demo script and recording guide](docs/demo-and-verification.md) and [editable pitch deck](deliverables/PondoPath_Pitch_Deck_v3.pptx). The guide uses the fixed fictional demo dates and includes Taglish narration. The pitch materials are prepared; a live rehearsal, video and submission links remain pending.

## Start here

- [Local development setup](docs/development.md): Node 24, npm, existing environment-file guards and fictional demo accounts.
- [Product guide](docs/product-guide.md): accounts, team invitations, CSV review and the AI assistant.
- [Current status and delivery boundary](docs/project-status.md): recorded evidence, pending checks and held work.
- [Documentation index](docs/README.md): architecture, database, UI, verification, research and dated decisions.

## Development commands

Run from the repository root after following the setup guide.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start Next.js development server |
| `npm run test:unit` | Run unit/UI checks |
| `npm run test:integration` | Run integration checks with isolated-development credentials |
| `npm run typecheck` | Generate Next.js types and check TypeScript |
| `npm run lint` | Run ESLint |
| `npm run build` | Webpack production build; Google Fonts requires network access |

Use [testing guidance](docs/testing.md) to select the relevant checks. Detailed setup, financial invariants and provider operations are loaded only when needed, rather than copied into every entrypoint.

For agent work, read [AGENTS.md](AGENTS.md) and the applicable scoped instructions. The six [specialist roles](docs/agents/subagents.md) remain available when delegation benefits the task.
