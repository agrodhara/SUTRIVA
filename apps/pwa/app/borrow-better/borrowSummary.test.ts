import { describe, expect, it } from "vitest";
import type { BorrowCheckResult } from "./borrowApi";
import { BORROW_EXAMPLE_FORM, borrowFormMatchesExample } from "./borrowExample";
import { buildBorrowGlance, buildMonthlyPicture, essentialsTotal, leftAfterCommitments } from "./borrowSummary";
import { emptyBorrowJourneyForm } from "./journeyState";

const result = {
  estimated_new_monthly_commitment: 17088.81,
  breathing_room_after: 27911.19,
} as BorrowCheckResult;

describe("borrowSummary", () => {
  it("adds up essentials and what is left after commitments for the sample", () => {
    expect(essentialsTotal(BORROW_EXAMPLE_FORM)).toBe(57000);
    expect(leftAfterCommitments(BORROW_EXAMPLE_FORM)).toBe(45000);
  });

  it("returns nothing until every figure is a valid amount, and never treats blank as zero", () => {
    expect(essentialsTotal(emptyBorrowJourneyForm)).toBeNull();
    expect(leftAfterCommitments({ ...BORROW_EXAMPLE_FORM, housing: "" })).toBeNull();
    expect(buildMonthlyPicture({ ...BORROW_EXAMPLE_FORM, monthlyIncome: "" })).toBeNull();
    expect(buildMonthlyPicture({ ...BORROW_EXAMPLE_FORM, monthlyIncome: "0" })).toBeNull();
  });

  it("splits income for the Step 5 graphic from the active dataset and the backend result", () => {
    const glance = buildBorrowGlance(BORROW_EXAMPLE_FORM, result);
    expect(glance?.segments.map((segment) => [segment.label, segment.display])).toEqual([
      ["Essential expenses", "₹57,000"],
      ["Existing loan and card payments", "₹18,000"],
      ["Proposed EMI", "₹17,089"],
      ["Left after this EMI", "₹27,911"],
    ]);
    expect(glance?.totalDisplay).toBe("₹1,20,000");
  });

  it("labels a negative result as a shortfall and keeps its sign", () => {
    const glance = buildBorrowGlance(BORROW_EXAMPLE_FORM, { ...result, breathing_room_after: -5000 });
    const last = glance?.segments[3];
    expect(last?.label).toBe("Monthly shortfall");
    expect(last?.display).toBe("−₹5,000");
    expect(last?.value).toBe(0);
  });

  it("recognises the untouched sample and any edit to it", () => {
    expect(borrowFormMatchesExample({ ...BORROW_EXAMPLE_FORM })).toBe(true);
    expect(borrowFormMatchesExample({ ...BORROW_EXAMPLE_FORM, emiEnding: "yes" })).toBe(false);
    expect(borrowFormMatchesExample(emptyBorrowJourneyForm)).toBe(false);
  });
});
