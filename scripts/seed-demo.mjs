import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { loadEnvFile } from "node:process";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

loadEnvFile(".env.local");
const projectUrl = "https://vhdokiicswumirqxmbpn.supabase.co";
if (process.env.SOLOFORGE_ENVIRONMENT !== "development" ||
    process.env.NEXT_PUBLIC_SUPABASE_URL !== projectUrl || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Seed requires the dedicated fictional development environment.");
}
const admin = createClient(projectUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
function saveLocal(name, value) {
  let file = readFileSync(".env.local", "utf8");
  const line = name + "=" + value;
  const pattern = new RegExp("^" + name + "=.*$", "m");
  file = pattern.test(file) ? file.replace(pattern, line) : file.trimEnd() + "\n" + line + "\n";
  writeFileSync(".env.local", file);
  process.env[name] = value;
}
function checked(result, operation) {
  if (result.error) throw new Error(operation + " failed: " + (result.error.code ?? "SERVICE_UNAVAILABLE"));
  return result.data;
}
const businessId = process.env.AUTOMATION_BUSINESS_ID || randomUUID();
saveLocal("AUTOMATION_BUSINESS_ID", businessId);
let business = checked(await admin.from("businesses").select("*").eq("id", businessId).maybeSingle(), "Business lookup");
if (!business) {
  business = checked(await admin.from("businesses").insert({
    id: businessId, name: "SoloForge Demo Services", opening_cash_cents: 4_000_000,
    opening_date: "2026-10-26", is_demo: true, demo_reference_date: "2026-10-26",
  }).select().single(), "Demo business creation");
}
assert.equal(business.is_demo, true, "Refusing to seed a real business.");
assert.equal(business.name, "SoloForge Demo Services", "Refusing an unrelated workspace.");
const accounts = {};
for (const role of ["owner", "finance"]) {
  const prefix = "DEMO_" + role.toUpperCase();
  const email = role + "+" + businessId + "@soloforge.example";
  const password = process.env[prefix + "_PASSWORD"] || randomBytes(24).toString("base64url");
  saveLocal(prefix + "_EMAIL", email);
  saveLocal(prefix + "_PASSWORD", password);
  let user;
  const savedId = process.env[prefix + "_USER_ID"];
  if (savedId) user = checked(await admin.auth.admin.getUserById(savedId), "Demo account lookup").user;
  if (!user) {
    // Recover only this seed's exact fictional account after an interrupted setup.
    for (let page = 1; !user; page++) {
      const listed = checked(await admin.auth.admin.listUsers({ page, perPage: 100 }), "Demo recovery lookup");
      user = listed.users.find(candidate => candidate.email === email);
      if (listed.users.length < 100) break;
    }
  }
  if (!user) user = checked(await admin.auth.admin.createUser({ email, password, email_confirm: true }), "Demo account creation").user;
  assert.equal(user.email, email, "Refusing to alter an unrelated account.");
  saveLocal(prefix + "_USER_ID", user.id);
  const member = checked(await admin.from("memberships").select("*").eq("user_id", user.id).maybeSingle(), "Membership lookup");
  if (member) assert.equal(member.business_id, businessId, "Account belongs to another workspace.");
  else checked(await admin.from("memberships").insert({ business_id: businessId, user_id: user.id, role, display_name: role === "owner" ? "Demo Owner" : "Demo Finance" }), "Membership creation");
  accounts[role] = user.id;
}
let invoice = checked(await admin.from("invoices").select("*").eq("business_id", businessId).eq("number", "DEMO-001").maybeSingle(), "Demo invoice lookup");
if (!invoice) {
  let customer = checked(await admin.from("customers").select("*").eq("business_id", businessId).eq("name", "Demo Client Services").maybeSingle(), "Demo customer lookup");
  if (!customer) customer = checked(await admin.from("customers").insert({ business_id: businessId, name: "Demo Client Services", contact_name: "Demo Accounts Contact", email: "accounts@client.example" }).select().single(), "Demo customer creation");
  invoice = checked(await admin.from("invoices").insert({ business_id: businessId, customer_id: customer.id, number: "DEMO-001", amount_cents: 5_000_000, due_date: "2026-10-29" }).select().single(), "Demo invoice creation");
}
const expectations = checked(await admin.from("expectations").select("id").eq("business_id", businessId).eq("invoice_id", invoice.id).limit(1), "Demo expectation lookup");
if (expectations.length === 0) checked(await admin.from("expectations").insert({ business_id: businessId, invoice_id: invoice.id, amount_cents: 5_000_000, remaining_cents: 5_000_000, expected_date: "2026-10-29", kind: "assumption", source_note: "Fictional initial assumption for the sample walkthrough.", confirmed_by: accounts.owner }), "Demo expectation creation");
for (const [label, payee, amount] of [["Payroll", "Demo employees", 5_000_000], ["Supplier bill", "Demo supplier", 2_000_000], ["Rent", "Demo landlord", 1_000_000]]) {
  const existing = checked(await admin.from("expenses").select("id").eq("business_id", businessId).eq("label", label).limit(1), "Demo expense lookup");
  if (existing.length === 0) checked(await admin.from("expenses").insert({ business_id: businessId, label, payee, amount_cents: amount, due_date: "2026-10-30" }), "Demo expense creation");
}
for (const role of ["owner", "finance"]) {
  const client = createClient(projectUrl, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const prefix = "DEMO_" + role.toUpperCase();
  checked(await client.auth.signInWithPassword({ email: process.env[prefix + "_EMAIL"], password: process.env[prefix + "_PASSWORD"] }), "Demo sign-in check");
  const snapshot = checked(await client.rpc("workspace_snapshot"), "Demo snapshot check");
  assert.equal(snapshot.business.id, businessId);
  assert.equal(snapshot.actor.role, role);
  checked(await client.auth.signOut(), "Demo sign-out check");
}
console.log("Fictional demo ready; both roles verified. Credentials remain in ignored .env.local. Existing records were preserved.");
