import type { ValueBarRow } from "../../components/journey-ui/ValueBars";
import { MINUS_SIGN } from "../../components/journey-ui/indian";
import type { RewardsCheckResult } from "./rewardsApi";

const RUPEES = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/** ₹ amount in Indian grouping with a U+2212 sign for negatives. Keeps paise when the backend returns them. */
export const rupees = (value: number): string => (value < 0 ? `${MINUS_SIGN}${RUPEES.format(-value)}` : RUPEES.format(value));

export const CANNOT_CALCULATE = "Can't calculate yet";

/** Why the net value is missing. Null when it is known. Never suggests a guessed figure. */
export function netUnavailableReason(result: RewardsCheckResult): string | null {
  if (result.estimated_net_annual_value !== null) return null;
  if (result.estimated_annual_rewards === null) {
    return "We need a reward value to work out what your rewards are worth. We haven’t guessed one.";
  }
  return "Interest impact is unknown, so we can’t show your value after interest. We haven’t assumed an interest cost.";
}

/** Bars for the active dataset: rewards, fee, interest (only when known) and net (only when it can be calculated). */
export function buildRewardBars(result: RewardsCheckResult, includeNet = true): { rows: ValueBarRow[]; summary: string } {
  const rewards = result.estimated_annual_rewards;
  const net = result.estimated_net_annual_value;
  const interestKnown = result.interest_input_basis === "known" && result.estimated_annual_interest_cost !== null;
  const rows: ValueBarRow[] = [
    { label: "Estimated annual rewards", value: rewards, display: rewards === null ? "Unknown" : rupees(rewards), tone: "rewards" },
    { label: "Annual fee", value: result.annual_card_fee, display: rupees(result.annual_card_fee), tone: "fee" },
  ];
  if (interestKnown) {
    const interest = result.estimated_annual_interest_cost as number;
    rows.push({ label: "Estimated annual interest", value: interest, display: rupees(interest), tone: "interest" });
  }
  if (includeNet) rows.push({ label: "Net annual value", value: net, display: net === null ? CANNOT_CALCULATE : rupees(net), tone: "net" });
  const summary = `Comparison of ${rows.map((row) => `${row.label} ${row.display}`).join(", ")}.`;
  return { rows, summary };
}
