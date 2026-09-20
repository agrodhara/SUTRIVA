/** Form state, validation and request building for the Borrow Better 1.1A journey (Steps 2–3). */

export type MonthEndPosition = "money_left" | "break_even" | "fall_short" | "not_sure";
export type EmiEndingAnswer = "yes" | "no" | "not_sure";
export type LoanPurpose =
  | "home_improvement"
  | "education"
  | "medical"
  | "debt_consolidation"
  | "vehicle"
  | "household_purchase"
  | "other";

export const TENURE_OPTIONS = [12, 24, 36, 48, 60] as const;
export type TenureMonths = (typeof TENURE_OPTIONS)[number];

export const MONTH_END_OPTIONS: readonly { value: MonthEndPosition; label: string }[] = [
  { value: "money_left", label: "Usually have money left" },
  { value: "break_even", label: "Break even" },
  { value: "fall_short", label: "Usually fall short" },
  { value: "not_sure", label: "Not sure" },
];

export const PURPOSE_OPTIONS: readonly { value: LoanPurpose; label: string }[] = [
  { value: "home_improvement", label: "Home improvement" },
  { value: "education", label: "Education" },
  { value: "medical", label: "Medical" },
  { value: "debt_consolidation", label: "Debt consolidation" },
  { value: "vehicle", label: "Vehicle" },
  { value: "household_purchase", label: "Household purchase" },
  { value: "other", label: "Other" },
];

export const EMI_ENDING_OPTIONS: readonly { value: EmiEndingAnswer; label: string }[] = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "not_sure", label: "Not sure" },
];

export type MoneyFieldKey =
  | "monthlyIncome"
  | "existingPayments"
  | "housing"
  | "household"
  | "dependants"
  | "medical"
  | "loanAmount";

export type PositionFieldKey = Exclude<MoneyFieldKey, "loanAmount">;

export type BorrowJourneyForm = {
  monthlyIncome: string;
  existingPayments: string;
  housing: string;
  household: string;
  dependants: string;
  medical: string;
  /** null until the user chooses: the journey never selects a position for them. */
  monthEndPosition: MonthEndPosition | null;
  loanAmount: string;
  /** "" until the user chooses a tenure. */
  tenureMonths: "" | `${TenureMonths}`;
  /** "" means not provided. */
  loanPurpose: "" | LoanPurpose;
  emiEnding: EmiEndingAnswer | null;
};

export const emptyBorrowJourneyForm: BorrowJourneyForm = {
  monthlyIncome: "",
  existingPayments: "",
  housing: "",
  household: "",
  dependants: "",
  medical: "",
  monthEndPosition: null,
  loanAmount: "",
  tenureMonths: "",
  loanPurpose: "",
  emiEnding: null,
};

export type FieldErrors = Partial<Record<MoneyFieldKey | "monthEndPosition" | "tenureMonths", string>>;

export type ParsedAmount = { ok: true; value: number } | { ok: false; reason: "blank" | "invalid" | "negative" };

/**
 * Strict rupee parser. Blank is never zero: an empty or whitespace-only entry is reported as blank.
 * Accepts digits with optional Indian/western comma grouping, a leading ₹ and up to two decimals.
 */
export function parseRupeeAmount(raw: string): ParsedAmount {
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: false, reason: "blank" };
  if (/^[-−]/.test(trimmed)) return { ok: false, reason: "negative" };

  const cleaned = trimmed.replace(/^₹\s*/, "").replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return { ok: false, reason: "invalid" };

  const value = Number(cleaned);
  if (!Number.isFinite(value)) return { ok: false, reason: "invalid" };
  return { ok: true, value };
}

const FIELD_LABELS: Record<MoneyFieldKey, string> = {
  monthlyIncome: "monthly take-home income",
  existingPayments: "existing loan and card payments",
  housing: "housing",
  household: "household and utilities",
  dependants: "dependants and education",
  medical: "recurring medical or insurance",
  loanAmount: "loan amount",
};

/** Income and loan amount must be above zero (the backend rejects zero); other amounts may be a confirmed zero. */
const MUST_BE_POSITIVE: ReadonlySet<MoneyFieldKey> = new Set(["monthlyIncome", "loanAmount"]);

