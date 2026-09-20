import { describe, expect, it } from "vitest";
import {
  MINUS_SIGN,
  formatApproxLakh,
  formatLakh,
  formatRatePercent,
  formatRupees,
  formatRupeesNearest100,
  formatTenureYears,
  formatWholePercent,
  rateCopy,
} from "./format";

describe("Borrow Better display formatting", () => {
  it("rounds EMI and breathing-room figures to the nearest ₹100", () => {
    expect(formatRupeesNearest100(17088.81)).toBe("₹17,100");
    expect(formatRupeesNearest100(27911.19)).toBe("₹27,900");
    expect(formatRupeesNearest100(45000)).toBe("₹45,000");
    expect(formatRupeesNearest100(3417.76)).toBe("₹3,400");
  });

  it("uses Indian digit grouping", () => {
    expect(formatRupees(615197.34)).toBe("₹6,15,197");
    expect(formatRupeesNearest100(1234567)).toBe("₹12,34,600");
  });

  it("renders whole percent", () => {
    expect(formatWholePercent(0.15)).toBe("15%");
    expect(formatWholePercent(0.2924)).toBe("29%");
    expect(formatWholePercent(1.5741)).toBe("157%");
  });

  it("renders approximate lakh format", () => {
    expect(formatApproxLakh(615197.34)).toBe("~₹6.15 lakh");
    expect(formatApproxLakh(115197.34)).toBe("~₹1.15 lakh");
    expect(formatApproxLakh(600000)).toBe("~₹6 lakh");
    expect(formatApproxLakh(610000)).toBe("~₹6.1 lakh");
    expect(formatApproxLakh(42000)).toBe("~₹42,000");
  });

  it("renders round lakh amounts", () => {
    expect(formatLakh(100000)).toBe("₹1 lakh");
    expect(formatLakh(250000)).toBe("₹2.5 lakh");
  });

  it("keeps the sign of negatives and uses U+2212, never a hyphen-minus", () => {
    const shortfall = formatRupeesNearest100(-125888.15);
    expect(shortfall).toBe(`${MINUS_SIGN}₹1,25,900`);
    expect(shortfall).not.toContain("-");
    expect(formatRupees(-1100)).toBe(`${MINUS_SIGN}₹1,100`);
    expect(formatApproxLakh(-250000)).toBe(`~${MINUS_SIGN}₹2.5 lakh`);
  });

  it("never clamps a negative to zero and never shows a negative zero", () => {
    expect(formatRupeesNearest100(-49)).toBe(`${MINUS_SIGN}₹49`);
    expect(formatRupeesNearest100(-0.2)).toBe("₹0");
    expect(formatRupeesNearest100(0)).toBe("₹0");
    expect(formatRupeesNearest100(-100)).toBe(`${MINUS_SIGN}₹100`);
  });

  it("formats the tenure span and the rate", () => {
    expect(formatTenureYears(36)).toBe("3 years");
    expect(formatTenureYears(12)).toBe("1 year");
    expect(formatTenureYears(30)).toBe("30 months");
    expect(formatRatePercent(14)).toBe("14%");
    expect(formatRatePercent(12.5)).toBe("12.5%");
  });

  it("builds the canonical rate copy from the supplied policy rate", () => {
    expect(rateCopy(14)).toBe("Illustrative annual rate: 14%. Configured by policy; not a loan offer.");
    expect(rateCopy(12.5)).toBe("Illustrative annual rate: 12.5%. Configured by policy; not a loan offer.");
  });
});
