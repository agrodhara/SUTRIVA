import { formatRupeesExact } from "../../components/journey-ui/indian";
import type { BorrowCheckResult } from "./borrowApi";

/**
 * Selects the one situation today's declared Borrow Better inputs support for the Step 4 result, and the
 * copy that goes with it. Checked in order; the first match wins. "Incomplete" and "replacement of named
 * obligations" from the full specification are not reachable here: Step 4 only renders once a check has
 * already succeeded (so income/essentials/payments/loan/tenure are already complete), and 1.1A does not
 * collect which specific obligations a loan replaces (that stays in the fictional-example-only panel on
 * Step 5). A monthly shortfall — whether it already existed before this loan or is caused by this loan's
 * EMI — always outranks the routine "additional borrowing" reading, because the risk is more important to
 * surface than the routine case.
 */

export type BorrowSituationCode = "shortfall_before_loan" | "shortfall_from_emi" | "additional_borrowing";

export type BorrowFinding = {
  code: BorrowSituationCode;
  headline: string;
  explanation: string;
  why: string;
  tryThis: string;
  limitation: string;
};

export type BorrowFindingInputs = {
  income: number;
  existingPayments: number;
  essentials: number;
  /** The EMI this finding is about: the submitted result's EMI, or a "try a different tenure" preview. */
  emi: number;
  /** Breathing room before this EMI (income − existing payments − essentials). */
  breathingRoomBefore: number;
  /** Breathing room after this EMI. */
  breathingRoomAfter: number;
};

export function selectBorrowSituation(inputs: BorrowFindingInputs): BorrowFinding {
  const { existingPayments, essentials, emi, breathingRoomBefore, breathingRoomAfter } = inputs;
  const emiDisplay = formatRupeesExact(emi);

  if (breathingRoomBefore < 0) {
    return {
      code: "shortfall_before_loan",
      headline: `You're already short by about ${formatRupeesExact(Math.abs(breathingRoomBefore))} a month before this loan, based on what you've told us.`,
      explanation: `Your declared income, essentials and existing payments already leave you ${formatRupeesExact(breathingRoomBefore)} a month, before this loan.`,
      why: "This loan would add to an existing shortfall, not create one.",
      tryThis: "Review your essentials or existing payments for accuracy before considering a loan.",
      limitation: "Based on what you've told us, not verified against a bureau or bank statement.",
    };
  }

  if (breathingRoomAfter < 0) {
    return {
      code: "shortfall_from_emi",
      headline: `The proposed EMI of ${emiDisplay}/month is ${formatRupeesExact(Math.abs(breathingRoomAfter))}/month more than your available room of ${formatRupeesExact(breathingRoomBefore)}/month, based on the figures entered.`,
      explanation: `Your available room before this loan is ${formatRupeesExact(breathingRoomBefore)}/month; the proposed EMI is ${emiDisplay}/month.`,
      why: "This loan's EMI would take your monthly position below zero.",
      tryThis: "Reduce the loan amount or extend the tenure before proceeding.",
      limitation: "EMI uses the fixed illustrative 14% rate, not an approved offer.",
    };
  }

  return {
    code: "additional_borrowing",
    headline: `This loan would add about ${emiDisplay} to your monthly payments.`,
    explanation: `Right now ${formatRupeesExact(existingPayments)} of your ${formatRupeesExact(inputs.income)} income goes to existing payments and ${formatRupeesExact(essentials)} to essentials, leaving ${formatRupeesExact(breathingRoomBefore)}. This loan's EMI would leave about ${formatRupeesExact(breathingRoomAfter)}.`,
    // Generalised from the source doc's exact worked-example wording ("...would nearly double..."), which
    // is only true for that one example's numbers: this holds for every case in this situation.
    why: "Your monthly debt payments would increase as a share of your income, though you'd still have room left.",
    tryThis: "Try a different loan amount or tenure to see how the picture changes.",
    limitation: "The EMI uses a fixed illustrative 14% rate set by Sutriva, not an approved offer or your actual rate.",
  };
}

export type ConsolidationCaveat = {
  headline: string;
  explanation: string;
  why: string;
  tryThis: string;
  limitation: string;
};

/**
 * The honest reading of a "debt consolidation" purpose on real declared data: 1.1A never asks which
 * specific obligations a loan replaces, so the full amount is treated as additional borrowing, not a
 * confirmed replacement. Returns null for any other purpose — this caveat is never shown as a conclusion
 * about a customer who didn't select debt consolidation.
 */
export function consolidationCaveat(loanPurpose: string, loanAmountDisplay: string): ConsolidationCaveat | null {
  if (loanPurpose !== "debt_consolidation") return null;
  return {
    headline: "This is new borrowing alongside your existing payments, not a straight replacement.",
    explanation: `We don't yet know which specific obligation(s) this ${loanAmountDisplay} loan replaces, so the full amount is treated as additional borrowing on top of what you already pay.`,
    why: "Calling this consolidation would overstate how much existing debt it actually clears.",
    tryThis: "Tell us which specific loans or cards this would replace, so we can compare like-for-like.",
    limitation: "We have not confirmed this replaces any specific existing obligation.",
  };
}

/** Convenience wrapper reading straight from the backend result and the form's parsed amounts. */
export function selectBorrowSituationFromResult(
  result: Pick<BorrowCheckResult, "estimated_new_monthly_commitment" | "breathing_room_before" | "breathing_room_after">,
  income: number,
  existingPayments: number,
  essentials: number,
): BorrowFinding {
  return selectBorrowSituation({
    income,
    existingPayments,
    essentials,
    emi: result.estimated_new_monthly_commitment,
    breathingRoomBefore: result.breathing_room_before,
    breathingRoomAfter: result.breathing_room_after,
  });
}
