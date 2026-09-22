import { describe, expect, it } from "vitest";
import { formatPercentShare, formatRupeesExact, groupIndian, sanitizeAmount } from "./indian";

describe("sanitizeAmount", () => {
  it("keeps digits, one dot and at most two decimals", () => {
    expect(sanitizeAmount("₹ 5,00,000")).toBe("500000");
    expect(sanitizeAmount("12.345")).toBe("12.34");
    expect(sanitizeAmount("1.2.3")).toBe("1.23");
    expect(sanitizeAmount("-5")).toBe("5");
    expect(sanitizeAmount("abc")).toBe("");
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

describe("formatPercentShare", () => {
  it("prints whole percents, and one decimal when it matters", () => {
    expect(formatPercentShare(0.15)).toBe("15%");
    expect(formatPercentShare(0.2924)).toBe("29.2%");
  });
});
