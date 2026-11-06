# Architecture

Use this page for module/process boundaries, not as a requirement to load every implementation document. The [PRD](superpowers/specs/SoloForge_Cash-Flow_Action_Planner_PRD_v1.0.md) defines behavior; the [delivery sequence](superpowers/plans/2026-11-02-pondopath-delivery-sequence.md) and [recorded evidence](testing.md) distinguish delivered work from plans.

## Repository boundaries

| Location | Responsibility |
| --- | --- |
| `app/` | Next.js App Router pages, server actions and HTTP routes |
| `components/` | Shared interface components and product branding |
| `lib/` | Shared domain rules and application/server helpers |
| `supabase/` | Versioned database migrations and access rules |
| `automation/` | Separate local Node-RED follow-up worker; see its [runbook](../automation/README.md) |
| `scripts/` | Guarded seeding, evaluation and runtime-verification utilities |
| `tests/` | Unit/UI and isolated-development integration coverage |
| `public/`, `deliverables/` | Product assets and presentation artifacts |

## Data and process boundaries

- Each account belongs to one private business. Database membership determines its business and role; browser input cannot grant privileges. See [database rules](database.md).
- Actual cash, invoice balances, payment expectations and temporary scenarios remain distinct. Programmed financial commands own balances, history and retry protection.
- CSV intake stages proposals in the Review Inbox. Confirmation uses normal financial commands and authorization; import is not a payment-posting path.
- OpenRouter is server-side assistance for explanations and proposals, with human review and manual fallbacks. See the [product guide](product-guide.md) and [AI verification](ai-verification.md).
- Node-RED runs separately from Next.js/Vercel. n8n connections and the other PRD 1.1 intake extensions remain planned; their mention is not evidence of configured providers.

Read the installed `node_modules/next/dist/docs/` guide relevant to a framework change. Keep Cache Components and Partial Prefetching assumptions tied to the current installed version; the [development guide](development.md) and [testing guide](testing.md) describe the existing build setup.
