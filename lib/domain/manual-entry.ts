import { addDays, assertLocalDate } from "./dates";
import { parseMoney } from "./money";
import type { Cents, LocalDate } from "./types";

/**
 * Expand financial shorthand for amount entry.
 * Supports:
 * - "15k" / "15K" -> "15000"
 * - "2.5k" -> "2500"
 * - "1m" / "1M" -> "1000000"
 * - Currency prefixes ("₱15k", "PHP 25k") and thousand-separating commas ("15,000")
 * Leaves standard decimals and unrecognized strings intact for downstream validation.
 */
export function expandAmountShorthand(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";

  // Strip currency prefixes and whitespace
  const clean = trimmed.replace(/^(?:₱|PHP)\s*/i, "").replace(/,/g, "");

  const shorthandMatch = clean.match(/^([+-]?\d+(?:\.\d+)?)\s*([kKmM])$/);
  if (shorthandMatch) {
    const num = Number(shorthandMatch[1]);
    const multiplier = shorthandMatch[2].toLowerCase() === "k" ? 1_000 : 1_000_000;
    const expanded = num * multiplier;
    if (!Number.isFinite(expanded)) return input.trim();
    const rounded = Math.round(expanded * 100) / 100;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/0+$/, "");
  }

  // If numeric after stripping currency/commas, return cleaned
  if (/^[+-]?\d+(?:\.\d+)?$/.test(clean)) {
    return clean;
  }

  return input.trim();
}

/**
 * Parses user-entered money input with shorthand support while strictly preserving
 * parseMoney's range limits and error messages.
 */
export function parseAmountInput(input: string, options?: { allowZero?: boolean }): Cents {
  const expanded = expandAmountShorthand(input);
  return parseMoney(expanded, options);
}

/**
 * Suggests the next invoice number based on existing invoice numbers in the workspace.
 * Defaults to "INV-001" if no existing invoices or no digit patterns are found.
 */
export function suggestNextInvoiceNumber(existingNumbers: string[]): string {
  const candidates: { prefix: string; value: number; padLength: number; suffix: string }[] = [];

  for (const raw of existingNumbers) {
    if (!raw || typeof raw !== "string") continue;
    const trimmed = raw.trim();
    // Prefer trailing digits like INV-001, 2026-001, 1001
    const trailingMatch = trimmed.match(/^(.*?)(\d+)$/);
    if (trailingMatch) {
      candidates.push({
        prefix: trailingMatch[1],
        value: parseInt(trailingMatch[2], 10),
        padLength: trailingMatch[2].length,
        suffix: "",
      });
      continue;
    }
    // Otherwise digits anywhere in the identifier
    const anyMatch = trimmed.match(/^(.*?)(\d+)(.*)$/);
    if (anyMatch) {
      candidates.push({
        prefix: anyMatch[1],
        value: parseInt(anyMatch[2], 10),
        padLength: anyMatch[2].length,
        suffix: anyMatch[3],
      });
    }
  }

  if (candidates.length === 0) {
    return "INV-001";
  }

  // Pick candidate with highest numeric value
  let best = candidates[0];
  for (let i = 1; i < candidates.length; i++) {
    if (candidates[i].value > best.value) {
      best = candidates[i];
    }
  }

  const nextValue = best.value + 1;
  const nextDigits = String(nextValue).padStart(best.padLength, "0");
  return `${best.prefix}${nextDigits}${best.suffix}`;
}

/**
 * Calculates the last calendar day of the month for a given ISO date.
 */
export function endOfMonth(date: LocalDate): LocalDate {
  assertLocalDate(date);
  const [yearStr, monthStr] = date.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr); // 1-12
  // Day 0 of the next month is the last day of the current month
  const lastDayDate = new Date(Date.UTC(year, month, 0));
  const lastDay = String(lastDayDate.getUTCDate()).padStart(2, "0");
  return assertLocalDate(`${yearStr}-${monthStr}-${lastDay}`);
}

export type QuickDateChoice = {
  key: "today" | "net7" | "net15" | "net30" | "eom";
  label: string;
  date: LocalDate;
};

/**
 * Provides 5 quick date choices relative to the forecast referenceDate.
 */
export function quickDateChoices(referenceDate: LocalDate): QuickDateChoice[] {
  assertLocalDate(referenceDate);
  return [
    { key: "today", label: "Today", date: referenceDate },
    { key: "net7", label: "+7 days", date: addDays(referenceDate, 7) },
    { key: "net15", label: "+15 days", date: addDays(referenceDate, 15) },
    { key: "net30", label: "+30 days", date: addDays(referenceDate, 30) },
    { key: "eom", label: "End of month", date: endOfMonth(referenceDate) },
  ];
}
