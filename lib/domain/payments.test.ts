import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { workspaceCommandSchema } from "./commands";
const envelope = { requestId: randomUUID(), expectedRevision: 0 };
const receipt = { kind: "receipt", parentId: randomUUID(), amountCents: 2_000_000, date: "2026-10-29", reference: "BANK-001" };

describe("cash movement command boundary", () => {
  it.each([
    { type: "post_cash_movement", payload: receipt },
    { type: "post_cash_movement", payload: { ...receipt, kind: "expense_payment", reference: "" } },
    { type: "post_cash_movement", payload: { ...receipt, duplicateReviewed: true, duplicateReviewReason: "Checked a separate bank transaction." } },
    { type: "void_cash_movement", payload: { movementId: randomUUID(), reason: "Incorrect amount recorded." } },
  ])("accepts $type", input => expect(workspaceCommandSchema.safeParse({ ...envelope, ...input }).success).toBe(true));

  it.each([
    { amountCents: 0 }, { amountCents: 0.5 }, { amountCents: 100_000_000_000 },
    { date: "2026-02-30" }, { parentId: "bad" }, { kind: "transfer" },
    { reference: "x".repeat(101) }, { duplicateReviewed: true },
    { duplicateReviewed: "true", duplicateReviewReason: "Checked" },
    { duplicateReviewed: false, duplicateReviewReason: "Not confirmed" },
    { duplicateReviewed: true, duplicateReviewReason: " " }, { businessId: randomUUID() },
  ])("rejects invalid receipt input %j", invalid => {
    expect(workspaceCommandSchema.safeParse({ ...envelope, type: "post_cash_movement", payload: { ...receipt, ...invalid } }).success).toBe(false);
  });
  it("requires a void reason and rejects caller authority overrides", () => {
    for (const payload of [{ movementId: randomUUID(), reason: "" }, { movementId: randomUUID(), reason: "Correction", role: "owner" }]) {
      expect(workspaceCommandSchema.safeParse({ ...envelope, type: "void_cash_movement", payload }).success).toBe(false);
    }
  });
});
