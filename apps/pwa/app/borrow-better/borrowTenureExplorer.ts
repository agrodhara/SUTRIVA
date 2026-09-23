/**
 * "Try a different tenure" on the Step 4 result: a what-if preview, not a new submission. The EMI for the
 * chosen tenure comes from the existing `/emi-preview` endpoint (the same one Step 3 already calls); every
 * other figure here is derived from it with the same formulas the backend result already uses, so the
 * finding, the chart and the numbers all move together when the customer tries a different tenure.
 *
 * The rate itself is never part of this: it stays the fixed, illustrative, policy-set rate throughout, and
 * this module never surfaces a rate as adjustable.
 */

export type TenureExploration = {
  emi: number;
  tenureMonths: number;
  breathingRoomBefore: number;
  breathingRoomAfter: number;
  debtRatioBefore: number;
  debtRatioAfter: number;
  totalRepayment: number;
  totalInterest: number;
};

export function exploreTenure(params: {
  emi: number;
  tenureMonths: number;
  loanAmount: number;
  income: number;
  existingPayments: number;
  /** Breathing room and debt-payment share before this loan; unaffected by tenure. */
  breathingRoomBefore: number;
  debtRatioBefore: number;
}): TenureExploration {
  const { emi, tenureMonths, loanAmount, income, existingPayments, breathingRoomBefore, debtRatioBefore } = params;
  const totalRepayment = emi * tenureMonths;
  return {
    emi,
    tenureMonths,
    breathingRoomBefore,
    breathingRoomAfter: breathingRoomBefore - emi,
    debtRatioBefore,
    debtRatioAfter: income > 0 ? (existingPayments + emi) / income : 0,
    totalRepayment,
    totalInterest: totalRepayment - loanAmount,
  };
}
