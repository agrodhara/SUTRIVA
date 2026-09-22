/**
 * Plain-language reading of how much monthly breathing room is left after the proposed EMI.
 *
 * The thresholds are the ones the existing Track 1.0 Borrow Better result already uses: a monthly
 * shortfall when breathing room is below zero, then a free share of income under 10% ("very thin") and
 * under 20% ("limited"). Nothing else in the journey may describe the result as tight or comfortable.
 * The free share is breathing room ÷ income, which is the same as one minus the committed ratio.
 */

export type BreathingBand = "shortfall" | "very_thin" | "limited" | "comfortable";

export const VERY_THIN_FREE_SHARE = 0.1;
export const LIMITED_FREE_SHARE = 0.2;

export function breathingBand(breathingRoomAfter: number, monthlyIncome: number): BreathingBand {
  if (breathingRoomAfter < 0) return "shortfall";
  const freeShare = monthlyIncome > 0 ? breathingRoomAfter / monthlyIncome : 0;
  if (freeShare < VERY_THIN_FREE_SHARE) return "very_thin";
  if (freeShare < LIMITED_FREE_SHARE) return "limited";
  return "comfortable";
}

const HEADLINE_TAIL: Record<BreathingBand, string> = {
  shortfall: "would take your monthly cash flow below zero.",
  very_thin: "looks very tight against your monthly cash flow.",
  limited: "looks tight against your monthly cash flow.",
  comfortable: "still leaves room in your monthly cash flow.",
};

/** Headline such as "₹5,00,000 over 36 months looks tight against your monthly cash flow." */
export function borrowHeadline(loanDisplay: string, tenureMonths: number, band: BreathingBand): string {
  return `${loanDisplay} over ${tenureMonths} months ${HEADLINE_TAIL[band]}`;
}
