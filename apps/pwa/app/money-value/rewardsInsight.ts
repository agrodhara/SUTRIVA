import { formatRupeesExact } from "../../components/journey-ui/indian";
import type { BalanceBehavior } from "./rewardsFormState";
import type { RewardsCheckResult } from "./rewardsApi";

/**
 * Selects the one situation today's declared Rewards inputs support, and the copy that goes with it.
 *
 * This is what turns Step 4 from a calculator into a small intelligence layer: rather than always
 * showing the same template with different numbers, the product decides which of a small, closed set of
 * situations the customer's own answers put them in, and shows only that one finding. Situations are
 * checked in the order below; the first match wins.
 *
 * "Net value before interest" (rewards minus fee) is computed here, not read from the backend's
 * `estimated_net_annual_value`, because that field is null whenever interest is unknown even though
 * rewards and fee are both already known — the very "dead end" this module exists to remove. Rewards and
 * fee are always returned once declared, so this figure is always computable and is never withheld.
 */

export type RewardsSituationCode =
  | "value_unknown"
  | "below_fee_pays_in_full"
  | "below_fee_other"
  | "above_fee_interest_unknown"
  | "pays_in_full"
  | "carries_balance";

export type RewardsFinding = {
  code: RewardsSituationCode;
  /** Rewards minus fee. Null only when the reward value itself is unknown. */
  netBeforeInterest: number | null;
  /** True once this is the customer's complete result (pays in full: interest is zero, not merely excluded). */
  isFinal: boolean;
  headline: string;
  explanation: string;
  why: string;
  tryThis: string;
  limitation: string;
};

/**
 * The fixed, clearly fictional interest illustration shown only when the customer says they carry a
 * balance. It is never derived from the customer's own spend or fee, never blended into their net value,
 * and never presented as their own APR or balance.
 */
export const ILLUSTRATIVE_BALANCE = 10000;
export const ILLUSTRATIVE_APR_LOW = 0.3;
export const ILLUSTRATIVE_APR_HIGH = 0.42;
export const ILLUSTRATIVE_INTEREST_LOW = Math.round(ILLUSTRATIVE_BALANCE * ILLUSTRATIVE_APR_LOW);
export const ILLUSTRATIVE_INTEREST_HIGH = Math.round(ILLUSTRATIVE_BALANCE * ILLUSTRATIVE_APR_HIGH);

const NO_ESTIMATE = "Nothing is estimated in its place.";

