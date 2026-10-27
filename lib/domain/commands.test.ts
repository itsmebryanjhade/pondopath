import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { CommandError, workspaceCommandSchema } from "./commands";

const envelope = { requestId: randomUUID(), expectedRevision: 0 };
const customerId = randomUUID();
const invoice = { number: "INV-1", customerId, amountCents: 100, dueDate: "2026-10-29" };

describe("record command boundary", () => {
  it.each([
    { type: "set_opening_cash", payload: { amountCents: 0, date: "2026-10-26" } },
    { type: "save_customer", payload: { name: "Ñandú Services", contactName: "María", email: "accounts@example.com", phone: "+63 900 000 0000" } },
    { type: "save_invoice", payload: invoice },
    { type: "save_expense", payload: { label: "Payroll", payee: "Employees", amountCents: 99_999_999_999, dueDate: "2026-10-30" } },
  ])("accepts a valid $type", value => {
    expect(workspaceCommandSchema.safeParse({ ...envelope, ...value }).success).toBe(true);
  });

  it.each([
    { ...invoice, amountCents: 0 },
    { ...invoice, amountCents: -1 },
    { ...invoice, amountCents: 1.5 },
    { ...invoice, amountCents: 100_000_000_000 },
    { ...invoice, amountCents: "100" },
    { ...invoice, dueDate: "2026-02-30" },
    { ...invoice, dueDate: "0000-01-01" },
    { ...invoice, dueDate: "2026-1-1" },
    { ...invoice, customerId: "another-business" },
    { ...invoice, number: " " },
    { ...invoice, number: "x".repeat(101) },
    { ...invoice, role: "owner" },
    { ...invoice, reason: "x".repeat(4001) },
  ])("rejects invalid invoice values %j", payload => {
    expect(workspaceCommandSchema.safeParse({ ...envelope, type: "save_invoice", payload }).success).toBe(false);
  });

  it.each(["businessId", "actor", "role", "approvedBy"])("rejects a root %s override", field => {
    expect(workspaceCommandSchema.safeParse({ ...envelope, type: "save_invoice", payload: invoice, [field]: randomUUID() }).success).toBe(false);
  });

  it("rejects invalid revision and request identifiers", () => {
    for (const expectedRevision of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, "0"]) {
      expect(workspaceCommandSchema.safeParse({ ...envelope, expectedRevision, type: "save_invoice", payload: invoice }).success).toBe(false);
    }
    expect(workspaceCommandSchema.safeParse({ ...envelope, requestId: "bad", type: "save_invoice", payload: invoice }).success).toBe(false);
  });

  it("rejects malformed contacts and unsupported commands", () => {
    expect(workspaceCommandSchema.safeParse({ ...envelope, type: "save_customer", payload: { name: "Client", contactName: "Contact", email: "not-email" } }).success).toBe(false);
    expect(workspaceCommandSchema.safeParse({ ...envelope, type: "approve_reminder", payload: {} }).success).toBe(false);
  });

  it("keeps internal database details and inherited object keys out of application errors", () => {
    for (const message of ["column private_data is ambiguous", "toString", "__proto__"]) {
      const error = CommandError.fromDatabase(message);
      expect(error.code).toBe("SERVICE_UNAVAILABLE");
      expect(error.message).not.toContain(message);
    }
    expect(CommandError.fromDatabase("FORBIDDEN").code).toBe("FORBIDDEN");
  });
});
