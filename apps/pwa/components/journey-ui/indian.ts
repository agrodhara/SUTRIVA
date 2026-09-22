/**
 * Display helpers for the 1.1A journeys. Nothing here calculates a financial result: it only formats
 * numbers the customer typed or the backend returned. Amounts are stored as plain digits ("500000") and
 * shown in Indian digit grouping ("5,00,000").
 */

export const MINUS_SIGN = "−";

const WHOLE = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

/** Keeps digits and at most one decimal point with at most two decimals. Everything else is dropped. */
export function sanitizeAmount(input: string): string {
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
  return out;
}

/** Indian digit grouping of a sanitized amount: "500000" → "5,00,000", "1234.5" → "1,234.5". */
export function groupIndian(raw: string): string {
  if (raw === "") return "";
  const dot = raw.indexOf(".");
  const integer = dot === -1 ? raw : raw.slice(0, dot);
  const fraction = dot === -1 ? "" : raw.slice(dot);
  const digits = integer.replace(/^0+(?=\d)/, "");
  if (digits === "") return fraction ? `0${fraction}` : "";
  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3);
  const grouped = rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${last3}` : last3;
  return `${grouped}${fraction}`;
}

/** Number of digit/decimal characters in `text`, ignoring separators. Used to keep the caret stable. */
export function significantCount(text: string): number {
  let count = 0;
  for (const ch of text) if ((ch >= "0" && ch <= "9") || ch === ".") count += 1;
  return count;
}

/** Index in `formatted` that sits after `count` digit/decimal characters. */
export function positionAfterSignificant(formatted: string, count: number): number {
  if (count <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < formatted.length; i += 1) {
    const ch = formatted[i];
    if ((ch >= "0" && ch <= "9") || ch === ".") seen += 1;
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