function findingFor(code: RewardsSituationCode, net: number, rewards: number, fee: number): RewardsFinding {
  const netDisplay = formatRupeesExact(Math.abs(net));
  const rewardsDisplay = formatRupeesExact(rewards);
  const feeDisplay = formatRupeesExact(fee);
  switch (code) {
    case "below_fee_pays_in_full":
      return {
        code,
        netBeforeInterest: net,
        isFinal: true,
        headline: `Your card costs exactly ${netDisplay} more than its rewards each year — this is your full result, not an estimate.`,
        explanation: `You earn about ${rewardsDisplay} a year in rewards and pay a ${feeDisplay} annual fee.`,
        why: "You pay in full, so there is no interest to add — this is your complete result.",
        tryThis: "Check whether your fee can be waived, or compare this against a no-fee card.",
        limitation: "None beyond the entered reward rate and fee — this figure is not an estimate.",
      };
    case "below_fee_other":
      return {
        code,
        netBeforeInterest: net,
        isFinal: false,
        headline: `Your card costs at least ${netDisplay} more than its rewards each year, before any interest.`,
        explanation: `You earn about ${rewardsDisplay} a year in rewards and pay a ${feeDisplay} annual fee — that's already ${netDisplay} behind, before any interest.`,
        why: "This excludes interest because we don't yet know your interest cost. If you carry a balance, the real cost may be higher.",
        tryThis: "Check whether your fee can be waived, or compare this against a no-fee card.",
        limitation: "Excludes interest; if you carry a balance the real cost is higher, not lower.",
      };
    case "above_fee_interest_unknown":
      return {
        code,
        netBeforeInterest: net,
        isFinal: false,
        headline: `Before interest, your card is worth about ${netDisplay} a year — but we don't yet know your interest cost.`,
        explanation: `You earn about ${rewardsDisplay} a year in rewards and pay a ${feeDisplay} annual fee, for a net value of ${netDisplay} before interest.`,
        why: "This excludes interest because we don't yet know how you pay your card.",
        tryThis: "Tell us how you usually pay your card to see a fuller picture.",
        limitation: "This is a before-interest figure only, not your final result.",
      };
    case "pays_in_full":
      return {
        code,
        netBeforeInterest: net,
        isFinal: true,
        headline: `Your net value is ${netDisplay} a year, with no interest cost.`,
        explanation: `You pay in full, so no interest is added — your net value stands at ${netDisplay}.`,
        why: "Paying in full each month means interest never applies to this card.",
        tryThis: "None required — optionally, see how this changes if your fee is waived.",
        limitation: "Assumes you continue paying in full.",
      };
    case "carries_balance":
      return {
        code,
        netBeforeInterest: net,
        isFinal: false,
        headline: `Your net value before interest is ${netDisplay}, but interest on your balance is likely larger than your rewards.`,
        explanation: `Your net value is ${netDisplay} before interest. Interest is usually far larger than the rewards you earn on it.`,
        why: "Rewards are calculated before interest. If you carry a balance, interest is usually far larger than the rewards you earn on it.",
        tryThis: "If you often carry a balance, paying it down is likely worth more than these rewards.",
        limitation: "The interest range shown is illustrative, not your card's actual rate.",
      };
    default:
      throw new Error(`unreachable: ${code}`);
  }
}

/**
 * Priority order (first match wins): reward value unknown; below fee and pays in full (final, exact);
 * below fee otherwise (hedged); above fee with interest unknown; pays in full (final); carries a balance
 * (before-interest figure plus a separate fixed illustration). Payment behaviour is checked in both the
 * below-fee and above-fee branches, not only one of them.
 */
export function selectRewardsSituation(result: RewardsCheckResult, balanceBehavior: BalanceBehavior | null): RewardsFinding {
  const rewards = result.estimated_annual_rewards;
  if (rewards === null) {
    return {
      code: "value_unknown",
      netBeforeInterest: null,
      isFinal: false,
      headline: "We need your monthly reward value to show anything here.",
      explanation: "We need a reward value to work out what your rewards are worth. We haven’t guessed one.",
      why: "Rewards minus fee can't be computed without a reward value.",
      tryThis: "Enter your monthly reward value.",
      limitation: NO_ESTIMATE,
    };
  }

  const fee = result.annual_card_fee;
  const net = rewards - fee;

  if (net < 0) {
    return findingFor(balanceBehavior === "pay_in_full" ? "below_fee_pays_in_full" : "below_fee_other", net, rewards, fee);
  }
  if (balanceBehavior === "pay_in_full") return findingFor("pays_in_full", net, rewards, fee);
  if (balanceBehavior === "carry_balance") return findingFor("carries_balance", net, rewards, fee);
  return findingFor("above_fee_interest_unknown", net, rewards, fee);
}

/** The separate, explicitly fictional interest illustration shown only for the "carries a balance" situation. */
export function illustrativeInterestLine(): string {
  return `For illustration only — someone carrying a ₹${ILLUSTRATIVE_BALANCE.toLocaleString("en-IN")} balance at an illustrative ${Math.round(ILLUSTRATIVE_APR_LOW * 100)}–${Math.round(ILLUSTRATIVE_APR_HIGH * 100)}% simple APR would pay roughly ₹${ILLUSTRATIVE_INTEREST_LOW.toLocaleString("en-IN")}–₹${ILLUSTRATIVE_INTEREST_HIGH.toLocaleString("en-IN")} a year in interest.`;
}
