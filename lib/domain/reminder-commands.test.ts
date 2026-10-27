import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { workspaceCommandSchema } from "./commands";

const envelope = { requestId: randomUUID(), expectedRevision: 2 };
const id = randomUUID();
const approvalBasis = "a".repeat(64);

describe("reminder command boundary", () => {
  it.each([
    { type: "save_reminder", payload: { invoiceId: randomUUID(), recipient: "accounts@example.com", body: "Please review the invoice balance." } },
    { type: "submit_reminder", payload: { id, reminderVersion: 1 } },
    { type: "approve_reminder", payload: { id, reminderVersion: 2, approvalBasis } },
    { type: "reject_reminder", payload: { id, reminderVersion: 2, approvalBasis, reason: "Correct the recipient." } },
    { type: "report_manual_send", payload: { id, reminderVersion: 3, channel: "Email", sentAt: "2026-10-29T09:30:00+08:00" } },
  ])("accepts $type", (command) => {
    expect(workspaceCommandSchema.safeParse({ ...envelope, ...command }).success).toBe(true);
  });

  it.each([
    { type: "save_reminder", payload: { invoiceId: id, recipient: " ", body: "Text" } },
    { type: "submit_reminder", payload: { id, reminderVersion: 0 } },
    { type: "approve_reminder", payload: { id, reminderVersion: 2, approvalBasis: "not-a-digest" } },
    { type: "reject_reminder", payload: { id, reminderVersion: 2, approvalBasis, reason: "" } },
    { type: "report_manual_send", payload: { id, reminderVersion: 3, channel: "Email", sentAt: "2026-10-29 09:30" } },
  ])("rejects invalid $type", (command) => {
    expect(workspaceCommandSchema.safeParse({ ...envelope, ...command }).success).toBe(false);
  });
});
