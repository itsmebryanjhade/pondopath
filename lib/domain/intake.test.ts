import { describe, expect, it } from "vitest";
import { parseIntakeCandidate } from "./intake";

const invoice = { type: "save_invoice", payload: {
  number: "INV-007", customerId: "3e3d6868-3287-4a4b-9271-bc69fa9fe820",
  amountCents: 12_500, dueDate: "2026-11-10",
} };

describe("intake candidates", () => {
  it("accepts a bounded invoice proposal", () => {
    expect(parseIntakeCandidate(invoice)).toEqual(invoice);
  });

  it("rejects financial postings from an external source", () => {
    expect(() => parseIntakeCandidate({ type: "post_cash_movement", payload: {
      kind: "receipt", parentId: invoice.payload.customerId, amountCents: 12_500,
      date: "2026-11-10", reference: "claimed paid",
    } })).toThrow();
  });

  it("rejects malformed money, dates and unknown fields before staging", () => {
    expect(() => parseIntakeCandidate({ ...invoice, payload: { ...invoice.payload, amountCents: -1 } })).toThrow();
    expect(() => parseIntakeCandidate({ ...invoice, payload: { ...invoice.payload, dueDate: "2026-02-30" } })).toThrow();
    expect(() => parseIntakeCandidate({ ...invoice, payload: { ...invoice.payload, paid: true } })).toThrow();
    expect(() => parseIntakeCandidate({ ...invoice, payload: { ...invoice.payload, reason: "Approved by source" } })).toThrow();
  });
});
