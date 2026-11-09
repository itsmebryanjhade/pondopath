import { describe, expect, it } from "vitest";
import { parseImportedMoney } from "./money";

describe("amounts as spreadsheets export them", () => {
  it.each([
    ["45,000.00", 4_500_000], ["1,234,567.5", 123_456_750], ["₱45,000", 4_500_000], ["PHP 1,200.50", 120_050],
    ["php1200", 120_000], ["3200.00", 320_000], ["  18,000.00 ", 1_800_000], ["1200 PHP", 120_000],
  ])("reads %s", (input, cents) => expect(parseImportedMoney(input)).toBe(cents));

  it.each(["1,00", "12 000", "1,2345.00", "45,00.00", "₱", "", "abc", "$45", "-5", "1.234", ",500"])("still rejects %s", input => {
    expect(() => parseImportedMoney(input)).toThrow();
  });

  it("keeps the zero rule", () => {
    expect(parseImportedMoney("0", { allowZero: true })).toBe(0);
    expect(() => parseImportedMoney("0.00")).toThrow();
  });
});
