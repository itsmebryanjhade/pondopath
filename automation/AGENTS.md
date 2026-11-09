# Node-RED worker scope

- Read this directory's [runbook](README.md) before changing the worker. It is a separate Node 24 process, not a Next.js/Vercel background job.
- Preserve loopback-only editor binding, fixed app endpoint, redirect refusal, timeouts and server-token handling. Do not expose the unauthenticated local editor or put credentials into flows/debug output.
- Keep repeat/restart/outage handling and missed-commitment checks consistent with app/database rules. The worker cannot send customer messages or convert expectations into cash.
- Use the owning [verification guide](../docs/automation-verification.md) only when the change requires that runtime check and its side effects are authorized. Do not start workers merely to check documentation.
