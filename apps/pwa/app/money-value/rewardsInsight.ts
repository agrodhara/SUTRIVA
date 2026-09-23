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
 *
 * This is still an estimate, not a guarantee: the annual reward figure is arithmetic on what the customer
 * entered (often a monthly amount extrapolated to a year) and assumes their spending and payment pattern
 * continue. Copy here says so, and never claims a stronger, "exact" or "final" result than that.
 *
 * A genuinely known interest cost — `interest_input_basis === "known"`, which the API contract allows even
 * though today's 1.1A Step 2/3 questions don't collect a balance or rate — always takes priority over the
 * payment-behaviour situations below: if the backend has already worked out a real net value including
 * interest, that is shown as the complete result instead of a before-interest estimate, so the headline
 * never contradicts the "Based on" card's own interest line.
 */

export type RewardsSituationCode =
  | "value_unknown"
  | "known_interest"
  | "below_fee_pays_in_full"
  | "below_fee_other"
  | "above_fee_interest_unknown"
  | "pays_in_full"
  | "carries_balance";

export type RewardsFinding = {
  code: RewardsSituationCode;
  /** Rewards minus fee (or, for "known_interest", the real interest-adjusted net). Null only when the reward value itself is unknown. */
  netBeforeInterest: number | null;
  /** True once this is the customer's complete result: interest is genuinely zero or genuinely known, not merely excluded. */
  isFinal: boolean;
  headline: string;
  explanation: string;
  why: string;
  tryThis: string;
  limitation: string;
};

/**
 * The fixed, clearly fictional interest illustration shown only when the customer says they carry a
 * balance. It is never derived from the customer's own spend or fee, never compared with or blended into
 * their own net value or rewards figure, and never presented as their own APR or balance.
 */
export const ILLUSTRATIVE_BALANCE = 10000;
export const ILLUSTRATIVE_APR_LOW = 0.3;
export const ILLUSTRATIVE_APR_HIGH = 0.42;
export const ILLUSTRATIVE_INTEREST_LOW = Math.round(ILLUSTRATIVE_BALANCE * ILLUSTRATIVE_APR_LOW);
export const ILLUSTRATIVE_INTEREST_HIGH = Math.round(ILLUSTRATIVE_BALANCE * ILLUSTRATIVE_APR_HIGH);

const NO_ESTIMATE = "Nothing is estimated in its place.";

function findingFor(code: Exclude<RewardsSituationCode, "value_unknown" | "known_interest">, net: number, rewards: number, fee: number): RewardsFinding {
  const netDisplay = formatRupeesExact(Math.abs(net));
  const rewardsDisplay = formatRupeesExact(rewards);
  const feeDisplay = formatRupeesExact(fee);
  switch (code) {
    case "below_fee_pays_in_full":
      return {
        code,
        netBeforeInterest: net,
        isFinal: true,
        headline: `Your card costs about ${netDisplay} more than its rewards each year, based on what you entered.`,
        explanation: `Based on the figures you entered — about ${rewardsDisplay} a year in rewards and a ${feeDisplay} annual fee — this comes to ${rewardsDisplay} − ${feeDisplay} = ${net < 0 ? "−" : ""}${netDisplay}.`,
        why: "You pay in full, so no interest applies here — this assumes your reward rate, fee and payment pattern stay the same.",
        tryThis: "Check whether your fee can be waived, or compare this against a no-fee card.",
        limitation: "Based on the reward rate and fee you entered, assumed to continue at the same level.",
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
        headline: `Your net value is about ${netDisplay} a year, with no interest cost.`,
        explanation: `Based on what you entered, and assuming you continue paying in full, no interest is added — your net value stands at ${netDisplay}.`,
        why: "Paying in full each month means interest never applies to this card.",
        tryThis: "None required — optionally, see how this changes if your fee is waived.",
        limitation: "Assumes you continue paying in full, and that your reward rate and fee stay the same.",
      };
    case "carries_balance":
      return {
        code,
        netBeforeInterest: net,
        isFinal: false,
        headline: `Before interest, your estimated net value is ${netDisplay}.`,
        explanation: `This is an estimate based on the rewards and fee you entered, before any interest. We don't know your card balance or interest rate, so no interest is included here.`,
        why: "Interest depends on your balance and your card's interest rate, which we don't have.",
        tryThis: "See the separate illustration below of what carrying a balance could cost, based on an example balance and rate — not your own figures.",
        limitation: "This before-interest figure is an estimate based on what you entered; it does not include any interest you may pay.",
      };
    default:
      throw new Error(`unreachable: ${code}`);
  }
}

/** The one situation where the backend already knows a real, interest-adjusted net value. */
function knownInterestFinding(result: RewardsCheckResult, net: number, rewards: number, fee: number): RewardsFinding {
  const interest = result.estimated_annual_interest_cost ?? 0;
  const netDisplay = formatRupeesExact(Math.abs(net));
  const rewardsDisplay = formatRupeesExact(rewards);
  const feeDisplay = formatRupeesExact(fee);
  const interestDisplay = formatRupeesExact(interest);
  return {
    code: "known_interest",
    netBeforeInterest: net,
    isFinal: true,
    headline:
      net < 0
        ? `Your card costs about ${netDisplay} more than its rewards each year, including your estimated interest cost.`
        : `Your net value is about ${netDisplay} a year, including your estimated interest cost.`,
    explanation: `Based on what you entered: about ${rewardsDisplay} a year in rewards, a ${feeDisplay} annual fee, and an estimated ${interestDisplay} in interest.`,
    why: "This includes your estimated interest cost, not just rewards minus fee.",
    tryThis: net < 0 ? "Check whether your fee can be waived, or compare this against a no-fee card." : "None required — this already includes your estimated interest cost.",
    limitation: "Includes an estimated annual interest cost, based on the balance and rate you provided.",
  };
}

/**
 * Priority order (first match wins): reward value unknown; a genuinely known interest cost (rare in
 * today's 1.1A flow, but always shown as the complete result when the backend has it, never contradicted
 * by a before-interest estimate); below fee and pays in full (an estimate, not a guarantee); below fee
 * otherwise (hedged); above fee with interest unknown; pays in full; carries a balance (before-interest
 * estimate plus a separate fixed illustration). Payment behaviour is checked in both the below-fee and
 * above-fee branches, not only one of them.
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

  if (result.interest_input_basis === "known" && result.estimated_net_annual_value !== null) {
    return knownInterestFinding(result, result.estimated_net_annual_value, rewards, fee);
  }

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
  return `For illustration only — someone carrying a ₹${ILLUSTRATIVE_BALANCE.toLocaleString("en-IN")} balance at an illustrative ${Math.round(ILLUSTRATIVE_APR_LOW * 100)}–${Math.round(ILLUSTRATIVE_APR_HIGH * 100)}% simple APR would pay roughly ₹${ILLUSTRATIVE_INTEREST_LOW.toLocaleString("en-IN")}–₹${ILLUSTRATIVE_INTEREST_HIGH.toLocaleString("en-IN")} a year in interest. This is a separate illustration, not a calculation of your own interest cost.`;
}
