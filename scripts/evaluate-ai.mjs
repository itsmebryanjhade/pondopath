import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { createServerClient } from "@supabase/ssr";
import { createTestBusiness, disposeTestBusiness } from "../tests/integration/helpers.ts";

// Only fictional, script-owned records in the guarded integration environment.
assert.equal(process.env.TEST_ENVIRONMENT, "isolated-development");
const origin = process.env.TEST_APP_BASE_URL || "http://localhost:3000";
assert.equal(new URL(origin).origin, "http://localhost:3000", "Live evaluation is limited to the local demo app.");
const cases = JSON.parse(await readFile(new URL("../tests/fixtures/ai-replies.json", import.meta.url), "utf8"));
const fixture = await createTestBusiness();
const jar = new Map();
const client = createServerClient(process.env.TEST_SUPABASE_URL, process.env.TEST_SUPABASE_PUBLISHABLE_KEY, {
  auth: { autoRefreshToken: false },
  cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: values => values.forEach(({ name, value }) => jar.set(name, value)) },
});
const results = [];
try {
  const { error } = await client.auth.signInWithPassword(fixture.accounts.finance);
  assert.equal(error, null, "Fictional evaluation account could not sign in.");
  const initial = await client.rpc("workspace_snapshot");
  assert.equal(initial.error, null);
  const invoice = initial.data.invoices.find(row => row.id === fixture.invoiceId);
  for (const item of cases) {
    const start = performance.now();
    const response = await fetch(`${origin}/api/assistant`, {
      method: "POST", redirect: "manual", signal: AbortSignal.timeout(40_000),
      headers: { origin, "Content-Type": "application/json", cookie: [...jar].map(([name, value]) => `${name}=${value}`).join("; ") },
      body: JSON.stringify({ task: "extract_reply", invoiceId: invoice.id, reply: item.reply.replaceAll("{invoice}", invoice.number), language: item.language, expectedRevision: initial.data.revision }),
    });
    const value = response.headers.get("content-type")?.includes("application/json") ? await response.json() : { ok: false, code: "NON_JSON_RESPONSE" };
    const actual = value.proposal;
    const passed = response.ok && value.ok && (item.review ? actual.needsReview : !actual.needsReview && actual.invoiceId === invoice.id && actual.amountCents === item.amountCents && actual.date === item.date);
    results.push({ id: item.id, language: item.language, reviewCase: !!item.review, passed: !!passed, status: response.status, code: value.code ?? null, observed: actual ? { amountCents: actual.amountCents, date: actual.date, needsReview: actual.needsReview } : null, milliseconds: Math.round(performance.now() - start), model: value.model ?? null, provider: value.provider ?? null, usage: value.usage ?? null });
    console.log(`${item.id}: ${passed ? "PASS" : "FAIL"} (${response.status})`);
    if ([401, 403, 429, 503].includes(response.status)) break;
  }
  const final = await client.rpc("workspace_snapshot");
  assert.equal(final.error, null);
  assert.equal(final.data.revision, initial.data.revision, "Inference must not write financial records.");
  assert.equal(final.data.forecastInput.availableCents, initial.data.forecastInput.availableCents);
  const explicit = results.filter(row => !row.reviewCase && row.passed).length;
  const reviews = results.filter(row => row.reviewCase && row.passed).length;
  const report = { evaluatedAt: new Date().toISOString(), environment: "isolated-development", fictionalDataOnly: true, explicitPassed: explicit, explicitTarget: 9, reviewPassed: reviews, reviewTarget: 5, financialWrites: 0, complete: results.length === cases.length && explicit >= 9 && reviews === 5, results };
  await writeFile(new URL("../docs/ai-evaluation.json", import.meta.url), JSON.stringify(report, null, 2) + "\n");
  console.log(`Explicit ${explicit}/10; review ${reviews}/5; no financial writes.`);
  if (!report.complete) process.exitCode = 1;
} finally { await disposeTestBusiness(fixture); }
