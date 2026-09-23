import { describe, expect, it } from "vitest";
import {
  ILLUSTRATIVE_INTEREST_HIGH,
  ILLUSTRATIVE_INTEREST_LOW,
  illustrativeInterestLine,
  selectRewardsSituation,
} from "./rewardsInsight";
import type { RewardsCheckResult } from "./rewardsApi";

const base: RewardsCheckResult = {
  reward_type: "cashback",
  estimated_annual_rewards: null,
  annual_card_fee: 0,
  estimated_annual_interest_cost: null,
  estimated_net_annual_value: null,
  reward_value_known: false,
  interest_value_known: false,
  interest_input_basis: "unknown",
};

describe("selectRewardsSituation", () => {
  it("shows the missing-value situation with no chart when the reward value is unknown, regardless of payment behaviour", () => {
    const finding = selectRewardsSituation({ ...base, estimated_annual_rewards: null }, "pay_in_full");
    expect(finding.code).toBe("value_unknown");
    expect(finding.netBeforeInterest).toBeNull();
    expect(finding.headline).toBe("We need your monthly reward value to show anything here.");
  });

  it("worked check: rewards ₹80, fee ₹500 → −₹420 when paying in full, stated as an estimate from what was entered, not an exact/complete/final claim", () => {
    const finding = selectRewardsSituation({ ...base, estimated_annual_rewards: 80, annual_card_fee: 500 }, "pay_in_full");
    expect(finding.code).toBe("below_fee_pays_in_full");
    expect(finding.netBeforeInterest).toBe(-420);
    expect(finding.isFinal).toBe(true);
    expect(finding.headline).toBe("Your card costs about ₹420 more than its rewards each year, based on what you entered.");
    expect(finding.headline).not.toMatch(/exactly|not an estimate|complete result/i);
    expect(finding.explanation).toContain("₹80");
    expect(finding.explanation).toContain("₹500");
    expect(finding.explanation).toContain("−₹420");
    expect(finding.explanation).not.toMatch(/not an estimate|complete result/i);
    expect(finding.limitation).not.toMatch(/not an estimate/i);
  });

  it("shows the same −₹420 as a hedged figure, not a final one, when the customer carries a balance or is not sure", () => {
    for (const behavior of ["carry_balance", "not_sure", null] as const) {
      const finding = selectRewardsSituation({ ...base, estimated_annual_rewards: 80, annual_card_fee: 500 }, behavior);
      expect(finding.code).toBe("below_fee_other");
      expect(finding.netBeforeInterest).toBe(-420);
      expect(finding.isFinal).toBe(false);
      expect(finding.headline).toBe("Your card costs at least ₹420 more than its rewards each year, before any interest.");
    }
  });

  it("worked check: official example 900×12=10,800; 10,800−4,000=6,800, shown before interest when payment behaviour is unknown", () => {
    const finding = selectRewardsSituation({ ...base, estimated_annual_rewards: 10800, annual_card_fee: 4000 }, null);
    expect(finding.code).toBe("above_fee_interest_unknown");
    expect(finding.netBeforeInterest).toBe(6800);
    expect(finding.isFinal).toBe(false);
    expect(finding.headline).toBe("Before interest, your card is worth about ₹6,800 a year — but we don't yet know your interest cost.");
  });

  it("shows the same known ₹6,800 for 'not sure' — it never invents a personal range in its place", () => {
    const finding = selectRewardsSituation({ ...base, estimated_annual_rewards: 10800, annual_card_fee: 4000 }, "not_sure");
    expect(finding.code).toBe("above_fee_interest_unknown");
    expect(finding.netBeforeInterest).toBe(6800);
  });

  it("shows ₹6,800 as the figure, with no interest cost, when the customer pays in full", () => {
    const finding = selectRewardsSituation({ ...base, estimated_annual_rewards: 10800, annual_card_fee: 4000 }, "pay_in_full");
    expect(finding.code).toBe("pays_in_full");
    expect(finding.netBeforeInterest).toBe(6800);
    expect(finding.isFinal).toBe(true);
    expect(finding.headline).toBe("Your net value is about ₹6,800 a year, with no interest cost.");
  });

  it("shows the before-interest ₹6,800 as an estimate for 'carries a balance', without claiming to know their interest exceeds their rewards", () => {
    const finding = selectRewardsSituation({ ...base, estimated_annual_rewards: 10800, annual_card_fee: 4000 }, "carry_balance");
    expect(finding.code).toBe("carries_balance");
    expect(finding.netBeforeInterest).toBe(6800);
    expect(finding.isFinal).toBe(false);
    expect(finding.headline).toBe("Before interest, your estimated net value is ₹6,800.");
    // We don't know the customer's balance or APR, so nothing here may claim their interest is
    // "likely" or "usually" larger than their rewards — that would compare a real figure with an unknown one.
    const allCopy = `${finding.headline} ${finding.explanation} ${finding.why} ${finding.tryThis} ${finding.limitation}`;
    expect(allCopy).not.toMatch(/likely (is |be )?larger|usually (far )?larger|interest.*larger than.*rewards/i);
    expect(finding.explanation).toContain("estimate");
  });

  it("shows the backend's own known interest-adjusted net value as the complete result, ahead of any payment-behaviour situation", () => {
    // interest_input_basis "known" exists in the API contract (the legacy page's "I know my balance and
    // rate" path) even though today's 1.1A Step 2/3 never collects enough to produce it. If the backend
    // ever does return it, the headline must use it, not silently fall back to a before-interest estimate
    // that would then contradict the "Based on" card's own interest line.
    const known: RewardsCheckResult = {
      ...base,
      estimated_annual_rewards: 10800,
      annual_card_fee: 4000,
      interest_input_basis: "known",
      interest_value_known: true,
      estimated_annual_interest_cost: 3000,
      estimated_net_annual_value: 3800,
    };
    const finding = selectRewardsSituation(known, "carry_balance");
    expect(finding.code).toBe("known_interest");
    expect(finding.netBeforeInterest).toBe(3800);
    expect(finding.isFinal).toBe(true);
    expect(finding.headline).toBe("Your net value is about ₹3,800 a year, including your estimated interest cost.");
    expect(finding.explanation).toContain("₹3,000");
  });

  it("states a known negative net value (interest included) as costing more than rewards, not as a before-interest estimate", () => {
    const known: RewardsCheckResult = {
      ...base,
      estimated_annual_rewards: 10800,
      annual_card_fee: 4000,
      interest_input_basis: "known",
      interest_value_known: true,
      estimated_annual_interest_cost: 9000,
      estimated_net_annual_value: -2200,
    };
    const finding = selectRewardsSituation(known, null);
    expect(finding.code).toBe("known_interest");
    expect(finding.netBeforeInterest).toBe(-2200);
    expect(finding.headline).toBe("Your card costs about ₹2,200 more than its rewards each year, including your estimated interest cost.");
  });

  it("still shows the missing-value situation when the reward value is unknown, even if interest is known", () => {
    const finding = selectRewardsSituation({ ...base, estimated_annual_rewards: null, interest_input_basis: "known", estimated_net_annual_value: -500 }, null);
    expect(finding.code).toBe("value_unknown");
  });

  it("change one input, watch the conclusion move: fee ₹4,000 → ₹0 turns 'the fee is the drag' into 'you keep the full amount'", () => {
    const before = selectRewardsSituation({ ...base, estimated_annual_rewards: 10800, annual_card_fee: 4000 }, null);
    const after = selectRewardsSituation({ ...base, estimated_annual_rewards: 10800, annual_card_fee: 0 }, null);
    expect(before.netBeforeInterest).toBe(6800);
    expect(after.netBeforeInterest).toBe(10800);
    expect(before.headline).not.toBe(after.headline);
  });
});

describe("illustrativeInterestLine", () => {
  it("computes the fixed illustrative range from a stated ₹10,000 balance, never the customer's own figures", () => {
    expect(ILLUSTRATIVE_INTEREST_LOW).toBe(3000);
    expect(ILLUSTRATIVE_INTEREST_HIGH).toBe(4200);
    const line = illustrativeInterestLine();
    expect(line).toContain("₹10,000");
    expect(line).toContain("30");
    expect(line).toContain("42");
    expect(line).toContain("₹3,000");
    expect(line).toContain("₹4,200");
  });
});
