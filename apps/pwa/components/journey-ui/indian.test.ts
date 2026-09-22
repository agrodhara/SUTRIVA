import { describe, expect, it } from "vitest";
import { formatPercentShare, formatRupeesExact, groupIndian, positionAfterSignificant, sanitizeAmount, significantCount } from "./indian";

describe("sanitizeAmount", () => {
  it("keeps digits, one dot and at most two decimals", () => {
    expect(sanitizeAmount("₹ 5,00,000")).toBe("500000");
    expect(sanitizeAmount("12.345")).toBe("12.34");
    expect(sanitizeAmount("1.2.3")).toBe("1.23");
    expect(sanitizeAmount("abc")).toBe("");
  });

  it("never turns a negative entry into a positive one: a leading minus is preserved, not dropped", () => {
    // ASCII hyphen-minus.
    expect(sanitizeAmount("-5")).toBe("-5");
    expect(sanitizeAmount("-1234567")).toBe("-1234567");
    // The real minus sign (U+2212), as produced by formatted negative amounts elsewhere in the app.
    expect(sanitizeAmount("−5")).toBe("-5");
    expect(sanitizeAmount("-12.5")).toBe("-12.5");
    // A lone minus with nothing typed yet stays a minus: it must not become "" or a positive value.
    expect(sanitizeAmount("-")).toBe("-");
    expect(sanitizeAmount("−")).toBe("-");
  });
});

describe("groupIndian", () => {
  it("groups in the Indian style", () => {
    expect(groupIndian("")).toBe("");
    expect(groupIndian("0")).toBe("0");
    expect(groupIndian("999")).toBe("999");
    expect(groupIndian("1000")).toBe("1,000");
    expect(groupIndian("100000")).toBe("1,00,000");
    expect(groupIndian("500000")).toBe("5,00,000");
    expect(groupIndian("12345678")).toBe("1,23,45,678");
    expect(groupIndian("1234.5")).toBe("1,234.5");
  });

  it("displays a negative amount as negative, never as its positive magnitude", () => {
    expect(groupIndian("-5")).toBe("-5");
    expect(groupIndian("-1234567")).toBe("-12,34,567");
    expect(groupIndian("-12.5")).toBe("-12.5");
    expect(groupIndian("-")).toBe("-");
  });
});

describe("formatRupeesExact", () => {
  it("shows whole rupees with Indian grouping and a real minus sign", () => {
    expect(formatRupeesExact(17088.81)).toBe("₹17,089");
    expect(formatRupeesExact(615197.34)).toBe("₹6,15,197");
    expect(formatRupeesExact(115197.34)).toBe("₹1,15,197");
    expect(formatRupeesExact(-125888.15)).toBe("−₹1,25,888");
    expect(formatRupeesExact(0)).toBe("₹0");
  });
});

describe("significantCount / positionAfterSignificant (caret stability)", () => {
  it("counts a leading minus as significant, so the caret sits after it, not before it", () => {
    expect(significantCount("-")).toBe(1);
    expect(significantCount("-5")).toBe(2);
    expect(significantCount("−5")).toBe(2);
    expect(significantCount("5")).toBe(1);
  });

  it("places the caret after a lone leading minus, so the next digit is inserted after it, not before it", () => {
    // This is what keeps "type - then 5" from producing "5-" (which would sanitize away to a positive "5").
    expect(positionAfterSignificant("-", 1)).toBe(1);
    expect(positionAfterSignificant("-5", 2)).toBe(2);
  });
});

describe("formatPercentShare", () => {
  it("prints whole percents, and one decimal when it matters", () => {
    expect(formatPercentShare(0.15)).toBe("15%");
    expect(formatPercentShare(0.2924)).toBe("29.2%");
  });
});
