import { randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { admin, anonymous, signInAs } from "./helpers";

describe("public workspace creation", () => {
  it("signs up immediately in the development project", async () => {
    const email = `signup+${randomUUID()}@soloforge.example`;
    const client = createClient(process.env.TEST_SUPABASE_URL!, process.env.TEST_SUPABASE_PUBLISHABLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const signup = await client.auth.signUp({ email, password: randomBytes(24).toString("base64url") });
    expect(signup.error).toBeNull();
    expect(signup.data.session).not.toBeNull();
    const userId = signup.data.user!.id;
    let businessId: string | undefined;
    try {
      expect((await client.rpc("create_business_workspace", { p_name: " ", p_display_name: "New Owner" })).error).not.toBeNull();
      const created = await client.rpc("create_business_workspace", { p_name: "Immediate Signup Test", p_display_name: "New Owner" });
      expect(created.error).toBeNull();
      businessId = created.data as string;
      const snapshot = await client.rpc("workspace_snapshot");
      expect(snapshot.data).toMatchObject({ business: { id: created.data, is_demo: false }, actor: { role: "owner" } });
    } finally {
      await client.auth.signOut();
      if (businessId) {
        const removed = await admin.from("businesses").delete().eq("id", businessId).eq("name", "Immediate Signup Test");
        expect(removed.error).toBeNull();
      }
      const removed = await admin.auth.admin.deleteUser(userId);
      expect(removed.error).toBeNull();
    }
  });

  it("creates one empty private business for a signed-in new owner", async () => {
    const email = `signup+${randomUUID()}@soloforge.example`;
    const password = randomBytes(24).toString("base64url");
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    expect(created.error).toBeNull();
    const user = created.data.user!;
    let businessId: string | undefined;
    try {
      const userClient = await signInAs({ id: user.id, email, password });
      expect((await anonymous.rpc("create_business_workspace", { p_name: "Unauthorized", p_display_name: "Anyone" })).error).not.toBeNull();
      const result = await userClient.rpc("create_business_workspace", { p_name: "Signup Test Business", p_display_name: "Test Owner" });
      expect(result.error).toBeNull();
      businessId = result.data as string;
      const snapshot = await userClient.rpc("workspace_snapshot");
      expect(snapshot.error).toBeNull();
      expect(snapshot.data).toMatchObject({
        business: { id: businessId, name: "Signup Test Business", is_demo: false, opening_cash_cents: 0 },
        actor: { userId: user.id, businessId, role: "owner" },
        customers: [], invoices: [], expenses: [],
      });
      const repeated = await userClient.rpc("create_business_workspace", { p_name: "Another Business", p_display_name: "Test Owner" });
      expect(repeated.error).not.toBeNull();
      expect((await anonymous.from("businesses").select("id").eq("id", businessId)).error).not.toBeNull();
      await userClient.auth.signOut();
    } finally {
      if (businessId) {
        const removed = await admin.from("businesses").delete().eq("id", businessId).eq("name", "Signup Test Business");
        expect(removed.error).toBeNull();
      }
      const removed = await admin.auth.admin.deleteUser(user.id);
      expect(removed.error).toBeNull();
    }
  });
});
