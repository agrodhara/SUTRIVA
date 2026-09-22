import { describe, expect, it } from "vitest";
import { borrowHeadline, breathingBand } from "./breathingBand";

describe("breathingBand (the existing 10% / 20% thresholds)", () => {
  it("reads a negative breathing room as a shortfall", () => {
    expect(breathingBand(-1, 120000)).toBe("shortfall");
  });
  it("reads under 10% of income as very thin", () => {
    expect(breathingBand(0, 120000)).toBe("very_thin");
    expect(breathingBand(11999, 120000)).toBe("very_thin");
  });
  it("reads 10% to under 20% as limited", () => {
    expect(breathingBand(12000, 120000)).toBe("limited");
    expect(breathingBand(23999, 120000)).toBe("limited");
  });
  it("reads 20% or more as comfortable", () => {
    expect(breathingBand(24000, 120000)).toBe("comfortable");
    expect(breathingBand(27911.19, 120000)).toBe("comfortable");
  });
  it("never divides by a zero income", () => {
    expect(breathingBand(5000, 0)).toBe("very_thin");
  });
});

describe("borrowHeadline", () => {
  it("states the loan, the tenure and the band", () => {
    expect(borrowHeadline("₹5,00,000", 36, "limited")).toBe("₹5,00,000 over 36 months looks tight against your monthly cash flow.");
    expect(borrowHeadline("₹5,00,000", 36, "shortfall")).toBe("₹5,00,000 over 36 months would take your monthly cash flow below zero.");
  });
});
