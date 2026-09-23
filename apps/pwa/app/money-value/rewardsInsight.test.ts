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

  it("worked check: rewards ₹80, fee ₹500 → −₹420, shown as the exact final figure when paying in full", () => {
    const finding = selectRewardsSituation({ ...base, estimated_annual_rewards: 80, annual_card_fee: 500 }, "pay_in_full");
    expect(finding.code).toBe("below_fee_pays_in_full");
    expect(finding.netBeforeInterest).toBe(-420);
    expect(finding.isFinal).toBe(true);
    expect(finding.headline).toBe("Your card costs exactly ₹420 more than its rewards each year — this is your full result, not an estimate.");
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

  it("shows ₹6,800 as the final figure, with no interest cost, when the customer pays in full", () => {
    const finding = selectRewardsSituation({ ...base, estimated_annual_rewards: 10800, annual_card_fee: 4000 }, "pay_in_full");
    expect(finding.code).toBe("pays_in_full");
    expect(finding.netBeforeInterest).toBe(6800);
    expect(finding.isFinal).toBe(true);
    expect(finding.headline).toBe("Your net value is ₹6,800 a year, with no interest cost.");
  });

  it("shows the before-interest ₹6,800 plus the carries-a-balance framing when the customer carries a balance", () => {
    const finding = selectRewardsSituation({ ...base, estimated_annual_rewards: 10800, annual_card_fee: 4000 }, "carry_balance");
    expect(finding.code).toBe("carries_balance");
    expect(finding.netBeforeInterest).toBe(6800);
    expect(finding.isFinal).toBe(false);
    expect(finding.headline).toContain("₹6,800");
    expect(finding.headline).toContain("interest on your balance is likely larger than your rewards");
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
