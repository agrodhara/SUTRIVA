import { requireApiBaseUrl } from "../../lib/api";
import type { RewardPeriod, RewardType, SpendingPriority } from "./rewardsFormState";

export type MainPressureCode =
  | "REWARD_VALUE_UNKNOWN"
  | "INTEREST_EFFECT_UNKNOWN"
  | "FEE_EXCEEDS_REWARDS"
  | "FEE_REDUCES_VALUE"
  | "NO_FEE_PRESSURE";

/** The subset of the money-value-check response the Rewards Check screen reads. */
export type RewardsCheckResult = {
  reward_type: RewardType;
  reward_period?: RewardPeriod | null;
  reward_amount_per_period?: number | null;
  reward_units_per_period?: number | null;
  annualized_reward_units?: number | null;
  estimated_annual_rewards: number | null;
  annual_card_fee: number;
  estimated_annual_interest_cost: number | null;
  estimated_net_annual_value: number | null;
  reward_value_known: boolean;
  interest_value_known: boolean;
  interest_input_basis: "no_balance" | "known" | "unknown";
  spending_priorities?: SpendingPriority[] | null;
  spending_fit_status?: "CATEGORY_FIT_UNDETERMINED" | "NOT_PROVIDED";
  main_pressure_code?: MainPressureCode;
  nudge_code?: "COMPARE_REWARDS_FEE_INTEREST";
  guidance_disclaimer?: string;
};

export class RewardsCheckError extends Error {
  constructor() {
    super("rewards check failed");
    this.name = "RewardsCheckError";
  }
}

/** Calls the existing backend endpoint. Rewards-local so shared API helpers stay untouched. */
export async function postRewardsCheck(payload: Record<string, unknown>): Promise<RewardsCheckResult> {
  try {
    const response = await fetch(`${requireApiBaseUrl()}/v1/financial-intelligence/money-value-check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new RewardsCheckError();
    return (await response.json()) as RewardsCheckResult;
  } catch (error) {
    throw error instanceof RewardsCheckError ? error : new RewardsCheckError();
  }
}
