# PondoPath follow-up worker

This is a separate Node-RED process, not part of Vercel. It scans on startup and every 900 seconds. The blue Inject button in the editor also runs the same flow. Only built-in nodes are used.

## Local start

Use Node 24. From the project root:

```powershell
npm ci --prefix automation --ignore-scripts
npm --prefix automation start
```

Before the first start, create an **uncommitted** `.env.automation.local` in the project root:

```dotenv
APP_URL=http://localhost:3000
AUTOMATION_TOKEN=the-same-server-issued-token-as-the-app
```

Use the existing random token from the app's `.env.local`, at least 32 characters. The app alone also has `AUTOMATION_BUSINESS_ID`. Never put Supabase keys, account passwords or the token into the exported flow, a Debug node, or public environment variables. Restart the worker after changing its environment. The flow uses the fixed `/api/automation/followups` endpoint, refuses redirects, and has a 15-second HTTP timeout.

The editor binds to **127.0.0.1:1880**. It is intended for this trusted local development computer. It has no network authentication; do not expose or tunnel it. Before remote use, configure HTTPS and `adminAuth` according to [Node-RED's security guide](https://nodered.org/docs/user-guide/runtime/securing-node-red). HTTP In endpoints and installing extra nodes are disabled. Node-RED's generated credential-key notice does not contain the automation token; this flow stores its token only in the runtime environment.

Stop a foreground run with Ctrl+C. For the currently backgrounded development run, the owned process ID is saved in `automation/.runtime/worker.pid`; stop only that process after checking it is the Node-RED worker. No Windows service or automatic login startup is installed.

## What happens

1. Scan customer-confirmed commitments whose date is strictly before the business's Manila/reference date and whose remaining amount is positive.
2. Recheck those records under the same business lock as payments and create one missed-commitment task per expectation. The existing assignee is preferred, otherwise the confirmer or another current business member. Repeated runs preserve completed tasks.
3. Finish the run only after every scanned candidate was checked. Record a bounded failure code if the app is reachable. An unreachable app cannot record that connection attempt; the stale status still exposes the outage.

The Follow-ups tab shows last scheduled attempt, last success, failure and manual check. It becomes stale after 30 minutes without scheduled success. **Check now** uses the same database rules, but does not mark the scheduled worker healthy. Refresh records to see a worker run completed since the page loaded.

Laptop sleep, stopped processes, a stopped app and lost Internet can pause checks. On restart the startup scan catches all still-actionable missed commitments. No payment or customer message is sent, and expected receipts never become cash automatically.

## Verification

After building the app and installing the separate worker, run from the project root:

```powershell
node scripts/verify-automation.mjs
```

It requires the dedicated `.env.test.local` development credentials. It provisions disposable fictional data, starts a temporary production app on 127.0.0.1:3002 and a worker on 127.0.0.1:1881, verifies restart/repeat/receipt/outage behavior, then stops its processes and removes only its own test fixture. These ports must be unused. Evidence is written to `docs/automation-runtime-evidence.json`; local diagnostic logs remain ignored under `.runtime/verification/`.
