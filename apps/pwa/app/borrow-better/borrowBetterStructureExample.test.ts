import { describe, expect, it } from "vitest";
import {
  ADDITIONAL_BORROWING_ALLOCATED_EMI,
  ADDITIONAL_BORROWING_AMOUNT,
  ADDITIONAL_BORROWING_ONLY_ROOM_AFTER,
  NEW_LOAN_AMOUNT,
  OLD_OBLIGATION_PAYOFF_TODAY,
  OLD_OBLIGATION_REMAINING_SCHEDULED_PAYMENTS,
  REPLACED_PORTION_ALLOCATED_EMI,
  REPLACED_PORTION_COST_INCREASE,
  REPLACED_PORTION_COSTS_MORE,
  REPLACED_PORTION_TOTAL_COST,
  ROOM_DIFFERENCE_VS_ADDITIONAL_BORROWING_ONLY,
  WHOLE_LOAN_ROOM_AFTER,
} from "./borrowBetterStructureExample";

// Matches the worked checks in the source specification exactly, so this fixed illustration can never
// silently drift from the reconciled numbers it was built from.
describe("borrowBetterStructureExample", () => {
  it("the payoff amount and additional borrowing sum to exactly the total new loan", () => {
    expect(OLD_OBLIGATION_PAYOFF_TODAY).toBe(74000);
    expect(ADDITIONAL_BORROWING_AMOUNT).toBe(426000);
    expect(OLD_OBLIGATION_PAYOFF_TODAY + ADDITIONAL_BORROWING_AMOUNT).toBe(NEW_LOAN_AMOUNT);
  });

  it("the two allocated EMIs sum to exactly the whole loan's real EMI", () => {
    expect(REPLACED_PORTION_ALLOCATED_EMI).toBe(2529);
    expect(ADDITIONAL_BORROWING_ALLOCATED_EMI).toBe(14560);
    expect(REPLACED_PORTION_ALLOCATED_EMI + ADDITIONAL_BORROWING_ALLOCATED_EMI).toBe(17089);
  });

  it("the replaced portion's total cost rises even though its monthly payment falls: a lower EMI is not automatically a saving", () => {
    expect(OLD_OBLIGATION_REMAINING_SCHEDULED_PAYMENTS).toBe(80000);
    expect(REPLACED_PORTION_TOTAL_COST).toBe(91044);
    expect(REPLACED_PORTION_COST_INCREASE).toBe(11044);
    expect(REPLACED_PORTION_COSTS_MORE).toBe(true);
  });

  it("whole-loan room after is 35,911 — 8,000 more than the pure-additional-borrowing case's 27,911, since the old payment is no longer separate", () => {
    expect(WHOLE_LOAN_ROOM_AFTER).toBe(35911);
    expect(ADDITIONAL_BORROWING_ONLY_ROOM_AFTER).toBe(27911);
    expect(ROOM_DIFFERENCE_VS_ADDITIONAL_BORROWING_ONLY).toBe(8000);
  });
});
