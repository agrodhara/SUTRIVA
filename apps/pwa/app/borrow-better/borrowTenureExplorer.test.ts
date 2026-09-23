import { describe, expect, it } from "vitest";
import { exploreTenure } from "./borrowTenureExplorer";

describe("exploreTenure", () => {
  it("worked check: ₹2,00,000 over 36 months at 14% — EMI ₹6,836, room ₹8,164, total interest ₹46,096", () => {
    const result = exploreTenure({
      emi: 6836,
      tenureMonths: 36,
      loanAmount: 200000,
      income: 90000,
      existingPayments: 0,
      breathingRoomBefore: 15000,
      debtRatioBefore: 0,
    });
    expect(result.breathingRoomAfter).toBe(15000 - 6836);
    expect(result.totalRepayment).toBe(6836 * 36);
    expect(result.totalInterest).toBe(6836 * 36 - 200000);
    expect(result.totalInterest).toBe(46096);
  });

  it("worked check: the same loan over 60 months — EMI ₹4,654, room ₹10,346, total interest ₹79,240, ₹33,144 more than at 36 months", () => {
    const at36 = exploreTenure({ emi: 6836, tenureMonths: 36, loanAmount: 200000, income: 90000, existingPayments: 0, breathingRoomBefore: 15000, debtRatioBefore: 0 });
    const at60 = exploreTenure({ emi: 4654, tenureMonths: 60, loanAmount: 200000, income: 90000, existingPayments: 0, breathingRoomBefore: 15000, debtRatioBefore: 0 });
    expect(at60.breathingRoomAfter).toBe(15000 - 4654);
    expect(at60.breathingRoomAfter).toBe(10346);
    expect(at60.totalInterest).toBe(79240);
    expect(at60.totalInterest - at36.totalInterest).toBe(33144);
    // Room improves and total interest rises: the trade-off, not just the numbers, is different.
    expect(at60.breathingRoomAfter).toBeGreaterThan(at36.breathingRoomAfter);
    expect(at60.totalInterest).toBeGreaterThan(at36.totalInterest);
  });

  it("worked check: official example — EMI ₹17,089 on ₹5,00,000 over 36 months, DTI after ≈29%", () => {
    const result = exploreTenure({
      emi: 17089,
      tenureMonths: 36,
      loanAmount: 500000,
      income: 120000,
      existingPayments: 18000,
      breathingRoomBefore: 45000,
      debtRatioBefore: 18000 / 120000,
    });
    expect(result.breathingRoomAfter).toBe(27911);
    expect(result.debtRatioBefore).toBeCloseTo(0.15, 5);
    expect(result.debtRatioAfter).toBeCloseTo(0.2924, 4);
    expect(result.totalRepayment).toBe(17089 * 36);
    expect(result.totalInterest).toBe(17089 * 36 - 500000);
  });

  it("returns a zero debt ratio rather than dividing by zero income", () => {
    const result = exploreTenure({ emi: 1000, tenureMonths: 12, loanAmount: 12000, income: 0, existingPayments: 0, breathingRoomBefore: 0, debtRatioBefore: 0 });
    expect(result.debtRatioAfter).toBe(0);
  });
});
