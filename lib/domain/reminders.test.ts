import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { reminderBasis, reminderTemplate } from "./reminders";

const basis = {
  invoiceId: randomUUID(),
  invoiceVersion: 3,
  outstandingCents: 3_000_000,
  contactVersion: 2,
  expectationId: randomUUID(),
  expectationVersion: 4,
  referenceDate: "2026-10-29",
};

describe("reminder approval basis", () => {
  it("is deterministic and changes with every approval-sensitive input", () => {
    const digest = reminderBasis(basis);
    expect(digest).toMatch(/^[a-f0-9]{64}$/);
    expect(reminderBasis({ ...basis })).toBe(digest);
    for (const changed of [
      { invoiceId: randomUUID() },
      { invoiceVersion: 4 },
      { outstandingCents: 2_999_999 },
      { contactVersion: 3 },
      { expectationId: randomUUID() },
      { expectationVersion: 5 },
      { referenceDate: "2026-10-30" },
    ]) expect(reminderBasis({ ...basis, ...changed })).not.toBe(digest);
  });

  it("distinguishes a missing expectation from a present one", () => {
    const withoutExpectation = { ...basis, expectationId: null, expectationVersion: null };
    expect(reminderBasis(withoutExpectation)).not.toBe(reminderBasis(basis));
  });
});

describe("manual reminder template", () => {
  it("uses the current outstanding balance, not the original invoice total", () => {
    const text = reminderTemplate({
      contactName: "Ana",
      invoiceNumber: "INV-001",
      outstandingCents: 3_000_000,
      dueDate: "2026-10-29",
      referenceDate: "2026-10-30",
    });
    expect(text).toContain("PHP 30,000.00");
    expect(text).toContain("overdue since October 29, 2026");
    expect(text).not.toContain("50,000");
  });
});
