import type { StackSegment } from "../../components/journey-ui/StackedBar";
import { formatRupeesExact } from "../../components/journey-ui/indian";
import type { BorrowCheckResult } from "./borrowApi";
import { parseRupeeAmount, type BorrowJourneyForm } from "./journeyState";

/**
 * Figures derived from the active dataset (typed or sample) for the live summary and the Step 5 graphic.
 * The result's own numbers (EMI, breathing room after) come from the backend; the rest is the customer's
 * entries added up for display. Nothing here decides a result.
 */

const amountOf = (raw: string): number | null => {
  const parsed = parseRupeeAmount(raw);
  return parsed.ok ? parsed.value : null;
};

/** Sum of the four essential expenses, or null until all four are valid amounts. */
export function essentialsTotal(form: BorrowJourneyForm): number | null {
  const parts = [form.housing, form.household, form.dependants, form.medical].map(amountOf);
  return parts.every((part): part is number => part !== null) ? parts.reduce((sum, part) => sum + part, 0) : null;
}

/** Income less existing payments and essentials (before any new EMI), or null until every figure is valid. */
export function leftAfterCommitments(form: BorrowJourneyForm): number | null {
  const income = amountOf(form.monthlyIncome);
  const existing = amountOf(form.existingPayments);
  const essentials = essentialsTotal(form);
  if (income === null || existing === null || essentials === null) return null;
  return income - existing - essentials;
}

export type BorrowGlance = {
  income: number;
  essentials: number;
  existing: number;
  emi: number;
  /** Backend breathing room after the EMI. Negative means a monthly shortfall. */
  leftAfter: number;
  segments: StackSegment[];
  totalDisplay: string;
  total: number;
  summary: string;
};

/** Monthly income split into essentials, existing payments, the proposed EMI and what is left. */
export function buildBorrowGlance(form: BorrowJourneyForm, result: BorrowCheckResult): BorrowGlance | null {
  const income = amountOf(form.monthlyIncome);
  const existing = amountOf(form.existingPayments);
  const essentials = essentialsTotal(form);
  if (income === null || existing === null || essentials === null) return null;

  const emi = result.estimated_new_monthly_commitment;
  const leftAfter = result.breathing_room_after;
  const total = Math.max(income, existing + essentials + emi);
  const segments: StackSegment[] = [
    { label: "Essential expenses", value: essentials, tone: "essentials", display: formatRupeesExact(essentials) },
    { label: "Existing loan and card payments", value: existing, tone: "existing", display: formatRupeesExact(existing) },
    { label: "Proposed EMI", value: emi, tone: "emi", display: formatRupeesExact(emi) },
    {
      label: leftAfter < 0 ? "Monthly shortfall" : "Left after this EMI",
      value: Math.max(leftAfter, 0),
      tone: "left",
      display: formatRupeesExact(leftAfter),
    },
  ];
  const summary =
    `Monthly take-home income of ${formatRupeesExact(income)} split into essentials ${formatRupeesExact(essentials)}, ` +
    `existing payments ${formatRupeesExact(existing)}, the proposed EMI ${formatRupeesExact(emi)} and ` +
    `${leftAfter < 0 ? "a shortfall of" : "what is left,"} ${formatRupeesExact(Math.abs(leftAfter))}.`;
  return { income, essentials, existing, emi, leftAfter, segments, total, totalDisplay: formatRupeesExact(income), summary };
}

export type MonthlyPicture = {
  segments: StackSegment[];
  total: number;
  totalDisplay: string;
  summary: string;
};

/** Live Step 2 split of income before any new EMI: essentials, existing payments and what is left. */
export function buildMonthlyPicture(form: BorrowJourneyForm): MonthlyPicture | null {
  const income = amountOf(form.monthlyIncome);
  const existing = amountOf(form.existingPayments);
  const essentials = essentialsTotal(form);
  if (income === null || income <= 0 || existing === null || essentials === null) return null;
  const left = income - existing - essentials;
  const segments: StackSegment[] = [
    { label: "Essential expenses", value: essentials, tone: "essentials", display: formatRupeesExact(essentials) },
    { label: "Existing loan and card payments", value: existing, tone: "existing", display: formatRupeesExact(existing) },
    { label: left < 0 ? "Shortfall before a new EMI" : "Left before a new EMI", value: Math.max(left, 0), tone: "left", display: formatRupeesExact(left) },
  ];
  return {
    segments,
    total: Math.max(income, existing + essentials),
    totalDisplay: formatRupeesExact(income),
    summary: `Monthly take-home income of ${formatRupeesExact(income)} split into essentials, existing payments and ${left < 0 ? "a shortfall" : "what is left"} of ${formatRupeesExact(Math.abs(left))}.`,
  };
}
