/**
 * Data-driven configuration for the nine narrow Phase 1.1A situation checks, ported from the reviewed
 * mockup's own `journeys`/`fields` tables. The figures and calculation are retained; customer copy is
 * kept short and plain. The calculation itself moved server-side (see situationsApi.ts) and
 * the "ad" screen was dropped, since ads are a separate campaign asset, not part of the customer website.
 */
import type { Journey } from "../../lib/api";

export type SituationGroup = "borrow" | "rewards";

export type SituationKey =
  | "debt"
  | "purchase"
  | "offer"
  | "rejected"
  | "fee"
  | "fit"
  | "balance"
  | "multi"
  | "unused";

/** "wholeNumber" marks a field the API only accepts as a whole number (currently the two tenure-in-months
 * fields) — the client must reject a fractional entry itself rather than silently rounding it before the
 * API ever sees it; see SituationFlow.tsx's invalidWholeMonthField and toRequestBody. */
export type FieldType = "select" | "optional" | "conditional" | "wholeNumber" | undefined;

export type FieldDef = {
  id: string;
  label: string;
  example: number | string | null;
  type?: FieldType;
  options?: readonly string[];
  /** Only used for type "conditional": the field only appears/applies when this other field equals this value. */
  showWhen?: { field: string; equals: string };
};

export type SituationCopy = {
  group: SituationGroup;
  /** Short label used in the landing choice grid and the header. */
  nav: string;
  /** The choice-grid card's headline — the customer question that earns attention. */
  arrival: string;
  /** One-line sub-copy under the arrival question, shown on the choice card and the arrival screen. */
  intro: string;
  /** The inputs screen's own headline — usually the same question, restated. */
  question: string;
  /** Fixed limitation copy — what this check cannot tell the customer. Shown briefly on the result screen. */
  gap: string;
  screenBase: string;
  fields: readonly FieldDef[];
};

export const GROUP_COPY: Record<SituationGroup, { eyebrow: string; heading: string; lead: string; journey: Journey }> = {
  borrow: {
    eyebrow: "Borrow Better",
    heading: "What is on your mind about borrowing?",
    lead: "Are EMIs piling up? Buying something big? Looking at an offer? Pick the situation closest to yours.",
    journey: "comfortable_borrowing",
  },
  rewards: {
    eyebrow: "Rewards Intelligence",
    heading: "Is your card giving you enough back?",
    lead: "Fees, interest, unused points or everyday spending: pick the card question on your mind.",
    journey: "money_value",
  },
};

export const GROUPS: Record<SituationGroup, readonly SituationKey[]> = {
  borrow: ["debt", "purchase", "offer", "rejected"],
  rewards: ["fee", "fit", "balance", "multi", "unused"],
};

