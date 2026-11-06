# Database and financial rules

Read the relevant [PRD criteria](superpowers/specs/SoloForge_Cash-Flow_Action_Planner_PRD_v1.0.md) and scoped instructions in [lib](../lib/AGENTS.md) and [Supabase](../supabase/AGENTS.md) for the current task.

## Development database and migrations

The authorized development project is **soloforge-cashflow-dev** in Singapore, ref `vhdokiicswumirqxmbpn`. Apply the versioned SQL in `supabase/migrations/` through the documented Supabase migration workflow; do not recreate tables manually or apply development fixtures to a production database. The CLI-generated filenames are aligned with the actual hosted migration versions.

## Access and financial invariants

All exposed financial/intake tables have RLS and explicitly denied direct application writes. Authorized RPC reads derive the business and current role from database membership. Core financial RPC wrappers use narrowly scoped private implementations. Intake and workspace-creation functions intentionally use `SECURITY DEFINER`, an empty search path, revoked anonymous execution and explicit authenticated identity/business/role checks. The Supabase advisor flags these intentional grants for review. Financial reads use the signed-in user's client, not the administrative key.

Actual receipts and expense payments update balances together. Exact request retries replay the original result. Nonempty payment references are normalized and reserved even after an owner voids a mistaken entry; replacements require a new reference. A same-record, same-date, same-amount entry requires a reasoned duplicate review. Voids retain history, preserve the latest customer promise for review, and restore the unpaid balance without treating it as expected cash.

Money uses safe integer centavos; promises are distinct from actual cash. Forecasts use Asia/Manila date-only values. Actual audit, session and automation timestamps remain real wall-clock time.

Confirming a receipt plan supersedes its previous expectation, retains the full customer message, and reuses or creates an assigned follow-up. Only one remaining amount/date is selected; a partial promise leaves the remainder visibly unplanned. Past dates need review and contribute no future cash. Completing an unpaid invoice's follow-up requires an outcome and a next assigned action/date. Invoice history retains the changes and links to actual payment records, including voids. What-if previews make no writes and clear when discarded or when leaving the page.

Use [isolated integration fixtures](testing.md) to verify changes. A recorded code gate is not production authorization or a reason to reset shared data.
