import { describe, expect, it } from "vitest";
import {
  expandAmountShorthand,
  parseAmountInput,
  suggestNextInvoiceNumber,
  endOfMonth,
  quickDateChoices,
} from "./manual-entry";

describe("expandAmountShorthand", () => {
  it("leaves standard numbers unchanged", () => {
    expect(expandAmountShorthand("1000")).toBe("1000");
    expect(expandAmountShorthand("1000.50")).toBe("1000.50");
    expect(expandAmountShorthand("500")).toBe("500");
    expect(expandAmountShorthand("0")).toBe("0");
  });

  it("expands thousands shorthand (k/K)", () => {
    expect(expandAmountShorthand("25k")).toBe("25000");
    expect(expandAmountShorthand("15k")).toBe("15000");
    expect(expandAmountShorthand("15K")).toBe("15000");
    expect(expandAmountShorthand("2.5k")).toBe("2500");
    expect(expandAmountShorthand("2.25k")).toBe("2250");
    expect(expandAmountShorthand("0.5k")).toBe("500");
    expect(expandAmountShorthand("100k")).toBe("100000");
  });

  it("expands millions shorthand (m/M)", () => {
    expect(expandAmountShorthand("1.2M")).toBe("1200000");
    expect(expandAmountShorthand("1m")).toBe("1000000");
    expect(expandAmountShorthand("1.5M")).toBe("1500000");
    expect(expandAmountShorthand("0.25m")).toBe("250000");
  });

  it("strips currency symbols and commas before expanding", () => {
    expect(expandAmountShorthand("₱25,000")).toBe("25000");
    expect(expandAmountShorthand("₱15k")).toBe("15000");
    expect(expandAmountShorthand("PHP 25k")).toBe("25000");
    expect(expandAmountShorthand("₱ 1,500.50")).toBe("1500.50");
    expect(expandAmountShorthand("15,000")).toBe("15000");
    expect(expandAmountShorthand("1,500k")).toBe("1500000");
  });

  it("trims whitespace", () => {
    expect(expandAmountShorthand("  15k  ")).toBe("15000");
    expect(expandAmountShorthand("  1000.50  ")).toBe("1000.50");
  });

  it("passes unrecognized strings through to parseMoney validation", () => {
    expect(expandAmountShorthand("abc")).toBe("abc");
    expect(expandAmountShorthand("")).toBe("");
  });
});

describe("parseAmountInput", () => {
  it("parses shorthand into cents matching parseMoney contract", () => {
    expect(parseAmountInput("15k")).toBe(1_500_000);
    expect(parseAmountInput("2.5k")).toBe(250_000);
    expect(parseAmountInput("1m")).toBe(100_000_000);
    expect(parseAmountInput("₱1,500.50")).toBe(150_050);
  });

  it("respects allowZero option", () => {
    expect(parseAmountInput("0", { allowZero: true })).toBe(0);
    expect(parseAmountInput("0k", { allowZero: true })).toBe(0);
    expect(() => parseAmountInput("0")).toThrow(RangeError);
  });

  it("throws standard RangeError for invalid strings", () => {
    expect(() => parseAmountInput("abc")).toThrow(
      "Enter an amount such as 1000.50, without commas or currency symbols."
    );
  });
});

describe("suggestNextInvoiceNumber", () => {
  it("defaults to INV-001 when there are no existing invoices", () => {
    expect(suggestNextInvoiceNumber([])).toBe("INV-001");
  });

  it("increments sequential invoice numbers preserving zero-padding", () => {
    expect(suggestNextInvoiceNumber(["INV-001"])).toBe("INV-002");
    expect(suggestNextInvoiceNumber(["INV-001", "INV-002", "INV-009"])).toBe("INV-010");
    expect(suggestNextInvoiceNumber(["INV-099"])).toBe("INV-100");
    expect(suggestNextInvoiceNumber(["INV-999"])).toBe("INV-1000");
  });

  it("handles different prefix patterns and formats", () => {
    expect(suggestNextInvoiceNumber(["1024"])).toBe("1025");
    expect(suggestNextInvoiceNumber(["DEMO-001"])).toBe("DEMO-002");
    expect(suggestNextInvoiceNumber(["2026-001"])).toBe("2026-002");
    expect(suggestNextInvoiceNumber(["INV100"])).toBe("INV101");
    expect(suggestNextInvoiceNumber(["INV-1"])).toBe("INV-2");
    expect(suggestNextInvoiceNumber(["1001"])).toBe("1002");
  });

  it("finds the highest number when list is unordered", () => {
    expect(suggestNextInvoiceNumber(["INV-005", "INV-002", "INV-001"])).toBe("INV-006");
  });

  it("falls back gracefully when existing numbers have no digits", () => {
    expect(suggestNextInvoiceNumber(["Custom", "Draft"])).toBe("INV-001");
  });
});

describe("endOfMonth", () => {
  it("calculates the last day of the calendar month", () => {
    expect(endOfMonth("2026-10-29")).toBe("2026-10-31");
    expect(endOfMonth("2026-02-14")).toBe("2026-02-28");
    expect(endOfMonth("2024-02-14")).toBe("2024-02-29");
    expect(endOfMonth("2026-04-15")).toBe("2026-04-30");
    expect(endOfMonth("2026-12-01")).toBe("2026-12-31");
  });
});

describe("quickDateChoices", () => {
  it("provides 5 standard quick date choices from referenceDate", () => {
    const choices = quickDateChoices("2026-10-29");
    expect(choices).toEqual([
      { key: "today", label: "Today", date: "2026-10-29" },
      { key: "net7", label: "+7 days", date: "2026-11-05" },
      { key: "net15", label: "+15 days", date: "2026-11-13" },
      { key: "net30", label: "+30 days", date: "2026-11-28" },
      { key: "eom", label: "End of month", date: "2026-10-31" },
    ]);
  });
});

