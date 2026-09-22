import type { PreviewRow } from "../../components/journey-ui/ExampleEntry";
import { formatRupeesExact } from "../../components/journey-ui/indian";
import { EMI_ENDING_OPTIONS, MONTH_END_OPTIONS, PURPOSE_OPTIONS, type BorrowJourneyForm } from "./journeyState";

/**
 * The one internally consistent sample dataset for Borrow Better. It fills every field on Steps 2 and 3, so
 * the same figures drive the fields, the result, the narrative and the graphics. It is sample content, not
 * customer data, and it is never sent anywhere until the customer chooses to run the check.
 */
export const BORROW_EXAMPLE_FORM: BorrowJourneyForm = {
  monthlyIncome: "120000",
  existingPayments: "18000",
  housing: "28000",
  household: "11000",
  dependants: "12000",
  medical: "6000",
  monthEndPosition: "money_left",
  loanAmount: "500000",
  tenureMonths: "36",
  loanPurpose: "home_improvement",
  emiEnding: "no",
};

const EXAMPLE_KEYS = Object.keys(BORROW_EXAMPLE_FORM) as (keyof BorrowJourneyForm)[];

/** True when every field still equals the sample value. Any change means "Example values edited". */
export function borrowFormMatchesExample(form: BorrowJourneyForm): boolean {
  return EXAMPLE_KEYS.every((key) => form[key] === BORROW_EXAMPLE_FORM[key]);
}

const labelOf = <T extends string>(options: readonly { value: T; label: string }[], value: T | null | ""): string =>
  options.find((option) => option.value === value)?.label ?? "Not specified";

const essentials =
  Number(BORROW_EXAMPLE_FORM.housing) +
  Number(BORROW_EXAMPLE_FORM.household) +
  Number(BORROW_EXAMPLE_FORM.dependants) +
  Number(BORROW_EXAMPLE_FORM.medical);

/** Compact preview shown before the sample is applied. */
export const BORROW_EXAMPLE_PREVIEW: readonly PreviewRow[] = [
  { label: "Monthly take-home income", value: formatRupeesExact(Number(BORROW_EXAMPLE_FORM.monthlyIncome)) },
  { label: "Existing loan and card payments", value: formatRupeesExact(Number(BORROW_EXAMPLE_FORM.existingPayments)) },
  { label: "Essential monthly expenses", value: formatRupeesExact(essentials) },
  { label: "Usual month-end position", value: labelOf(MONTH_END_OPTIONS, BORROW_EXAMPLE_FORM.monthEndPosition) },
  { label: "Loan amount", value: formatRupeesExact(Number(BORROW_EXAMPLE_FORM.loanAmount)) },
  { label: "Tenure", value: `${BORROW_EXAMPLE_FORM.tenureMonths} months` },
  { label: "Purpose", value: labelOf(PURPOSE_OPTIONS, BORROW_EXAMPLE_FORM.loanPurpose) },
  { label: "Existing EMI ending within six months", value: labelOf(EMI_ENDING_OPTIONS, BORROW_EXAMPLE_FORM.emiEnding) },
];
