import { describe, expect, it } from "vitest";
import { checkedSum, formatPHP, parseMoney } from "./money";

describe("parseMoney", () => {
  it.each([
    ["40000.00", 4_000_000],
    ["0.01", 1],
    ["20.5", 2_050],
    [" 42 ", 4_200],
    ["0001.2", 120],
    ["999999999.99", 99_999_999_999],
  ])("converts %s to exact centavos", (input, expected) => {
    expect(parseMoney(String(input))).toBe(expected);
  });

  it("allows zero only when requested", () => {
    expect(parseMoney("0", { allowZero: true })).toBe(0);
    expect(parseMoney("0.00", { allowZero: true })).toBe(0);
    expect(() => parseMoney("0")).toThrow(RangeError);
  });

  it.each([
    "", " ", "-1", "-0", "+2", "1e3", "1,000", "PHP 20", "₱20",
    ".50", "20.", "0.001", "1000000000", "99999999999999999999999999",
    "Infinity", "NaN",
  ])("rejects invalid or out-of-range input %s", (input) => {
    expect(() => parseMoney(input)).toThrow(RangeError);
  });
});

describe("checkedSum", () => {
  it("adds signed integer centavos and handles an empty list", () => {
    expect(checkedSum([4_000_000, 2_000_000, -8_000_000])).toBe(-2_000_000);
    expect(checkedSum([])).toBe(0);
    expect(checkedSum([Number.MAX_SAFE_INTEGER, 0])).toBe(Number.MAX_SAFE_INTEGER);
  });

  it.each([[0.1], [NaN], [Infinity], [Number.MAX_SAFE_INTEGER + 1]])(
    "rejects non-integer or unsafe amounts",
    (...values) => expect(() => checkedSum(values)).toThrow(RangeError),
  );

  it("rejects positive and negative aggregate overflow", () => {
    expect(() => checkedSum([Number.MAX_SAFE_INTEGER, 1])).toThrow(RangeError);
    expect(() => checkedSum([-Number.MAX_SAFE_INTEGER, -1])).toThrow(RangeError);
  });
});

describe("formatPHP", () => {
  it("formats signed centavos without treating them as pesos", () => {
    expect(formatPHP(4_000_000)).toBe("₱40,000.00");
    expect(formatPHP(-1)).toBe("-₱0.01");
    expect(formatPHP(0)).toBe("₱0.00");
  });

  it("retains the final centavo at the safe aggregate boundary", () => {
    expect(formatPHP(Number.MAX_SAFE_INTEGER)).toBe("₱90,071,992,547,409.91");
    expect(formatPHP(-Number.MAX_SAFE_INTEGER)).toBe("-₱90,071,992,547,409.91");
  });

  it("rejects a fractional centavo instead of rounding it", () => {
    expect(() => formatPHP(1.5)).toThrow(RangeError);
  });
});
