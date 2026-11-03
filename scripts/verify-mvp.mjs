import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { access, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { createServerClient } from "@supabase/ssr";

process.loadEnvFile(".env.test.local");
const { admin, callCommand, createTestBusiness, disposeTestBusiness, signInAs } = await import("../tests/integration/helpers.ts");
const checked = result => { assert.equal(result.error, null); return result.data; };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const base = "http://127.0.0.1:3002";
const fixture = await createTestBusiness();
const token = randomBytes(32).toString("base64url");
const evidence = { verifiedAt: new Date().toISOString(), node: process.version, checks: [], timingsMs: {} };
let app, output = "";
try {
  if (process.env.TEST_BROWSER_PASSWORD) {
    assert.ok(process.env.TEST_BROWSER_PASSWORD.length >= 24);
    checked(await admin.auth.admin.updateUserById(fixture.accounts.owner.id, { password: process.env.TEST_BROWSER_PASSWORD }));
    fixture.accounts.owner.password = process.env.TEST_BROWSER_PASSWORD;
  }
  app = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3002"], {
    windowsHide: true, stdio: ["ignore", "pipe", "pipe"], env: {
      ...process.env, APP_URL: base, NEXT_PUBLIC_SUPABASE_URL: process.env.TEST_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.TEST_SUPABASE_PUBLISHABLE_KEY,
      SUPABASE_SERVICE_ROLE_KEY: process.env.TEST_SUPABASE_SERVICE_ROLE_KEY,
      OPENROUTER_API_KEY: "", AUTOMATION_TOKEN: token, AUTOMATION_BUSINESS_ID: fixture.id,
    },
  });
  app.stdout.on("data", bytes => { output += bytes; });
  app.stderr.on("data", bytes => { output += bytes; });
  app.on("error", error => { output += error.message; });
  let ready = false;
  for (let count = 0; count < 60; count++) {
    try { ready = (await fetch(base + "/login")).status === 200; } catch { /* Startup has not bound its port yet. */ }
    if (ready) break;
    await delay(250);
  }
  assert.equal(ready, true, "Isolated production app must start");
  const cookies = new Map();
  const client = createServerClient(process.env.TEST_SUPABASE_URL, process.env.TEST_SUPABASE_PUBLISHABLE_KEY, {
    cookies: { getAll: () => [...cookies].map(([name, value]) => ({ name, value })), setAll: values => values.forEach(({ name, value }) => cookies.set(name, value)) },
  });
  checked(await client.auth.signInWithPassword(fixture.accounts.owner));
  const cookie = () => [...cookies].map(([name, value]) => `${name}=${value}`).join("; ");
  const ai = (headers = {}) => fetch(base + "/api/assistant", { method: "POST", redirect: "manual", headers: { Origin: base, "Content-Type": "application/json", ...headers }, body: JSON.stringify({ task: "explain", question: "Ano ang cash plan?", expectedRevision: 0 }) });
  const unauthenticated = await ai();
  assert.equal(unauthenticated.status, 307);
  assert.match(unauthenticated.headers.get("location"), /\/login/);
  assert.equal((await ai({ Origin: "https://untrusted.example", Cookie: cookie() })).status, 403);
  assert.equal((await fetch(base + "/api/automation/followups", { method: "POST", headers: { Authorization: "Bearer incorrect", "Content-Type": "application/json" }, body: '{"operation":"scan"}' })).status, 401);
  const unavailable = await ai({ Cookie: cookie() });
  assert.equal(unavailable.status, 503);
  assert.equal((await unavailable.json()).code, "AI_UNAVAILABLE");
  evidence.checks.push("Real HTTP: anonymous AI redirects to login; mismatched Origin is 403; wrong automation token is 401; signed-in AI without a key is recoverable 503. No model called.");

  // Expired access material plus this fixture's valid refresh token exercises the actual proxy refresh path.
  const names = [...cookies.keys()].filter(name => name.includes("auth-token")).sort();
  const session = JSON.parse(Buffer.from(names.map(name => cookies.get(name)).join("").slice(7), "base64url").toString());
  const pieces = session.access_token.split(".");
  const claims = JSON.parse(Buffer.from(pieces[1], "base64url").toString());
  claims.exp = 1;
  pieces[1] = Buffer.from(JSON.stringify(claims)).toString("base64url");
  session.access_token = pieces.join("."); session.expires_at = 1;
  const encoded = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");
  const expired = names.map((name, index) => `${name}=${encoded.slice(index * 3180, (index + 1) * 3180)}`).join("; ");
  const refreshed = await fetch(base + "/overview", { headers: { Cookie: expired }, redirect: "manual" });
  assert.equal(refreshed.status, 200);
  assert.ok(refreshed.headers.getSetCookie().some(value => value.includes("auth-token")));
  assert.ok((await refreshed.text()).includes(fixture.name));
  evidence.checks.push("An expired fixture access token with a valid refresh token was renewed by the real proxy; protected overview rendered with updated session cookies.");

  const member = await signInAs(fixture.accounts.finance);
  const records = Array.from({ length: 999 }, (_, index) => ({ business_id: fixture.id, label: "Fictional scale bill " + index, payee: "Fictional supplier", amount_cents: 100, due_date: "2026-10-30" }));
  checked(await admin.from("expenses").insert(records));
  const start = performance.now();
  const snapshot = checked(await member.rpc("workspace_snapshot"));
  const saved = checked(await callCommand(member, { requestId: randomUUID(), expectedRevision: snapshot.revision, type: "save_customer", payload: { name: "Acceptance customer", contactName: "Fictional contact" } }));
  const after = checked(await member.rpc("workspace_snapshot"));
  evidence.timingsMs.saveAndRefetch1000Records = Number((performance.now() - start).toFixed(2));
  assert.equal(after.revision, saved.revision);
  assert.equal(after.expenses.length + after.invoices.length, 1000);
  checked(await admin.from("expenses").delete().eq("business_id", fixture.id));
  evidence.checks.push("A real save and snapshot refetch completed with 1,000 financial records; temporary scale records removed before browser review.");

  const secrets = [process.env.TEST_SUPABASE_SERVICE_ROLE_KEY, token].filter(Boolean);
  async function scan(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = directory + "/" + entry.name;
      if (entry.isDirectory()) await scan(path);
      else if (/\.(?:js|json|css)$/.test(entry.name)) {
        const text = await readFile(path, "utf8");
        assert.equal(secrets.some(secret => text.includes(secret)), false, "Server secret in browser artifact");
      }
    }
  }
  await scan(".next/static");
  const flow = await readFile("automation/flows.json", "utf8");
  assert.equal(secrets.some(secret => flow.includes(secret) || output.includes(secret)), false);
  evidence.checks.push("Production browser assets, exported flow and captured isolated-server diagnostics contained neither tested server key nor automation token.");
  await writeFile("docs/mvp-runtime-evidence.json", JSON.stringify(evidence, null, 2) + "\n");
  console.log(JSON.stringify({ checks: evidence.checks.length, timingsMs: evidence.timingsMs, browserEmail: fixture.accounts.owner.email, base }));
  if (process.env.TEST_BROWSER_PASSWORD) {
    const finish = `.superpowers/sdd/2026-10-27-cash-flow-action-planner/finish-${fixture.id}`;
    console.log("Browser review ready; create " + finish + " to clean up. Automatic cleanup after 20 minutes.");
    const deadline = Date.now() + 20 * 60_000;
    while (Date.now() < deadline && !await access(finish).then(() => true, () => false)) await delay(300);
    await unlink(finish).catch(() => {});
  }
} finally {
  if (app && app.exitCode === null) { const exited = once(app, "exit"); app.kill(); await exited; }
  await disposeTestBusiness(fixture);
}
