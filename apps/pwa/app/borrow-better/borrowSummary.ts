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
  totalLabel: string;
  totalDisplay: string;
  total: number;
  /** Positive amount by which essentials, existing payments and the EMI exceed income, or null when there is no shortfall. */
  shortfall: number | null;
  summary: string;
};

/**
 * Monthly income split into essentials, existing payments, the proposed EMI and what is left.
 *
 * When there is a monthly shortfall (the three commitments add up to more than income), the chart's
 * denominator switches to that committed total instead of income: a negative "left" can never be forced
 * into a zero-value segment, and the total, its label and its displayed figure always describe the same
 * quantity as the segments and their percentages. The shortfall itself is returned separately so the
 * caller can state it explicitly, in text, alongside the chart.
 */
export function buildBorrowGlance(form: BorrowJourneyForm, result: BorrowCheckResult): BorrowGlance | null {
  const income = amountOf(form.monthlyIncome);
  const existing = amountOf(form.existingPayments);
  const essentials = essentialsTotal(form);
  if (income === null || existing === null || essentials === null) return null;

  const emi = result.estimated_new_monthly_commitment;
  const leftAfter = result.breathing_room_after;
  const committed = essentials + existing + emi;

  if (leftAfter >= 0) {
    const segments: StackSegment[] = [
      { label: "Essential expenses", value: essentials, tone: "essentials", display: formatRupeesExact(essentials) },
      { label: "Existing loan and card payments", value: existing, tone: "existing", display: formatRupeesExact(existing) },
      { label: "Proposed EMI", value: emi, tone: "emi", display: formatRupeesExact(emi) },
      { label: "Left after this EMI", value: leftAfter, tone: "left", display: formatRupeesExact(leftAfter) },
    ];
    const summary =
      `Monthly take-home income of ${formatRupeesExact(income)} split into essentials ${formatRupeesExact(essentials)}, ` +
      `existing payments ${formatRupeesExact(existing)}, the proposed EMI ${formatRupeesExact(emi)} and what is left, ${formatRupeesExact(leftAfter)}.`;
    return {
      income,
      essentials,
      existing,
      emi,
      leftAfter,
      segments,
      total: income,
      totalLabel: "Monthly take-home income",
      totalDisplay: formatRupeesExact(income),
      shortfall: null,
      summary,
    };
  }

  const shortfall = -leftAfter;
  const segments: StackSegment[] = [
    { label: "Essential expenses", value: essentials, tone: "essentials", display: formatRupeesExact(essentials) },
    { label: "Existing loan and card payments", value: existing, tone: "existing", display: formatRupeesExact(existing) },
    { label: "Proposed EMI", value: emi, tone: "emi", display: formatRupeesExact(emi) },
  ];
  const summary =
    `Essential expenses ${formatRupeesExact(essentials)}, existing payments ${formatRupeesExact(existing)} and the proposed EMI ${formatRupeesExact(emi)} ` +
    `add up to ${formatRupeesExact(committed)}, which is ${formatRupeesExact(shortfall)} more than your monthly take-home income of ${formatRupeesExact(income)}.`;
  return {
    income,
    essentials,
    existing,
    emi,
    leftAfter,
    segments,
    total: committed,
    totalLabel: "Total monthly commitments (with this EMI)",
    totalDisplay: formatRupeesExact(committed),
    shortfall,
    summary,
  };
}

export type MonthlyPicture = {
  segments: StackSegment[];
  total: number;
  totalLabel: string;
  totalDisplay: string;
  /** Positive amount by which existing payments and essentials exceed income, or null when there is no shortfall. */
  shortfall: number | null;
  summary: string;
};

/**
 * Live Step 2 split of income before any new EMI: essentials, existing payments and what is left.
 *
 * When existing payments and essentials already exceed income, the chart's denominator switches to that
 * committed total instead of income: a negative "left" can never be forced into a zero-value segment, and
 * the total, its label and its displayed figure always describe the same quantity as the segments and
 * their percentages. The shortfall itself is returned separately so the caller can state it explicitly.
 */
export function buildMonthlyPicture(form: BorrowJourneyForm): MonthlyPicture | null {
  const income = amountOf(form.monthlyIncome);
  const existing = amountOf(form.existingPayments);
  const essentials = essentialsTotal(form);
  if (income === null || income <= 0 || existing === null || essentials === null) return null;
  const committed = existing + essentials;
  const left = income - committed;

  if (left >= 0) {
    const segments: StackSegment[] = [
      { label: "Essential expenses", value: essentials, tone: "essentials", display: formatRupeesExact(essentials) },
      { label: "Existing loan and card payments", value: existing, tone: "existing", display: formatRupeesExact(existing) },
      { label: "Left before a new EMI", value: left, tone: "left", display: formatRupeesExact(left) },
    ];
    return {
      segments,
      total: income,
      totalLabel: "Monthly take-home income",
      totalDisplay: formatRupeesExact(income),
      shortfall: null,
      summary: `Monthly take-home income of ${formatRupeesExact(income)} split into essentials, existing payments and what is left, ${formatRupeesExact(left)}.`,
    };
  }

  const shortfall = -left;
  const segments: StackSegment[] = [
    { label: "Essential expenses", value: essentials, tone: "essentials", display: formatRupeesExact(essentials) },
    { label: "Existing loan and card payments", value: existing, tone: "existing", display: formatRupeesExact(existing) },
  ];
  return {
    segments,
    total: committed,
    totalLabel: "Total monthly commitments",
    totalDisplay: formatRupeesExact(committed),
    shortfall,
    summary: `Existing payments and essentials add up to ${formatRupeesExact(committed)}, which is ${formatRupeesExact(shortfall)} more than your monthly take-home income of ${formatRupeesExact(income)}.`,
  };
}
