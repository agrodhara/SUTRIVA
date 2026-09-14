export type BorrowBetterFormState = {
  monthly_income: string;
  existing_monthly_commitments: string;
  desired_borrowing_amount: string;
  desired_tenure_months: string;
};

export type BorrowBetterPayload = {
  monthly_income: number;
  existing_monthly_commitments: number;
  desired_borrowing_amount: number;
  desired_tenure_months: number;
};

export const emptyBorrowBetterFormState: BorrowBetterFormState = {
  monthly_income: "",
  existing_monthly_commitments: "",
  desired_borrowing_amount: "",
  desired_tenure_months: "",
};

export function updateBorrowBetterField(
  previous: BorrowBetterFormState,
  key: keyof BorrowBetterFormState,
  value: string,
): BorrowBetterFormState {
  return { ...previous, [key]: value };
}

export function buildBorrowBetterPayload(form: BorrowBetterFormState): BorrowBetterPayload {
  return {
    monthly_income: Number(form.monthly_income),
    existing_monthly_commitments: Number(form.existing_monthly_commitments),
    desired_borrowing_amount: Number(form.desired_borrowing_amount),
    desired_tenure_months: Number(form.desired_tenure_months),
  };
}