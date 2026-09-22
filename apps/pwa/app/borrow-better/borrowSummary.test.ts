import { describe, expect, it } from "vitest";
import { formatRupeesExact } from "../../components/journey-ui/indian";
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

  it("splits income for the Step 5 graphic from the active dataset and the backend result (positive left)", () => {
    const glance = buildBorrowGlance(BORROW_EXAMPLE_FORM, result);
    expect(glance?.segments.map((segment) => [segment.label, segment.display])).toEqual([
      ["Essential expenses", "₹57,000"],
      ["Existing loan and card payments", "₹18,000"],
      ["Proposed EMI", "₹17,089"],
      ["Left after this EMI", "₹27,911"],
    ]);
    expect(glance?.total).toBe(120000);
    expect(glance?.totalLabel).toBe("Monthly take-home income");
    expect(glance?.totalDisplay).toBe("₹1,20,000");
    expect(glance?.shortfall).toBeNull();
    // Denominator, percentages, total label and displayed total all describe the same quantity: income.
    const sumOfSegments = glance?.segments.reduce((sum, segment) => sum + segment.value, 0);
    expect(sumOfSegments).toBeCloseTo(glance?.total ?? NaN, 6);
  });

  it("shows an exact zero-left result as a real ₹0 segment, not a shortfall", () => {
    // Essentials 57,000 + existing 18,000 + EMI = exactly income (1,20,000): nothing left, but no shortfall.
    const glance = buildBorrowGlance(BORROW_EXAMPLE_FORM, { ...result, estimated_new_monthly_commitment: 45000, breathing_room_after: 0 });
    const last = glance?.segments[3];
    expect(last?.label).toBe("Left after this EMI");
    expect(last?.value).toBe(0);
    expect(last?.display).toBe("₹0");
    expect(glance?.total).toBe(120000);
    expect(glance?.totalLabel).toBe("Monthly take-home income");
    expect(glance?.shortfall).toBeNull();
  });

  it("never represents a shortfall as a zero-value segment, and keeps the denominator, percentages, label and total consistent", () => {
    const glance = buildBorrowGlance(BORROW_EXAMPLE_FORM, { ...result, breathing_room_after: -5000 });
    // No fabricated "left"/"shortfall" bar segment: only the three real commitments are drawn.
    expect(glance?.segments.map((segment) => segment.label)).toEqual([
      "Essential expenses",
      "Existing loan and card payments",
      "Proposed EMI",
    ]);
    expect(glance?.segments.some((segment) => segment.value === 0)).toBe(false);
    // The chart's total is always the sum of the drawn commitment segments themselves, so it matches exactly
    // regardless of what the backend's breathing_room_after says (here, an injected -5,000 shortfall).
    const committed = (glance?.essentials ?? 0) + (glance?.existing ?? 0) + (glance?.emi ?? 0);
    expect(glance?.total).toBe(committed);
    expect(glance?.totalLabel).toBe("Total monthly commitments (with this EMI)");
    expect(glance?.totalDisplay).toBe(formatRupeesExact(committed));
    expect(glance?.shortfall).toBe(5000);
    // The denominator equals the sum of the drawn segments exactly: percentages always add to 100%.
    const sumOfSegments = glance?.segments.reduce((sum, segment) => sum + segment.value, 0);
    expect(sumOfSegments).toBeCloseTo(glance?.total ?? NaN, 6);
  });

  it("builds the live Step 2/3 monthly picture consistently for a comfortable month, an exact zero-left month, and a shortfall month", () => {
    const comfortable = buildMonthlyPicture(BORROW_EXAMPLE_FORM);
    expect(comfortable?.segments.map((segment) => segment.label)).toEqual(["Essential expenses", "Existing loan and card payments", "Left before a new EMI"]);
    expect(comfortable?.total).toBe(120000);
    expect(comfortable?.totalLabel).toBe("Monthly take-home income");
    expect(comfortable?.shortfall).toBeNull();

    // Essentials 57,000 + existing 63,000 = exactly the 1,20,000 income: nothing left, but not a shortfall.
    const zeroLeft = buildMonthlyPicture({ ...BORROW_EXAMPLE_FORM, existingPayments: "63000" });
    const zeroLeftSegment = zeroLeft?.segments[2];
    expect(zeroLeftSegment?.label).toBe("Left before a new EMI");
    expect(zeroLeftSegment?.value).toBe(0);
    expect(zeroLeftSegment?.display).toBe("₹0");
    expect(zeroLeft?.total).toBe(120000);
    expect(zeroLeft?.shortfall).toBeNull();

    // Existing 1,10,000 + essentials 57,000 = 1,67,000, which is 47,000 more than the 1,20,000 income.
    const shortfall = buildMonthlyPicture({ ...BORROW_EXAMPLE_FORM, existingPayments: "110000" });
    expect(shortfall?.segments.map((segment) => segment.label)).toEqual(["Essential expenses", "Existing loan and card payments"]);
    expect(shortfall?.segments.some((segment) => segment.value === 0)).toBe(false);
    expect(shortfall?.total).toBe(167000);
    expect(shortfall?.totalLabel).toBe("Total monthly commitments");
    expect(shortfall?.totalDisplay).toBe("₹1,67,000");
    expect(shortfall?.shortfall).toBe(47000);
    const sumOfSegments = shortfall?.segments.reduce((sum, segment) => sum + segment.value, 0);
    expect(sumOfSegments).toBeCloseTo(shortfall?.total ?? NaN, 6);
  });

  it("recognises the untouched sample and any edit to it", () => {
    expect(borrowFormMatchesExample({ ...BORROW_EXAMPLE_FORM })).toBe(true);
    expect(borrowFormMatchesExample({ ...BORROW_EXAMPLE_FORM, emiEnding: "yes" })).toBe(false);
    expect(borrowFormMatchesExample(emptyBorrowJourneyForm)).toBe(false);
  });
});
