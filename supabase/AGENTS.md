# Database scope

- Read [database rules](../docs/database.md) and relevant PRD criteria. Apply the installed Supabase and Postgres-best-practices skills to schema, query or policy work, with security and current official guidance where relevant.
- Use versioned migrations; inspect actual applied development history before choosing a new version. Do not recreate existing tables manually or treat development authorization as production authorization.
- Preserve per-business isolation, authenticated membership, owner-only actions, RLS and least-privilege RPC grants. Test permissions with owner, finance and unrelated-business identities.
- Preserve atomic balance/history updates, idempotency, duplicate handling, stale-revision rejection and correction history. Keep actual cash distinct from expectations and scenarios.
- Use isolated owned fixtures for database checks. Do not reset the shared project, delete the demo business or apply development fixtures to production.
