/**
 * Fixed synthetic content for Step 5. It is an approved static disclosure, not the user's data: nothing
 * here is derived from what the user entered or from the Step 4 result, and no component may interpolate
 * user values into it.
 */

export const SYNTHETIC_EXAMPLE = {
  title: "What connected data could add",
  intro: "This fictional example shows what permissioned data could help analyse.",
  notConnectedNote: "This version does not connect to your bank or bureau data.",
  incomeRegularity: { title: "Income regularity", detail: "Salary received consistently" },
  recurringCommitments: { title: "Recurring commitments", detail: "₹31,500 identified" },
  typicalMonthEndBuffer: { title: "Typical month-end buffer", detail: "₹8,200" },
  essentialSpending: { title: "Essential spending increased", detail: "in 2 of the last 6 months." },
  commitmentRelease: { title: "Commitment release", detail: "A ₹6,000 EMI may end in 5 months" },
  chartTitle: "Example cash-flow trend (last 6 months)",
  chartSummary:
    "Bar chart of an example six-month cash-flow trend. Income stays between about ₹1.2 lakh and ₹1.3 lakh each month, and total commitments stay between about ₹50,000 and ₹65,000.",
  /** Rounded example values in rupees. The chart and its table are drawn from this one list. */
  months: [
    { month: "Jan", income: 122000, commitments: 52000 },
    { month: "Feb", income: 126000, commitments: 62000 },
    { month: "Mar", income: 124000, commitments: 51000 },
    { month: "Apr", income: 130000, commitments: 63000 },
    { month: "May", income: 125000, commitments: 55000 },
    { month: "Jun", income: 128000, commitments: 65000 },
  ],
} as const;
