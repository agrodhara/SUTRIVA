import { describe, expect, it } from "vitest";
import {
  TENURE_OPTIONS,
  buildBorrowCheckBody,
  buildEmiPreviewBody,
  emptyBorrowJourneyForm,
  parseRupeeAmount,
  validateBorrowingPlan,
  validateMonthlyPosition,
  type BorrowJourneyForm,
} from "./journeyState";

const completeForm: BorrowJourneyForm = {
  ...emptyBorrowJourneyForm,
  monthlyIncome: "120000",
  existingPayments: "18000",
  housing: "28000",
  household: "11000",
  dependants: "12000",
  medical: "6000",
  monthEndPosition: "money_left",
  loanAmount: "500000",
  tenureMonths: "36",
};

describe("parseRupeeAmount", () => {
  it("never turns blank or whitespace into zero", () => {
    expect(parseRupeeAmount("")).toEqual({ ok: false, reason: "blank" });
    expect(parseRupeeAmount("   ")).toEqual({ ok: false, reason: "blank" });
  });

  it("accepts an entered zero", () => {
    expect(parseRupeeAmount("0")).toEqual({ ok: true, value: 0 });
    expect(parseRupeeAmount("0.00")).toEqual({ ok: true, value: 0 });
  });

  it("rejects negatives, including the U+2212 sign", () => {
    expect(parseRupeeAmount("-5")).toEqual({ ok: false, reason: "negative" });
    expect(parseRupeeAmount("−5")).toEqual({ ok: false, reason: "negative" });
  });

  it("rejects non-numeric, scientific and partial input", () => {
    for (const raw of ["abc", "1e5", "12k", "1.234", "1..2", "--1", "NaN", "Infinity", "₹"]) {
      expect(parseRupeeAmount(raw).ok).toBe(false);
    }
  });

  it("accepts grouping commas and a leading rupee sign", () => {
    expect(parseRupeeAmount("1,20,000")).toEqual({ ok: true, value: 120000 });
    expect(parseRupeeAmount("₹ 5,00,000")).toEqual({ ok: true, value: 500000 });
    expect(parseRupeeAmount("2500.5")).toEqual({ ok: true, value: 2500.5 });
  });
});

describe("validateMonthlyPosition", () => {
  it("requires every visible field and a month-end choice", () => {
    const errors = validateMonthlyPosition(emptyBorrowJourneyForm);
    expect(Object.keys(errors).sort()).toEqual(
      ["dependants", "existingPayments", "household", "housing", "medical", "monthEndPosition", "monthlyIncome"].sort(),
    );
  });

  it("allows a confirmed zero for payments and essentials but not for income", () => {
    const errors = validateMonthlyPosition({ ...completeForm, existingPayments: "0", housing: "0", household: "0", dependants: "0", medical: "0", monthlyIncome: "0" });
    expect(Object.keys(errors)).toEqual(["monthlyIncome"]);
  });

  it("rejects negative amounts", () => {
    expect(validateMonthlyPosition({ ...completeForm, housing: "-1" }).housing).toBeTruthy();
  });

  it("is valid for the reference inputs", () => {
    expect(validateMonthlyPosition(completeForm)).toEqual({});
  });
});

describe("validateBorrowingPlan and request bodies", () => {
  it("requires an amount above zero and an explicit tenure", () => {
    expect(Object.keys(validateBorrowingPlan(emptyBorrowJourneyForm)).sort()).toEqual(["loanAmount", "tenureMonths"]);
    expect(validateBorrowingPlan({ ...completeForm, loanAmount: "0" }).loanAmount).toBeTruthy();
  });

  it("offers only the five approved tenures", () => {
    expect([...TENURE_OPTIONS]).toEqual([12, 24, 36, 48, 60]);
  });

  it("builds a preview body only from a valid amount and tenure", () => {
    expect(buildEmiPreviewBody({ loanAmount: "", tenureMonths: "36" })).toBeNull();
    expect(buildEmiPreviewBody({ loanAmount: "500000", tenureMonths: "" })).toBeNull();
    expect(buildEmiPreviewBody({ loanAmount: "abc", tenureMonths: "36" })).toBeNull();
    expect(buildEmiPreviewBody({ loanAmount: "0", tenureMonths: "36" })).toBeNull();
    expect(buildEmiPreviewBody({ loanAmount: "500000", tenureMonths: "36" })).toEqual({
      desired_borrowing_amount: 500000,
      desired_tenure_months: 36,
    });
  });

  it("builds a full check body with no rate and no legacy fifth essential", () => {
    const body = buildBorrowCheckBody(completeForm);
    expect(body).toEqual({
      calculation_mode: "track_11a_breakdown",
      monthly_income: 120000,
      existing_debt_payments: 18000,
      housing_rent: 28000,
      household_utilities: 11000,
      dependants_education: 12000,
      recurring_medical_insurance: 6000,
      desired_borrowing_amount: 500000,
      desired_tenure_months: 36,
      month_end_position: "money_left",
    });
    expect(body).not.toHaveProperty("illustrative_annual_rate_percent");
    expect(body).not.toHaveProperty("other_essential_commitments");
  });

  it("includes optional answers only when given", () => {
    const body = buildBorrowCheckBody({ ...completeForm, loanPurpose: "vehicle", emiEnding: "not_sure" });
    expect(body).toMatchObject({ loan_purpose: "vehicle", existing_emi_ending_within_six_months: "not_sure" });
  });

  it("refuses to build a body from blank or incomplete input, so blank can never post as zero", () => {
    expect(buildBorrowCheckBody(emptyBorrowJourneyForm)).toBeNull();
    expect(buildBorrowCheckBody({ ...completeForm, housing: "" })).toBeNull();
    expect(buildBorrowCheckBody({ ...completeForm, monthEndPosition: null })).toBeNull();
    expect(buildBorrowCheckBody({ ...completeForm, tenureMonths: "" })).toBeNull();
  });
});
