import { describe, expect, it } from "vitest";
import {
  INITIAL_REWARDS_FORM,
  buildRewardsPayload,
  effectiveRewardKnowledge,
  hasErrors,
  isNonNegativeAmount,
  validateStep2,
  validateStep3,
  type RewardsFormState,
} from "./rewardsFormState";

function form(overrides: Partial<RewardsFormState> = {}): RewardsFormState {
  return {
    ...INITIAL_REWARDS_FORM,
    balanceBehavior: "pay_in_full",
    rewardType: "cashback",
    priorities: ["dining", "travel"],
    monthlySpend: "25000",
    annualFee: "4000",
    rewardAmount: "900",
    rewardPeriod: "monthly",
    ...overrides,
  };
}

describe("initial state", () => {
  it("preselects nothing and prefills no numbers", () => {
    expect(INITIAL_REWARDS_FORM.balanceBehavior).toBeNull();
    expect(INITIAL_REWARDS_FORM.rewardType).toBeNull();
    expect(INITIAL_REWARDS_FORM.priorities).toEqual([]);
    expect(INITIAL_REWARDS_FORM.monthlySpend).toBe("");
    expect(INITIAL_REWARDS_FORM.annualFee).toBe("");
    expect(INITIAL_REWARDS_FORM.rewardAmount).toBe("");
    expect(INITIAL_REWARDS_FORM.rewardUnits).toBe("");
    expect(INITIAL_REWARDS_FORM.rewardPeriod).toBeNull();
    expect(INITIAL_REWARDS_FORM.rewardKnowledge).toBeNull();
  });
});

describe("isNonNegativeAmount", () => {
  it("keeps blank, confirmed zero and invalid values distinct", () => {
    expect(isNonNegativeAmount("")).toBe(false);
    expect(isNonNegativeAmount("   ")).toBe(false);
    expect(isNonNegativeAmount("0")).toBe(true);
    expect(isNonNegativeAmount("0.0")).toBe(true);
    expect(isNonNegativeAmount("900")).toBe(true);
    expect(isNonNegativeAmount("-1")).toBe(false);
    expect(isNonNegativeAmount("abc")).toBe(false);
    expect(isNonNegativeAmount("Infinity")).toBe(false);
  });
});

describe("validateStep2", () => {
  it("requires both answers and never treats a missing answer as 'not sure'", () => {
    expect(Object.keys(validateStep2(INITIAL_REWARDS_FORM)).sort()).toEqual(["balanceBehavior", "rewardType"]);
    expect(Object.keys(validateStep2(form({ rewardType: null })))).toEqual(["rewardType"]);
    expect(Object.keys(validateStep2(form({ balanceBehavior: null })))).toEqual(["balanceBehavior"]);
    expect(hasErrors(validateStep2(form({ balanceBehavior: "not_sure", rewardType: "not_sure" })))).toBe(false);
  });
});

describe("validateStep3", () => {
  it("accepts a complete cashback entry", () => {
    expect(validateStep3(form())).toEqual({});
  });

  it("requires one to three priorities", () => {
    expect(validateStep3(form({ priorities: [] })).priorities).toBeTruthy();
    expect(validateStep3(form({ priorities: ["dining"] })).priorities).toBeUndefined();
    expect(validateStep3(form({ priorities: ["dining", "travel", "grocery", "everyday_bills"] })).priorities).toBeTruthy();
  });

  it("treats a blank spend or fee as missing but a confirmed zero as valid", () => {
    expect(validateStep3(form({ monthlySpend: "" })).monthlySpend).toBeTruthy();
    expect(validateStep3(form({ annualFee: "" })).annualFee).toBeTruthy();
    expect(validateStep3(form({ monthlySpend: "0", annualFee: "0" }))).toEqual({});
  });

  it("requires a period whenever an amount or quantity is given", () => {
    expect(validateStep3(form({ rewardPeriod: null })).rewardPeriod).toBeTruthy();
  });

  it("does not require reward fields on the unknown paths", () => {
    expect(validateStep3(form({ rewardType: "not_sure", rewardAmount: "", rewardPeriod: null }))).toEqual({});
    expect(validateStep3(form({ rewardKnowledge: "unknown", rewardAmount: "", rewardPeriod: null }))).toEqual({});
  });

  it("requires points and miles customers to say what they know", () => {
    expect(validateStep3(form({ rewardType: "points", rewardKnowledge: null })).rewardKnowledge).toBeTruthy();
    expect(validateStep3(form({ rewardType: "miles", rewardKnowledge: "units_only", rewardUnits: "", rewardAmount: "" })).rewardUnits).toBeTruthy();
    expect(validateStep3(form({ rewardType: "points", rewardKnowledge: "amount", rewardAmount: "" })).rewardAmount).toBeTruthy();
    expect(
      validateStep3(form({ rewardType: "points", rewardKnowledge: "units_only", rewardUnits: "0", rewardAmount: "" })),
    ).toEqual({});
  });
});

