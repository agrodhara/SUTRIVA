/**
 * Display helpers for the 1.1A journeys. Nothing here calculates a financial result: it only formats
 * numbers the customer typed or the backend returned. Amounts are stored as plain digits ("500000") and
 * shown in Indian digit grouping ("5,00,000").
 */

export const MINUS_SIGN = "−";

const WHOLE = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

/**
 * Keeps at most one leading minus sign, digits, and at most one decimal point with at most two decimals.
 * Everything else is dropped. A leading "-" or "−" is preserved, never dropped: a negative entry must stay
 * negative so the existing amount validators (which check for a leading minus) can reject it. It is never
 * turned into a positive number by this function.
 */
export function sanitizeAmount(input: string): string {
  const negative = /^\s*[-−]/.test(input);
  let out = "";
  let seenDot = false;
  let decimals = 0;
  for (const ch of input) {
    if (ch >= "0" && ch <= "9") {
      if (seenDot) {
        if (decimals >= 2) continue;
        decimals += 1;
      }
      out += ch;
    } else if (ch === "." && !seenDot) {
      seenDot = true;
      out += ch;
    }
  }
  return negative ? `-${out}` : out;
}

/**
 * Indian digit grouping of a sanitized amount: "500000" → "5,00,000", "1234.5" → "1,234.5",
 * "-500000" → "-5,00,000". A leading minus is carried through unchanged: it is shown, not hidden or
 * turned into a positive display, so the customer can see and correct the invalid entry.
 */
export function groupIndian(raw: string): string {
  if (raw === "") return "";
  const negative = raw.startsWith("-");
  const unsigned = negative ? raw.slice(1) : raw;
  if (unsigned === "") return negative ? "-" : "";
  const dot = unsigned.indexOf(".");
  const integer = dot === -1 ? unsigned : unsigned.slice(0, dot);
  const fraction = dot === -1 ? "" : unsigned.slice(dot);
  const digits = integer.replace(/^0+(?=\d)/, "");
  const sign = negative ? "-" : "";
  if (digits === "") return fraction ? `${sign}0${fraction}` : sign;
  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3);
  const grouped = rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${last3}` : last3;
  return `${sign}${grouped}${fraction}`;
}

/**
 * Number of digit/decimal characters in `text`, ignoring separators, plus one more for a leading minus
 * sign. A leading "-" or "−" counts as significant too, so the caret lands after it (not before it) once
 * typed — otherwise the next digit would be inserted ahead of the minus and silently cancel it out.
 */
export function significantCount(text: string): number {
  let count = /^[-−]/.test(text) ? 1 : 0;
  for (const ch of text) if ((ch >= "0" && ch <= "9") || ch === ".") count += 1;
  return count;
}

/** Index in `formatted` that sits after `count` digit/decimal characters, counting a leading minus too. */
export function positionAfterSignificant(formatted: string, count: number): number {
  if (count <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < formatted.length; i += 1) {
    const ch = formatted[i];
    const isLeadingMinus = i === 0 && (ch === "-" || ch === "−");
    if ((ch >= "0" && ch <= "9") || ch === "." || isLeadingMinus) seen += 1;
    if (seen === count) return i + 1;
  }
  return formatted.length;
}

/** Whole rupees in Indian grouping with a U+2212 sign. Rounds to the nearest rupee; never abbreviates. */
export function formatRupeesExact(value: number): string {
  const rounded = Math.round(Math.abs(value));
  const sign = value < 0 && rounded !== 0 ? MINUS_SIGN : "";
  return `${sign}₹${WHOLE.format(rounded)}`;
}

/** Share of a total as a percent with at most one decimal: 0.15 → "15%", 0.2924 → "29.2%". */
export function formatPercentShare(ratio: number): string {
  const percent = Math.round(ratio * 1000) / 10;
  return `${Number.isInteger(percent) ? percent.toFixed(0) : percent.toFixed(1)}%`;
}
