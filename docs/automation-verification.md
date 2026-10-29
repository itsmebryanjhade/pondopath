# Missed-commitment automation verification

Date: 29 October 2026. Native implementation, Node 24.22.1, separate Node-RED 5.0.9 runtime. Dedicated development database only; no real customer data.

## Results

- Unit suite: 248/248 passed. New endpoint checks cover missing/wrong tokens, fixed business scope, rejected cash/approval operations, strict request shape, actual 64 KiB body limit, 1,000-item limit and bounded failure responses.
- Automation, collection and payment integration suites: 51/51 passed using real signed-in database clients. Covered strict-before date, active confirmed commitments only, changed/fulfilled/superseded/needs-review entries, concurrent and repeated creation, human completion, inaccessible foreign run/IDs, member fallback, interrupted runs, received cash, 1,001-candidate rejection and failure status.
- Real runtime: five end-to-end cases passed through Node-RED and the actual production app HTTP endpoint. See [machine-readable evidence](automation-runtime-evidence.json). A temporary app and isolated fictional business protected the interactive demo records; all verification processes and that fixture were cleaned up.
- Browser: Enter activated Check now in the real localhost Follow-ups page, showed a pending state and reported zero new/already-tracked/skipped tasks. At 480 CSS pixels the button stayed at least 44px high and the document had no horizontal overflow. Manual success retained scheduled downtime.
- Lint and standalone typecheck passed. Production compilation, typechecking and prerendering passed with `npm run build -- --webpack`.

## Limits and outstanding verification

The default Turbopack build crashed twice while starting its CSS worker (child exit code 0, with no child output); retrying with normal process permissions did not resolve it. The supported alternate builder passed; default build configuration was left intact. This is a build limitation to resolve before deployment, not evidence of a broken automation endpoint. The full MVP acceptance/deployment pass remains Task 11.

The browser screenshot service could not capture this tab during this slice; browser checks above are actual DOM/interaction observations, not fabricated visual proof. Screenshot appearance is unverified. Graphify refresh remains blocked by the existing Windows application-control restriction; focused source reads were used.

The laptop worker pauses during sleep or when the worker/app/network is unavailable. Catch-up runs on restart; an attempt that never reaches the app cannot create a server run record. No always-on host or deployment was configured. It uses the existing demo workspace's configured token, stored only in ignored environment files. The Node-RED editor is loopback-only; see [worker setup and security](../automation/README.md).

The existing [Supabase leaked-password protection warning](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) remains outside this slice. The new public definer warning was removed by retaining the repository's private implementation/public invoker pattern.
