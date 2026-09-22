/**
 * Transient form state and pure helpers for Rewards Intelligence 1.1A Steps 2-5.
 *
 * Nothing here reads or writes browser storage, URLs or cookies. Every value lives in React
 * state only. The frontend never calculates rewards or net value: it validates completeness and
 * builds the request; the backend owns every financial calculation.
 */

export type BalanceBehavior = "pay_in_full" | "carry_balance" | "not_sure";
export type RewardType = "cashback" | "points" | "miles" | "not_sure";
export type SpendingPriority = "dining" | "travel" | "grocery" | "everyday_bills";
export type RewardPeriod = "monthly" | "quarterly" | "yearly";
/** How the customer knows the value of the rewards received in the period. */
export type RewardKnowledge = "amount" | "units_only" | "unknown";

export const MAX_PRIORITIES = 3;

export type RewardsFormState = {
  /** `null` means unanswered. It is never treated as "not sure" or as pay in full. */
  balanceBehavior: BalanceBehavior | null;
  rewardType: RewardType | null;
  priorities: SpendingPriority[];
  /** Blank ("") and confirmed zero ("0") are distinct. */
  monthlySpend: string;
  annualFee: string;
  rewardKnowledge: RewardKnowledge | null;
  /** Rupees: cashback received, or the rupee value of points or miles. */
  rewardAmount: string;
  /** Points or miles quantity. */
  rewardUnits: string;
  rewardPeriod: RewardPeriod | null;
};

export const INITIAL_REWARDS_FORM: RewardsFormState = {
  balanceBehavior: null,
  rewardType: null,
  priorities: [],
  monthlySpend: "",
  annualFee: "",
  rewardKnowledge: null,
  rewardAmount: "",
  rewardUnits: "",
  rewardPeriod: null,
};

export const BALANCE_OPTIONS = [
  { value: "pay_in_full", label: "Pay in full each month" },
  { value: "carry_balance", label: "Carry a balance" },
  { value: "not_sure", label: "Not sure" },
] as const;

export const REWARD_TYPE_OPTIONS = [
  { value: "cashback", label: "Cashback" },
  { value: "points", label: "Points" },
  { value: "miles", label: "Miles" },
  { value: "not_sure", label: "Not sure" },
] as const;

export const PRIORITY_OPTIONS = [
  { value: "dining", label: "Dining" },
  { value: "travel", label: "Travel" },
  { value: "grocery", label: "Grocery" },
  { value: "everyday_bills", label: "Everyday bills" },
] as const;

export const PERIOD_OPTIONS = [
  { value: "monthly", label: "Per month" },
  { value: "quarterly", label: "Per quarter" },
  { value: "yearly", label: "Per year" },
] as const;

export const PERIOD_PHRASE: Record<RewardPeriod, string> = {
  monthly: "per month",
  quarterly: "per quarter",
  yearly: "per year",
};

export function isBalanceBehavior(value: string): value is BalanceBehavior {
  return BALANCE_OPTIONS.some((option) => option.value === value);
}

export function isRewardType(value: string): value is RewardType {
  return REWARD_TYPE_OPTIONS.some((option) => option.value === value);
}

export function isRewardPeriod(value: string): value is RewardPeriod {
  return PERIOD_OPTIONS.some((option) => option.value === value);
}

/** The knowledge path that actually applies, given the reward type chosen in Step 2. */
export function effectiveRewardKnowledge(form: RewardsFormState): RewardKnowledge | null {
  if (form.rewardType === "not_sure") return "unknown";
  if (form.rewardType === "cashback") return form.rewardKnowledge === "unknown" ? "unknown" : "amount";
  return form.rewardKnowledge;
}

/** A non-negative finite number. Blank is invalid; "0" is a valid confirmed zero. */
export function isNonNegativeAmount(value: string): boolean {
  if (value.trim() === "") return false;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0;
}

export type Step2Errors = { balanceBehavior?: string; rewardType?: string };

export function validateStep2(form: RewardsFormState): Step2Errors {
  const errors: Step2Errors = {};
  if (form.balanceBehavior === null) errors.balanceBehavior = "Choose how you pay your statement balance.";
  if (form.rewardType === null) errors.rewardType = "Choose the reward type you want to assess.";
  return errors;
}

export type Step3Errors = {
  priorities?: string;
  monthlySpend?: string;
  annualFee?: string;
  rewardKnowledge?: string;
  rewardAmount?: string;
  rewardUnits?: string;
  rewardPeriod?: string;
};

export function validateStep3(form: RewardsFormState): Step3Errors {
  const errors: Step3Errors = {};

  if (form.priorities.length < 1 || form.priorities.length > MAX_PRIORITIES) {
    errors.priorities = `Choose between 1 and ${MAX_PRIORITIES} spending priorities.`;
  }
  if (!isNonNegativeAmount(form.monthlySpend)) errors.monthlySpend = "Enter your monthly card spend. Enter 0 if it was zero.";
  if (!isNonNegativeAmount(form.annualFee)) errors.annualFee = "Enter your annual card fee. Enter 0 if there is none.";

  const knowledge = effectiveRewardKnowledge(form);
  if (knowledge === null) {
    errors.rewardKnowledge = "Tell us what you know about your rewards, or continue without a value.";
    return errors;
  }
  if (knowledge === "unknown") return errors;

  if (knowledge === "amount" && !isNonNegativeAmount(form.rewardAmount)) {
    errors.rewardAmount = "Enter the reward amount. Enter 0 if you received none.";
  }
  if (knowledge === "units_only" && !isNonNegativeAmount(form.rewardUnits)) {
    errors.rewardUnits = "Enter the points or miles you earned. Enter 0 if you earned none.";
  }
  if (form.rewardPeriod === null) errors.rewardPeriod = "Choose the period these rewards cover.";
  return errors;
}

export function hasErrors(errors: object): boolean {
  return Object.keys(errors).length > 0;
}

/**
 * Builds the money-value-check request. Assumes Step 2 and Step 3 validation passed.
 * Unknown reward value is always explicit (`reward_value_unknown`), never a zero.
 * `balance_behavior` is sent as declared; the backend resolves the interest basis and never
 * invents an interest cost for "carry a balance" or "not sure".
 */
export function buildRewardsPayload(form: RewardsFormState): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    monthly_card_spend: Number(form.monthlySpend),
    annual_card_fee: Number(form.annualFee),
    reward_type: form.rewardType,
    spending_priorities: [...form.priorities],
    balance_behavior: form.balanceBehavior,
  };

  const knowledge = effectiveRewardKnowledge(form);
  if (knowledge === "unknown" || knowledge === null) {
    payload.reward_value_unknown = true;
    return payload;
  }

  payload.reward_period = form.rewardPeriod;

  if (form.rewardType === "cashback") {
    payload.reward_input_basis = "cashback_amount";
    payload.cashback_amount = Number(form.rewardAmount);
    return payload;
  }

  if (knowledge === "amount") {
    payload.reward_input_basis = "known_reward_value";
    payload.reward_value_amount = Number(form.rewardAmount);
    payload.reward_amount_is_estimate = true;
    return payload;
  }

  // Points or miles quantity only: annualised as a quantity, never converted to rupees.
  payload.reward_input_basis = "earned_units";
  payload.reward_units_earned = Number(form.rewardUnits);
  payload.reward_value_unknown = true;
  return payload;
}
