import type { Cents } from "./types";

export const MAX_RECORD_CENTS = 99_999_999_999;

const pesoFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function parseMoney(input: string, options?: { allowZero?: boolean }): Cents {
  const value = input.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) {
    throw new RangeError("Enter an amount such as 1000.50, without commas or currency symbols.");
  }
  const [pesos, fraction = ""] = value.split(".");
  const cents = Number(pesos) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents > MAX_RECORD_CENTS || (cents === 0 && !options?.allowZero)) {
    throw new RangeError("Amount must be positive and at most PHP 999,999,999.99.");
  }
  return cents;
}

/**
 * Amounts as spreadsheets export them: "45,000.00", "₱45,000", "PHP 1,200.5". Only correctly placed thousands
 * commas and a peso marker are tolerated; anything else (such as "1,00" or "12 000") still fails the strict check.
 */
export function parseImportedMoney(input: string, options?: { allowZero?: boolean }): Cents {
  const cleaned = input.normalize("NFKC").trim().replace(/^(?:₱|php\.?)\s*/i, "").replace(/\s*(?:php)$/i, "").trim();
  return parseMoney(/^\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?$/.test(cleaned) ? cleaned.replaceAll(",", "") : cleaned, options);
}

export function checkedSum(values: Cents[]): Cents {
  let total = 0;
  for (const value of values) {
    if (!Number.isSafeInteger(value) || !Number.isSafeInteger(total + value)) {
      throw new RangeError("Cash amounts and their sum must be safe integer centavos.");
    }
    total += value;
  }
  return total;
}

export function formatPHP(cents: Cents): string {
  if (!Number.isSafeInteger(cents)) {
    throw new RangeError("Cash amounts must be safe integer centavos.");
  }
  const magnitude = Math.abs(cents);
  const wholePesos = Math.trunc(magnitude / 100);
  // Formatting cents separately preserves precision even at the safe-integer boundary.
  return pesoFormatter.formatToParts(cents < 0 ? -wholePesos : wholePesos)
    .map((part) => part.type === "fraction" ? String(magnitude % 100).padStart(2, "0") : part.value)
    .join("");
}
