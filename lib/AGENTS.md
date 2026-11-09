# Domain and server-helper scope

- Inspect the shared helper's callers and owning tests before changing it. Reuse its current module boundary and validation/error conventions.
- For money, dates, forecasts, payments or intake, read the relevant PRD criteria and [database/financial rules](../docs/database.md). Test meaningful edge/failure cases before changing nontrivial behavior.
- For auth, customer data, secrets or external services, apply the relevant security and current official-integration guidance. Use the Supabase skill when working with Supabase.
- Keep server-only keys and privileged clients off client paths. Derive business/role permissions from authenticated membership, not request fields.
- Preserve atomic writes/history, retry protection and stale-confirmation checks. AI output is an untrusted proposal; it cannot post cash or bypass review.