describe("effectiveRewardKnowledge", () => {
  it("resolves the applicable path per reward type", () => {
    expect(effectiveRewardKnowledge(form({ rewardType: "not_sure" }))).toBe("unknown");
    expect(effectiveRewardKnowledge(form({ rewardType: "cashback", rewardKnowledge: null }))).toBe("amount");
    expect(effectiveRewardKnowledge(form({ rewardType: "cashback", rewardKnowledge: "unknown" }))).toBe("unknown");
    expect(effectiveRewardKnowledge(form({ rewardType: "points", rewardKnowledge: null }))).toBeNull();
    expect(effectiveRewardKnowledge(form({ rewardType: "miles", rewardKnowledge: "units_only" }))).toBe("units_only");
  });
});

describe("buildRewardsPayload", () => {
  it("builds the cashback request with the declared balance behaviour and priorities", () => {
    expect(buildRewardsPayload(form())).toEqual({
      monthly_card_spend: 25000,
      annual_card_fee: 4000,
      reward_type: "cashback",
      spending_priorities: ["dining", "travel"],
      balance_behavior: "pay_in_full",
      reward_period: "monthly",
      reward_input_basis: "cashback_amount",
      cashback_amount: 900,
    });
  });

  it("preserves a confirmed zero rather than omitting or defaulting it", () => {
    const payload = buildRewardsPayload(form({ monthlySpend: "0", annualFee: "0", rewardAmount: "0" }));
    expect(payload.monthly_card_spend).toBe(0);
    expect(payload.annual_card_fee).toBe(0);
    expect(payload.cashback_amount).toBe(0);
    expect(payload).not.toHaveProperty("reward_value_unknown");
  });

  it("sends carry_balance and not_sure as declared, with no balance or rate values", () => {
    for (const behavior of ["carry_balance", "not_sure"] as const) {
      const payload = buildRewardsPayload(form({ balanceBehavior: behavior }));
      expect(payload.balance_behavior).toBe(behavior);
      expect(payload).not.toHaveProperty("revolving_balance");
      expect(payload).not.toHaveProperty("annual_interest_rate_percent");
      expect(payload).not.toHaveProperty("interest_input_basis");
    }
  });

  it("sends an explicit unknown for not sure and for continuing without a value, with no numeric reward fields", () => {
    for (const overrides of [{ rewardType: "not_sure" as const }, { rewardKnowledge: "unknown" as const }]) {
      const payload = buildRewardsPayload(form({ ...overrides, rewardAmount: "900" }));
      expect(payload.reward_value_unknown).toBe(true);
      expect(payload).not.toHaveProperty("cashback_amount");
      expect(payload).not.toHaveProperty("reward_period");
      expect(payload).not.toHaveProperty("reward_input_basis");
    }
  });

  it("sends a known points value as an estimate, and a quantity-only path without any rupee value", () => {
    const known = buildRewardsPayload(form({ rewardType: "points", rewardKnowledge: "amount", rewardAmount: "500" }));
    expect(known).toMatchObject({ reward_input_basis: "known_reward_value", reward_value_amount: 500, reward_amount_is_estimate: true });

    const quantity = buildRewardsPayload(
      form({ rewardType: "miles", rewardKnowledge: "units_only", rewardUnits: "1000", rewardAmount: "" }),
    );
    expect(quantity).toMatchObject({
      reward_input_basis: "earned_units",
      reward_units_earned: 1000,
      reward_value_unknown: true,
      reward_period: "monthly",
    });
    expect(quantity).not.toHaveProperty("rupee_value_per_reward_unit");
    expect(quantity).not.toHaveProperty("reward_value_amount");
  });

  it("never includes legacy-only fields", () => {
    const payload = buildRewardsPayload(form());
    for (const key of ["estimated_reward_rate_percent", "interest_value_unknown", "revolving_balance"]) {
      expect(payload).not.toHaveProperty(key);
    }
  });
});