export const SITUATIONS: Record<SituationKey, SituationCopy> = {
  debt: {
    group: "borrow",
    nav: "Rising EMIs",
    arrival: "Are your EMIs taking too much each month?",
    intro: "See what is left after essential costs and EMIs.",
    question: "How much is left each month?",
    gap: "This check only knows what you entered. It cannot see all your payments or change your loans.",
    screenBase: "borrow_debt",
    fields: [
      { id: "income", label: "Monthly take-home income", example: 75000 },
      { id: "essentials", label: "Monthly essentials (rent, food, bills)", example: 35000 },
      { id: "emis", label: "Total current EMIs", example: 32000 },
      { id: "overdue", label: "Any payment already overdue?", example: "no", type: "select", options: ["No", "Yes", "Not sure"] },
    ],
  },
  purchase: {
    group: "borrow",
    nav: "New purchase",
    arrival: "Thinking of a car, phone or other big purchase?",
    intro: "See what a phone, car or other purchase could leave you each month.",
    question: "What would be left after this EMI?",
    gap: "This does not include the purchase's running costs. It cannot tell you if a lender will approve a loan.",
    screenBase: "borrow_purchase",
    fields: [
      { id: "price", label: "Purchase price", example: 80000 },
      { id: "down", label: "Amount you could pay upfront", example: 20000 },
      { id: "emi", label: "EMI quoted for this purchase", example: 3000 },
      { id: "months", label: "Number of monthly payments quoted", example: 24, type: "wholeNumber" },
      { id: "income", label: "Monthly take-home income", example: 45000 },
      { id: "costs", label: "Current EMIs and monthly essentials", example: 28000 },
    ],
  },
  offer: {
    group: "borrow",
    nav: "Loan offer",
    arrival: "What does this offer really cost?",
    intro: "See how much you would repay in total, before fees.",
    question: "What would you pay in total?",
    gap: "We only know the offer you enter. We cannot tell you if another lender would approve you or charge less.",
    screenBase: "borrow_offer",
    fields: [
      { id: "principal", label: "Loan amount offered", example: 800000 },
      { id: "emi", label: "Monthly EMI offered", example: 22000 },
      { id: "months", label: "Number of monthly payments", example: 48, type: "wholeNumber" },
      { id: "income", label: "Monthly take-home income", example: 95000 },
      { id: "costs", label: "Current EMIs and monthly essentials", example: 60000 },
    ],
  },
  rejected: {
    group: "borrow",
    nav: "Loan rejected",
    arrival: "Loan rejected or got less than you asked for?",
    intro: "We cannot explain the decision. You can check the EMI you had in mind.",
    question: "Would that EMI fit your month?",
    gap: "This cannot explain why the lender said no or tell you if another lender would approve you.",
    screenBase: "borrow_rejected",
    fields: [
      { id: "emi", label: "EMI you were considering", example: 22000 },
      { id: "income", label: "Monthly take-home income", example: 95000 },
      { id: "costs", label: "Current EMIs and monthly essentials", example: 60000 },
    ],
  },
  fee: {
    group: "rewards",
    nav: "Annual fee",
    arrival: "Did your rewards cover the fee?",
    intro: "Compare rewards you used with the card's annual fee.",
    question: "Were the rewards you used worth more than the fee?",
    gap: "We cannot see your points, expiry date or card rules here.",
    screenBase: "rewards_fee",
    fields: [
      { id: "redeemed", label: "Rewards you used, in rupees", example: 4200 },
      { id: "fee", label: "Annual card fee, in rupees", example: 3000 },
      { id: "interest", label: "Interest paid this year, if known", example: 1500, type: "optional" },
    ],
  },
  fit: {
    group: "rewards",
    nav: "Card and spending",
    arrival: "Could a different reward rate matter for what you buy?",
    intro: "Try example rates on one type of spending. This does not measure your card.",
    question: "What difference could a reward rate make?",
    gap: "We do not know your card's real reward rate or rules. The rates shown are only examples.",
    screenBase: "rewards_fit",
    fields: [
      { id: "category", label: "Where do you spend most?", example: "online shopping", type: "select", options: ["Groceries", "Travel", "Online shopping", "Fuel", "Other"] },
      { id: "spend", label: "How much do you spend here each month?", example: 8000 },
    ],
  },
  balance: {
    group: "rewards",
    nav: "Card interest",
    arrival: "Are rewards keeping up with interest?",
    intro: "Compare card interest with rewards from the same period.",
    question: "Was the interest more than your rewards?",
    gap: "We cannot see your statement or check the cash value of your rewards.",
    screenBase: "rewards_balance",
    fields: [
      { id: "known", label: "Do you know the interest charged?", example: "yes", type: "select", options: ["Yes", "No"] },
      { id: "interest", label: "Interest charged in this statement period", example: 2100, type: "conditional", showWhen: { field: "known", equals: "yes" } },
      { id: "rewards", label: "Rewards used or valued by your card app in the same period", example: 450 },
    ],
  },
  multi: {
    group: "rewards",
    nav: "Several cards",
    arrival: "What do your cards return after their fees?",
    intro: "Compare the rewards you used and the fee on each card.",
    question: "What did each card give back after its fee?",
    gap: "These totals cannot tell you which card is best for each purchase.",
    screenBase: "rewards_multi",
    fields: [
      { id: "fee1", label: "First card annual fee", example: 3000 },
      { id: "reward1", label: "First card rewards redeemed", example: 4200 },
      { id: "fee2", label: "Second card annual fee", example: 1500 },
      { id: "reward2", label: "Second card rewards redeemed", example: 900 },
    ],
  },
  unused: {
    group: "rewards",
    nav: "Unused points",
    arrival: "Have points you never use?",
    intro: "Know how much they are worth in rupees? Check your card app, then compare.",
    question: "Do you know what your unused points are worth?",
    gap: "Your card provider sets the point value and expiry date. We cannot see them here.",
    screenBase: "rewards_unused",
    fields: [
      { id: "points", label: "Unused points shown in your card app", example: 12000 },
      { id: "value", label: "Cash value shown by your card app, if known", example: null, type: "optional" },
      { id: "fee", label: "Annual fee, if you want a comparison", example: 3000, type: "optional" },
    ],
  },
};

export function situationsInGroup(group: SituationGroup): readonly SituationKey[] {
  return GROUPS[group];
}

export function otherGroup(group: SituationGroup): SituationGroup {
  return group === "borrow" ? "rewards" : "borrow";
}

export function isSituationKey(value: string | null): value is SituationKey {
  return !!value && value in SITUATIONS;
}

/** Like isSituationKey, but also requires the key to belong to the given group — a valid key from the
 * *other* group (e.g. `?situation=offer` on /money-value, or `?situation=fee` on /borrow-better) must not
 * open that situation under the wrong journey's header and copy. Used for the campaign-URL entry point in
 * SituationsApp.tsx; the landing choice grid never needs this since it only ever offers keys already
 * scoped to its own group (see situationsInGroup). */
export function isSituationKeyInGroup(value: string | null, group: SituationGroup): value is SituationKey {
  return isSituationKey(value) && SITUATIONS[value].group === group;
}
