import { describe, expect, it } from "vitest";
import { consolidationCaveat, selectBorrowSituation, selectBorrowSituationFromResult } from "./borrowInsight";

describe("selectBorrowSituation", () => {
  it("worked check: official example — income 1,20,000, essentials 57,000, existing 18,000, EMI 17,089 → additional borrowing", () => {
    const finding = selectBorrowSituation({
      income: 120000,
      existingPayments: 18000,
      essentials: 57000,
      emi: 17089,
      breathingRoomBefore: 45000,
      breathingRoomAfter: 27911,
    });
    expect(finding.code).toBe("additional_borrowing");
    expect(finding.headline).toBe("This loan would add about ₹17,089 to your monthly payments.");
    expect(finding.explanation).toContain("₹18,000");
    expect(finding.explanation).toContain("₹57,000");
    expect(finding.explanation).toContain("₹45,000");
    expect(finding.explanation).toContain("₹27,911");
  });

  it("worked check: shortfall case — income 90,000, essentials 60,000, existing 20,000, EMI 17,089 → room before 10,000, short by 7,089", () => {
    const finding = selectBorrowSituation({
      income: 90000,
      existingPayments: 20000,
      essentials: 60000,
      emi: 17089,
      breathingRoomBefore: 10000,
      breathingRoomAfter: 10000 - 17089,
    });
    expect(finding.code).toBe("shortfall_from_emi");
    expect(finding.headline).toBe(
      "The proposed EMI of ₹17,089/month is ₹7,089/month more than your available room of ₹10,000/month, based on the figures entered.",
    );
  });

  it("shows a shortfall that already existed before this loan as its own situation, outranking the routine reading", () => {
    const finding = selectBorrowSituation({
      income: 60000,
      existingPayments: 30000,
      essentials: 35000,
      emi: 17089,
      breathingRoomBefore: -5000,
      breathingRoomAfter: -5000 - 17089,
    });
    expect(finding.code).toBe("shortfall_before_loan");
    expect(finding.headline).toBe("You're already short by about ₹5,000 a month before this loan, based on what you've told us.");
  });

  it("never lets a positive breathing room after the EMI read as a shortfall", () => {
    const finding = selectBorrowSituation({
      income: 120000,
      existingPayments: 18000,
      essentials: 57000,
      emi: 100,
      breathingRoomBefore: 45000,
      breathingRoomAfter: 44900,
    });
    expect(finding.code).toBe("additional_borrowing");
  });

  it("reads straight from a backend result and the parsed form amounts", () => {
    const finding = selectBorrowSituationFromResult(
      { estimated_new_monthly_commitment: 17088.81, breathing_room_before: 45000, breathing_room_after: 27911.19 },
      120000,
      18000,
      57000,
    );
    expect(finding.code).toBe("additional_borrowing");
    expect(finding.headline).toBe("This loan would add about ₹17,089 to your monthly payments.");
  });
});

describe("consolidationCaveat", () => {
  it("names the loan as additional borrowing, never a confirmed replacement, when the purpose is debt consolidation", () => {
    const caveat = consolidationCaveat("debt_consolidation", "₹5,00,000");
    expect(caveat).not.toBeNull();
    expect(caveat?.headline).toBe("This is new borrowing alongside your existing payments, not a straight replacement.");
    expect(caveat?.explanation).toContain("₹5,00,000");
    expect(caveat?.limitation).toContain("doesn't collect");
  });

  it("never instructs the customer to tell us which obligations a loan replaces — this journey collects no such field", () => {
    const caveat = consolidationCaveat("debt_consolidation", "₹5,00,000");
    const allCopy = `${caveat?.headline} ${caveat?.explanation} ${caveat?.why} ${caveat?.tryThis} ${caveat?.limitation}`;
    expect(allCopy).not.toMatch(/tell us which|so we can compare|so this comparison can be run on your real figures/i);
    expect(caveat?.tryThis).toContain("illustrative example");
  });

  it("is never shown for any other purpose, or when none was given", () => {
    for (const purpose of ["home_improvement", "vehicle", "", "other"]) {
      expect(consolidationCaveat(purpose, "₹5,00,000")).toBeNull();
    }
  });
});
