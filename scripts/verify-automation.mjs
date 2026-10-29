import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

process.loadEnvFile(".env.test.local");
const { admin, callCommand, createTestBusiness, disposeTestBusiness, signInAs } = await import("../tests/integration/helpers.ts");
const root = process.cwd();
const runtimeDir = resolve("automation/.runtime/verification");
await mkdir(runtimeDir, { recursive: true });
const token = randomBytes(32).toString("base64url");
const fixture = await createTestBusiness();
let app, worker;
let appLog = "", workerLog = "";
const checked = result => { assert.equal(result.error, null); return result.data; };
const delay = ms => new Promise(resolveDelay => setTimeout(resolveDelay, ms));
async function until(check, label, milliseconds = 30_000) {
  const end = Date.now() + milliseconds;
  while (Date.now() < end) { if (await check()) return; await delay(400); }
  throw new Error("Timed out: " + label);
}
function launch(args, env, log) {
  const child = spawn(process.execPath, args, { cwd: root, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.on("data", data => log(data.toString()));
  child.stderr.on("data", data => log(data.toString()));
  child.on("error", () => { log("Child process failed to start."); });
  return child;
}
async function stop(child) {
  if (!child || child.exitCode !== null) return;
  const exited = once(child, "exit");
  child.kill();
  await exited;
}
async function expectation(invoiceId) {
  checked(await admin.from("expectations").insert({ business_id: fixture.id, invoice_id: invoiceId, amount_cents: 5_000_000, remaining_cents: 5_000_000, expected_date: "2026-10-28", kind: "commitment", source_note: "Isolated runtime test", confirmed_by: fixture.accounts.finance.id }));
}
async function successes() {
  return checked(await admin.from("automation_runs").select("run_id").eq("business_id", fixture.id).eq("source", "scheduled").eq("status", "success")).length;
}
async function trigger() {
  const response = await fetch("http://127.0.0.1:1881/inject/pondopath-inject", { method: "POST", signal: AbortSignal.timeout(5000) });
  assert.equal(response.status, 200);
}
function startWorker() {
  // The worker receives only its narrow token and public app address, never database keys.
  return launch(["automation/node_modules/node-red/red.js", "--settings", "automation/settings.cjs", "--userDir", runtimeDir, "--port", "1881", resolve("automation/flows.json")], {
    PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, USERPROFILE: process.env.USERPROFILE,
    APP_URL: "http://127.0.0.1:3002", AUTOMATION_TOKEN: token,
  }, text => { workerLog += text; });
}
async function api(body) {
  const response = await fetch("http://127.0.0.1:3002/api/automation/followups", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(10_000) });
  assert.equal(response.status, 200);
  return response.json();
}
const evidence = { verifiedAt: new Date().toISOString(), node: process.version, nodeRed: "5.0.9", checks: [] };
try {
  await expectation(fixture.invoiceId);
  app = launch(["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3002"], {
    ...process.env, NEXT_PUBLIC_SUPABASE_URL: process.env.TEST_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.TEST_SUPABASE_PUBLISHABLE_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.TEST_SUPABASE_SERVICE_ROLE_KEY, AUTOMATION_TOKEN: token, AUTOMATION_BUSINESS_ID: fixture.id, APP_URL: "http://127.0.0.1:3002",
  }, text => { appLog += text; });
  await until(async () => {
    try { return (await fetch("http://127.0.0.1:3002/api/automation/followups", { method: "POST", signal: AbortSignal.timeout(1000) })).status === 401; } catch { return false; }
  }, "isolated production app");
  worker = startWorker();
  await until(async () => await successes() === 1, "startup flow");
  assert.equal(checked(await admin.from("followups").select("id").eq("business_id", fixture.id)).length, 1);
  evidence.checks.push("Actual Node-RED startup scan/create/finish created one task through the real app endpoint.");
  await trigger();
  await until(async () => await successes() === 2, "repeat flow");
  assert.equal(checked(await admin.from("followups").select("id").eq("business_id", fixture.id)).length, 1);
  evidence.checks.push("Repeated actual flow preserved one task.");

  const interrupted = await api({ operation: "scan" });
  await stop(worker); worker = undefined;
  checked(await admin.from("automation_runs").update({ started_at: new Date(Date.now() - 31 * 60_000).toISOString() }).eq("business_id", fixture.id).eq("run_id", interrupted.runId));
  const secondInvoiceId = randomUUID();
  checked(await admin.from("invoices").insert({ id: secondInvoiceId, business_id: fixture.id, customer_id: fixture.customerId, number: "CATCH-UP-002", amount_cents: 5_000_000, due_date: "2026-10-28" }));
  await expectation(secondInvoiceId);
  worker = startWorker();
  await until(async () => await successes() === 3, "restart catch-up");
  assert.equal(checked(await admin.from("followups").select("id").eq("business_id", fixture.id)).length, 2);
  assert.equal(checked(await admin.from("automation_runs").select("error_code").eq("business_id", fixture.id).eq("run_id", interrupted.runId))[0].error_code, "INTERRUPTED");
  evidence.checks.push("Restart caught a new missed commitment and marked the interrupted old run failed.");

  const member = await signInAs(fixture.accounts.finance);
  const before = checked(await member.rpc("workspace_snapshot"));
  checked(await callCommand(member, { requestId: randomUUID(), expectedRevision: before.revision, type: "post_cash_movement", payload: { kind: "receipt", parentId: fixture.invoiceId, amountCents: 5_000_000, date: "2026-10-29", reference: "Isolated Node-RED verification receipt" } }));
  await trigger();
  await until(async () => await successes() === 4, "after receipt flow");
  const after = checked(await member.rpc("workspace_snapshot"));
  assert.equal(after.followups.filter(task => task.invoice_id === fixture.invoiceId && task.state === "open").length, 0);
  assert.equal(after.forecastInput.availableCents, 9_000_000);
  evidence.checks.push("A recorded receipt resolved its task; rerun did not recreate it or post additional cash.");

  await stop(app); app = undefined;
  await trigger();
  await until(async () => workerLog.includes("Follow-up check unavailable."), "connection failure");
  checked(await admin.from("automation_runs").update({ finished_at: new Date(Date.now() - 31 * 60_000).toISOString() }).eq("business_id", fixture.id).eq("status", "success"));
  assert.equal(checked(await member.rpc("workspace_snapshot")).automation.stale, true);
  checked(await member.rpc("check_missed_commitments"));
  assert.equal(checked(await member.rpc("workspace_snapshot")).automation.stale, true);
  evidence.checks.push("Unreachable app produced a bounded failure; stale status remained visible after a manual fallback.");
  assert.equal(workerLog.includes(token), false);
  assert.equal(appLog.includes(token), false);
  const { readFile } = await import("node:fs/promises");
  assert.equal((await readFile("automation/flows.json", "utf8")).includes(token), false);
  await writeFile("docs/automation-runtime-evidence.json", JSON.stringify(evidence, null, 2) + "\n");
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  await stop(worker);
  await stop(app);
  // Keep local logs for diagnosis without emitting configuration or credentials.
  await writeFile(resolve(runtimeDir, "worker.log"), workerLog.replaceAll(token, "[redacted]"));
  await writeFile(resolve(runtimeDir, "app.log"), appLog.replaceAll(token, "[redacted]"));
  await disposeTestBusiness(fixture);
}
