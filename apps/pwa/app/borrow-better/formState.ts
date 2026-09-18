export type BorrowBetterFormState = {
  monthly_income: string;
  existing_monthly_commitments: string;
  existing_debt_payments: string;
  housing_rent: string;
  household_utilities: string;
  dependants_education: string;
  recurring_medical_insurance: string;
  other_essential_commitments: string;
  desired_borrowing_amount: string;
  desired_tenure_months: string;
  illustrative_annual_rate_percent: string;
  month_end_position: "comfortable" | "tight" | "fall_short";
};

export type BorrowBetterPayload =
  | {
      calculation_mode: "legacy_total_commitments";
      monthly_income: number;
      existing_monthly_commitments: number;
      desired_borrowing_amount: number;
      desired_tenure_months: number;
    }
  | {
      calculation_mode: "track_11a_breakdown";
      monthly_income: number;
      existing_debt_payments: number;
      housing_rent: number;
      household_utilities: number;
      dependants_education: number;
      recurring_medical_insurance: number;
      other_essential_commitments: number;
      desired_borrowing_amount: number;
      desired_tenure_months: number;
      illustrative_annual_rate_percent: number;
    };

export const emptyBorrowBetterFormState: BorrowBetterFormState = {
  monthly_income: "",
  existing_monthly_commitments: "",
  existing_debt_payments: "",
  housing_rent: "",
  household_utilities: "",
  dependants_education: "",
  recurring_medical_insurance: "",
  other_essential_commitments: "",
  desired_borrowing_amount: "",
  desired_tenure_months: "",
  illustrative_annual_rate_percent: "14",
  month_end_position: "comfortable",
};

export function updateBorrowBetterField(
  previous: BorrowBetterFormState,
  key: keyof BorrowBetterFormState,
  value: string,
): BorrowBetterFormState {
  return { ...previous, [key]: value };
}

export function buildBorrowBetterPayload(form: BorrowBetterFormState, isTrack11A: boolean): BorrowBetterPayload {
  if (!isTrack11A) {
    return {
      calculation_mode: "legacy_total_commitments",
      monthly_income: Number(form.monthly_income),
      existing_monthly_commitments: Number(form.existing_monthly_commitments),
      desired_borrowing_amount: Number(form.desired_borrowing_amount),
      desired_tenure_months: Number(form.desired_tenure_months),
    };
  }

  return {
    calculation_mode: "track_11a_breakdown",
    monthly_income: Number(form.monthly_income),
    existing_debt_payments: Number(form.existing_debt_payments),
    housing_rent: Number(form.housing_rent),
    household_utilities: Number(form.household_utilities),
    dependants_education: Number(form.dependants_education),
    recurring_medical_insurance: Number(form.recurring_medical_insurance),
    other_essential_commitments: Number(form.other_essential_commitments),
    desired_borrowing_amount: Number(form.desired_borrowing_amount),
    desired_tenure_months: Number(form.desired_tenure_months),
    illustrative_annual_rate_percent: Number(form.illustrative_annual_rate_percent),
  };
}