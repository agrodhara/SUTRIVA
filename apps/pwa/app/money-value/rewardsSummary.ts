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

/**
 * Shown only when the reward value itself is unknown — see `rewardsInsight.ts`'s "value_unknown" situation.
 * Interest being unknown no longer produces this: rewards minus fee is always shown once both are known.
 */
export const CANNOT_CALCULATE = "Can't calculate yet";

/**
 * Bars for the active dataset: rewards, fee, interest (only when known) and net.
 *
 * The net row uses `netOverride` (rewards minus fee, computed independently by `rewardsInsight.ts`) when
 * given, labelled "before interest" whenever interest is not included, rather than the backend's
 * `estimated_net_annual_value`, which is null whenever interest is unknown even though rewards and fee are
 * both already known. Without an override this keeps its original behaviour.
 */
export function buildRewardBars(
  result: RewardsCheckResult,
  includeNet = true,
  netOverride?: { value: number | null; label: string },
): { rows: ValueBarRow[]; summary: string } {
  const rewards = result.estimated_annual_rewards;
  const net = netOverride ? netOverride.value : result.estimated_net_annual_value;
  const netLabel = netOverride?.label ?? "Net annual value";
  const interestKnown = result.interest_input_basis === "known" && result.estimated_annual_interest_cost !== null;
  const rows: ValueBarRow[] = [
    { label: "Estimated annual rewards", value: rewards, display: rewards === null ? "Unknown" : rupees(rewards), tone: "rewards" },
    { label: "Annual fee", value: result.annual_card_fee, display: rupees(result.annual_card_fee), tone: "fee" },
  ];
  if (interestKnown) {
    const interest = result.estimated_annual_interest_cost as number;
    rows.push({ label: "Estimated annual interest", value: interest, display: rupees(interest), tone: "interest" });
  }
  if (includeNet) rows.push({ label: netLabel, value: net, display: net === null ? CANNOT_CALCULATE : rupees(net), tone: "net" });
  const summary = `Comparison of ${rows.map((row) => `${row.label} ${row.display}`).join(", ")}.`;
  return { rows, summary };
}
