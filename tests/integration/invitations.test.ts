import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { admin, anonymous, createTestBusiness, disposeTestBusiness, type TestBusiness } from "./helpers";

let fixture: TestBusiness;
const invitedIds = new Set<string>();
beforeAll(async () => { fixture = await createTestBusiness(); });
afterAll(async () => {
  await anonymous.auth.signOut();
  if (fixture) await disposeTestBusiness(fixture);
  for (const id of invitedIds) {
    const deleted = await admin.auth.admin.deleteUser(id);
    if (deleted.error) throw new Error("Disposable invitation cleanup failed.");
  }
});

it("native invitations support reissue, verified password setup and one-use links without sending email", async () => {
  const email = "invited+" + randomUUID() + "@soloforge.example";
  const first = await admin.auth.admin.generateLink({ type: "invite", email });
  expect(first.error).toBeNull();
  const id = first.data.user!.id;
  invitedIds.add(id);
  expect(first.data.user!.email_confirmed_at).toBeFalsy();
  const member = await admin.from("memberships").insert({ business_id: fixture.id, user_id: id, role: "finance", display_name: "Invited test teammate" });
  expect(member.error).toBeNull();
  const second = await admin.auth.admin.generateLink({ type: "invite", email });
  expect(second.error).toBeNull();
  expect(second.data.user!.id).toBe(id);
  // An invalid token must never create an authenticated workspace session.
  const invalid = await anonymous.auth.verifyOtp({ type: "invite", token_hash: "0".repeat(64) });
  expect(invalid.error).not.toBeNull();
  const accepted = await anonymous.auth.verifyOtp({ type: "invite", token_hash: second.data.properties!.hashed_token });
  expect(accepted.error).toBeNull();
  expect(accepted.data.user!.id).toBe(id);
  const password = randomUUID() + "aA!";
  expect((await anonymous.auth.updateUser({ password })).error).toBeNull();
  const ownMember = await anonymous.from("memberships").select("role,business_id").single();
  expect(ownMember.data).toEqual({ role: "finance", business_id: fixture.id });
  await anonymous.auth.signOut();
  const replay = await anonymous.auth.verifyOtp({ type: "invite", token_hash: second.data.properties!.hashed_token });
  expect(replay.error).not.toBeNull();
  const signedIn = await anonymous.auth.signInWithPassword({ email, password });
  expect(signedIn.error).toBeNull();
  await anonymous.auth.signOut();
  const confirmed = await admin.auth.admin.generateLink({ type: "invite", email });
  expect(confirmed.error).not.toBeNull();
});
