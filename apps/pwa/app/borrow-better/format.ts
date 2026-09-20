/**
 * Display-only formatting for the Borrow Better 1.1A journey. The backend keeps exact values; nothing here
 * computes a financial result. Negatives keep their sign and use U+2212, and are never clamped to zero.
 */

export const MINUS_SIGN = "−";

const rupeeGrouping = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

/** ₹ amount in Indian digit grouping with a U+2212 sign for negatives. Rounds to whole rupees. */
export function formatRupees(value: number): string {
  const rounded = Math.round(Math.abs(value));
  const sign = value < 0 && rounded !== 0 ? MINUS_SIGN : "";
  return `${sign}₹${rupeeGrouping.format(rounded)}`;
}

/**
 * Nearest ₹100, for EMI and breathing-room figures. When rounding would erase a non-zero amount
 * (under ₹50 either way) the whole-rupee figure is shown instead, so a small shortfall keeps its sign.
 */
export function formatRupeesNearest100(value: number): string {
  const nearest = Math.round(value / 100) * 100;
  if (nearest === 0 && Math.abs(value) >= 0.5) return formatRupees(value);
  return formatRupees(nearest);
}

/** Whole-percent share, from a ratio such as 0.2924 → "29%". */
export function formatWholePercent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

/** Approximate lakh format, e.g. 615197.34 → "~₹6.15 lakh". Below ₹1 lakh falls back to nearest ₹100. */
export function formatApproxLakh(value: number): string {
  if (Math.abs(value) < 100000) return `~${formatRupeesNearest100(value)}`;
  const lakh = (Math.abs(value) / 100000).toFixed(2).replace(/\.?0+$/, "");
  return `~${value < 0 ? MINUS_SIGN : ""}₹${lakh} lakh`;
}

/** Exact lakh amount for a round figure, e.g. 100000 → "₹1 lakh". */
export function formatLakh(value: number): string {
  if (value < 100000) return formatRupees(value);
  const lakh = (value / 100000).toFixed(2).replace(/\.?0+$/, "");
  return `₹${lakh} lakh`;
}

/** Interest rate percent as configured, e.g. 14 → "14%", 12.5 → "12.5%". */
export function formatRatePercent(percent: number): string {
  return `${Number(percent.toFixed(2))}%`;
}

/** Tenure in months as a plain-language span for whole years, e.g. 36 → "3 years". */
export function formatTenureYears(months: number): string {
  if (months % 12 === 0) {
    const years = months / 12;
    return `${years} ${years === 1 ? "year" : "years"}`;
  }
  return `${months} months`;
}

/** Canonical read-only rate copy. The percent always comes from policy (the backend echo or shared config). */
export function rateCopy(percent: number): string {
  return `Illustrative annual rate: ${formatRatePercent(percent)}. Configured by policy; not a loan offer.`;
}
