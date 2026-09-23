/**
 * Fixed fictional example for Step 5's "Better structure" panel: distinguishing a genuine debt
 * replacement from additional borrowing, and showing that a lower EMI is not automatically a saving.
 *
 * This is a synthetic, reconciled illustration, not the customer's data: nothing here reads what the
 * customer entered, and no component may interpolate a customer value into it. Every figure below is
 * derived from the same small set of constants, so the reconciliation always holds by construction:
 * payoff amount + additional borrowing = total new loan, and the two allocated EMIs sum to the whole
 * loan's real EMI.
 *
 * A real customer's own journey never sees this full comparison: 1.1A does not ask which specific
 * obligations a loan replaces or their remaining balance and term, so a real customer sees only the
 * partial-consolidation caveat (see `borrowInsight.ts`), never a total-cost comparison built from figures
 * that were never collected.
 */

/** The named obligation the example loan partly replaces. */
export const OLD_OBLIGATION_MONTHLY_PAYMENT = 8000;
export const OLD_OBLIGATION_MONTHS_REMAINING = 10;
/** What remains to be paid on the old schedule: 8,000 × 10 = 80,000. Distinct from its payoff amount today. */
export const OLD_OBLIGATION_REMAINING_SCHEDULED_PAYMENTS = OLD_OBLIGATION_MONTHLY_PAYMENT * OLD_OBLIGATION_MONTHS_REMAINING;
/** The separate, lower amount that actually closes the obligation today. */
export const OLD_OBLIGATION_PAYOFF_TODAY = 74000;

/** The example new loan: the same official Borrow Better example loan. */
export const NEW_LOAN_AMOUNT = 500000;
export const NEW_LOAN_TENURE_MONTHS = 36;
export const NEW_LOAN_ILLUSTRATIVE_RATE_PERCENT = 14;
/** The loan's real, whole EMI — used for every actual room/cash-flow figure below, never an allocated share. */
export const NEW_LOAN_EMI = 17089;

export const ADDITIONAL_BORROWING_AMOUNT = NEW_LOAN_AMOUNT - OLD_OBLIGATION_PAYOFF_TODAY;

/** EMI allocated to the replaced portion, in proportion to loan amount — illustrative cost breakdown only. */
export const REPLACED_PORTION_ALLOCATED_EMI = Math.round((NEW_LOAN_EMI * OLD_OBLIGATION_PAYOFF_TODAY) / NEW_LOAN_AMOUNT);
export const ADDITIONAL_BORROWING_ALLOCATED_EMI = NEW_LOAN_EMI - REPLACED_PORTION_ALLOCATED_EMI;

export const REPLACED_PORTION_TOTAL_COST = REPLACED_PORTION_ALLOCATED_EMI * NEW_LOAN_TENURE_MONTHS;
export const REPLACED_PORTION_COST_INCREASE = REPLACED_PORTION_TOTAL_COST - OLD_OBLIGATION_REMAINING_SCHEDULED_PAYMENTS;

/** The official example's own declared figures, so the whole-loan room reconciles to them exactly. */
export const EXAMPLE_INCOME = 120000;
export const EXAMPLE_ESSENTIALS = 57000;
export const EXAMPLE_EXISTING_PAYMENTS = 18000;
/** Existing payments other than the obligation being replaced: 18,000 − 8,000 = 10,000. */
export const EXAMPLE_OTHER_EXISTING_PAYMENTS = EXAMPLE_EXISTING_PAYMENTS - OLD_OBLIGATION_MONTHLY_PAYMENT;

/** Room after this loan, using the whole loan's real EMI — never the allocated replacement portion alone. */
export const WHOLE_LOAN_ROOM_AFTER = EXAMPLE_INCOME - EXAMPLE_ESSENTIALS - (EXAMPLE_OTHER_EXISTING_PAYMENTS + NEW_LOAN_EMI);
/** Room after the same loan amount added as pure additional borrowing (the official example's own Step 4 result), for comparison. */
export const ADDITIONAL_BORROWING_ONLY_ROOM_AFTER = EXAMPLE_INCOME - EXAMPLE_ESSENTIALS - (EXAMPLE_EXISTING_PAYMENTS + NEW_LOAN_EMI);
export const ROOM_DIFFERENCE_VS_ADDITIONAL_BORROWING_ONLY = WHOLE_LOAN_ROOM_AFTER - ADDITIONAL_BORROWING_ONLY_ROOM_AFTER;

/** True when a lower EMI on the replaced portion nonetheless costs more overall — the flag this panel exists to raise. */
export const REPLACED_PORTION_COSTS_MORE = REPLACED_PORTION_ALLOCATED_EMI < OLD_OBLIGATION_MONTHLY_PAYMENT && REPLACED_PORTION_COST_INCREASE > 0;
