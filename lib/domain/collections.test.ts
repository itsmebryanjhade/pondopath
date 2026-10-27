import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { workspaceCommandSchema } from "./commands";
import { compareScenario } from "./forecast";

const envelope = { requestId: randomUUID(), expectedRevision: 0 };
const promise = {
  invoiceId: randomUUID(),
  amountCents: 3_000_000,
  date: "2026-11-02",
  kind: "commitment",
  sourceNote: "30,000 on Monday; the remainder later.",
  nextFollowupDate: "2026-11-03",
  assigneeId: randomUUID(),
};

describe("collection command boundary", () => {
  it.each([
    { type: "confirm_expectation", payload: promise },
    {
      type: "save_followup",
      payload: {
        invoiceId: promise.invoiceId,
        assigneeId: promise.assigneeId,
        date: "2026-10-29",
        nextAction: "Check the bank record.",
      },
    },
    {
      type: "complete_followup",
      payload: {
        id: randomUUID(),
        outcome: "Customer called.",
        nextAction: "Check receipt.",
        nextDate: "2026-11-03",
        assigneeId: promise.assigneeId,
      },
    },
    {
      type: "complete_followup",
      payload: { id: randomUUID(), outcome: "Payment verified.", assigneeId: promise.assigneeId },
    },
  ])("accepts $type", (input) =>
    expect(workspaceCommandSchema.safeParse({ ...envelope, ...input }).success).toBe(true),
  );

  it.each([
    { amountCents: 0 },
    { amountCents: 1.5 },
    { date: "2026-02-30" },
    { kind: "paid" },
    { sourceNote: " " },
    { nextFollowupDate: "bad" },
    { assigneeId: "bad" },
    { role: "owner" },
  ])("rejects invalid promise %j", (invalid) => {
    expect(
      workspaceCommandSchema.safeParse({
        ...envelope,
        type: "confirm_expectation",
        payload: { ...promise, ...invalid },
      }).success,
    ).toBe(false);
  });
  it.each([{ nextAction: "Call customer" }, { nextDate: "2026-11-02" }])(
    "requires next action/date together %j",
    (partial) => {
      expect(
        workspaceCommandSchema.safeParse({
          ...envelope,
          type: "complete_followup",
          payload: {
            id: randomUUID(),
            assigneeId: promise.assigneeId,
            outcome: "Called.",
            ...partial,
          },
        }).success,
      ).toBe(false);
    },
  );
});

describe("unsaved customer receipt preview", () => {
  it("keeps the baseline immutable while exposing the Friday gap", () => {
    const input = {
      referenceDate: "2026-10-29",
      availableCents: 4_000_000,
      invoices: [
        {
          id: promise.invoiceId,
          outstandingCents: 5_000_000,
          expectation: {
            id: randomUUID(),
            date: "2026-10-29",
            remainingCents: 5_000_000,
            kind: "assumption" as const,
            needsReview: false,
          },
        },
      ],
      expenses: [{ id: randomUUID(), dueDate: "2026-10-30", unpaidCents: 8_000_000 }],
    };
    const before = structuredClone(input);
    const result = compareScenario(input, {
      invoiceId: promise.invoiceId,
      date: "2026-11-02",
      amountCents: 5_000_000,
    });
    expect(result.baseline.days[1].closingCents).toBe(1_000_000);
    expect(result.scenario.days[1].closingCents).toBe(-4_000_000);
    expect(input).toEqual(before);
  });
});