function validateMoneyField(key: MoneyFieldKey, raw: string): string | undefined {
  const parsed = parseRupeeAmount(raw);
  if (!parsed.ok) {
    if (parsed.reason === "blank") {
      return MUST_BE_POSITIVE.has(key)
        ? `Enter your ${FIELD_LABELS[key]}.`
        : `Enter your ${FIELD_LABELS[key]}. Enter 0 if it is nil.`;
    }
    if (parsed.reason === "negative") return "Enter an amount of 0 or more.";
    return "Enter the amount in numbers only, for example 25000.";
  }
  if (MUST_BE_POSITIVE.has(key) && parsed.value <= 0) return "Enter an amount above 0.";
  return undefined;
}

export function validateMonthlyPosition(form: BorrowJourneyForm): FieldErrors {
  const errors: FieldErrors = {};
  (["monthlyIncome", "existingPayments", "housing", "household", "dependants", "medical"] as const).forEach((key) => {
    const message = validateMoneyField(key, form[key]);
    if (message) errors[key] = message;
  });
  if (form.monthEndPosition === null) errors.monthEndPosition = "Choose how your month usually ends.";
  return errors;
}

export function validateBorrowingPlan(form: BorrowJourneyForm): FieldErrors {
  const errors: FieldErrors = {};
  const amount = validateMoneyField("loanAmount", form.loanAmount);
  if (amount) errors.loanAmount = amount;
  if (form.tenureMonths === "") errors.tenureMonths = "Choose a tenure.";
  return errors;
}

export const isMonthlyPositionValid = (form: BorrowJourneyForm) => Object.keys(validateMonthlyPosition(form)).length === 0;
export const isBorrowingPlanValid = (form: BorrowJourneyForm) => Object.keys(validateBorrowingPlan(form)).length === 0;

function requireAmount(raw: string): number {
  const parsed = parseRupeeAmount(raw);
  if (!parsed.ok) throw new Error("Cannot build a request from an invalid or blank amount.");
  return parsed.value;
}

export type EmiPreviewRequestBody = {
  desired_borrowing_amount: number;
  desired_tenure_months: number;
};

/** Returns null unless amount and tenure are both valid: no request is made for partial input. */
export function buildEmiPreviewBody(plan: Pick<BorrowJourneyForm, "loanAmount" | "tenureMonths">): EmiPreviewRequestBody | null {
  const parsed = parseRupeeAmount(plan.loanAmount);
  if (!parsed.ok || parsed.value <= 0 || plan.tenureMonths === "") return null;
  return {
    desired_borrowing_amount: parsed.value,
    desired_tenure_months: Number(plan.tenureMonths),
  };
}

export type BorrowCheckRequestBody = {
  calculation_mode: "track_11a_breakdown";
  monthly_income: number;
  existing_debt_payments: number;
  housing_rent: number;
  household_utilities: number;
  dependants_education: number;
  recurring_medical_insurance: number;
  desired_borrowing_amount: number;
  desired_tenure_months: number;
  month_end_position: MonthEndPosition;
  loan_purpose?: LoanPurpose;
  existing_emi_ending_within_six_months?: EmiEndingAnswer;
};

/**
 * Builds the full-check request. There is deliberately no rate field: the rate is policy-controlled and
 * the backend applies it. Optional answers are omitted when not given.
 */
export function buildBorrowCheckBody(form: BorrowJourneyForm): BorrowCheckRequestBody | null {
  if (!isMonthlyPositionValid(form) || !isBorrowingPlanValid(form) || form.monthEndPosition === null) return null;
  return {
    calculation_mode: "track_11a_breakdown",
    monthly_income: requireAmount(form.monthlyIncome),
    existing_debt_payments: requireAmount(form.existingPayments),
    housing_rent: requireAmount(form.housing),
    household_utilities: requireAmount(form.household),
    dependants_education: requireAmount(form.dependants),
    recurring_medical_insurance: requireAmount(form.medical),
    desired_borrowing_amount: requireAmount(form.loanAmount),
    desired_tenure_months: Number(form.tenureMonths),
    month_end_position: form.monthEndPosition,
    ...(form.loanPurpose ? { loan_purpose: form.loanPurpose } : {}),
    ...(form.emiEnding ? { existing_emi_ending_within_six_months: form.emiEnding } : {}),
  };
}
