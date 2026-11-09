import { randomBytes, randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.TEST_SUPABASE_URL;
const publishableKey = process.env.TEST_SUPABASE_PUBLISHABLE_KEY;
const serviceKey = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;
if (process.env.TEST_ENVIRONMENT !== "isolated-development" ||
    url !== "https://vhdokiicswumirqxmbpn.supabase.co" || !publishableKey || !serviceKey) {
  throw new Error("Integration tests require the dedicated development project and .env.test.local credentials.");
}

const options = { auth: { persistSession: false, autoRefreshToken: false } };
export const admin = createClient(url, serviceKey, options);
export const anonymous = createClient(url, publishableKey, options);

type TestAccount = { id: string; email: string; password: string };
export type TestBusiness = {
  id: string;
  name: string;
  customerId: string;
  invoiceId: string;
  accounts: { owner: TestAccount; finance: TestAccount };
};

export async function createTestBusiness(): Promise<TestBusiness> {
  const id = randomUUID();
  const name = "test-" + id;
  const customerId = randomUUID();
  const invoiceId = randomUUID();
  const business = await admin.from("businesses").insert({
    id, name, opening_cash_cents: 4_000_000, opening_date: "2026-10-26",
    is_demo: true, demo_reference_date: "2026-10-29",
  });
  if (business.error) throw new Error("Isolated business setup failed: " + business.error.code);
  const accounts = {} as TestBusiness["accounts"];
  try {
    for (const role of ["owner", "finance"] as const) {
      const email = role + "+" + id + "@soloforge.example";
      const password = randomBytes(24).toString("base64url");
      const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (error || !data.user) throw new Error("Test user provisioning failed.");
      accounts[role] = { id: data.user.id, email, password };
      const member = await admin.from("memberships").insert({ business_id: id, user_id: data.user.id, role, display_name: "Test " + role });
      if (member.error) throw new Error("Test membership setup failed: " + member.error.code);
    }
    const customer = await admin.from("customers").insert({ id: customerId, business_id: id, name: "Test customer", contact_name: "Test contact" });
    if (customer.error) throw new Error("Test customer setup failed: " + customer.error.code);
    const invoice = await admin.from("invoices").insert({ id: invoiceId, business_id: id, customer_id: customerId, number: "INV-001", amount_cents: 5_000_000, due_date: "2026-10-29" });
    if (invoice.error) throw new Error("Test invoice setup failed: " + invoice.error.code);
    return { id, name, customerId, invoiceId, accounts };
  } catch (error) {
    await disposeTestBusiness({ id, name, customerId, invoiceId, accounts });
    throw error;
  }
}

export async function signInAs(account: TestAccount): Promise<SupabaseClient> {
  const client = createClient(url!, publishableKey!, options);
  const { error } = await client.auth.signInWithPassword({ email: account.email, password: account.password });
  if (error) throw new Error("Test sign-in failed.");
  return client;
}

export function callCommand(client: SupabaseClient, command: object) {
  return client.rpc("workspace_command", { p_command: command });
}

export async function disposeTestBusiness(fixture: TestBusiness): Promise<void> {
  if (!fixture.name.startsWith("test-") || fixture.name !== "test-" + fixture.id) {
    throw new Error("Refusing to delete a business without this fixture's ownership marker.");
  }
  const result = await admin.from("businesses").delete().eq("id", fixture.id).eq("name", fixture.name);
  if (result.error) throw new Error("Test business cleanup failed: " + (result.error.code || result.error.message));
  for (const account of Object.values(fixture.accounts)) {
    const { error } = await admin.auth.admin.deleteUser(account.id);
    if (error) throw new Error("Test account cleanup failed.");
  }
}
