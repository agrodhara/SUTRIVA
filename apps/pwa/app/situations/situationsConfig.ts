/**
 * Data-driven configuration for the nine narrow Phase 1.1A situation checks, ported from the reviewed
 * mockup's own `journeys`/`fields` tables. Copy, field labels and example values are kept verbatim from
 * that review; only the calculation itself moved server-side (see the API client in situationsApi.ts) and
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
    heading: "Borrowing decisions begin with your situation.",
    lead: "A new purchase, a loan offer, rising repayments or a rejection: choose what is happening to you.",
    journey: "comfortable_borrowing",
  },
  rewards: {
    eyebrow: "Rewards Intelligence",
    heading: "Is your card giving you value where it matters?",
    lead: "A fee, unused points, a carried balance or several cards: choose the question that has been on your mind.",
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
    arrival: "Where is the monthly squeeze?",
    intro: "See what remains after essentials and current repayments. Rough monthly figures are enough to explore.",
    question: "How much room is left each month?",
    gap: "This check uses the figures you entered. It cannot see every obligation or change a lender's terms.",
    screenBase: "borrow_debt",
    fields: [
      { id: "income", label: "Monthly take-home income", example: 75000 },
      { id: "essentials", label: "Essential monthly spending", example: 35000 },
      { id: "emis", label: "Total current EMIs", example: 32000 },
      { id: "overdue", label: "Any payment already overdue?", example: "no", type: "select", options: ["No", "Yes", "Not sure"] },
    ],
  },
  purchase: {
    group: "borrow",
    nav: "New purchase",
    arrival: "Would the quoted EMI fit your month?",
    intro: "Use a quoted EMI and tenure alongside the price and upfront amount. We check whether the payments cover the financed amount.",
    question: "Would this quoted EMI fit beside your current costs?",
    gap: "This is a monthly scenario. It does not include running costs, a lender decision or a live offer.",
    screenBase: "borrow_purchase",
    fields: [
      { id: "price", label: "Purchase price", example: 1200000 },
      { id: "down", label: "Amount you could pay upfront", example: 300000 },
      { id: "emi", label: "EMI quoted for this purchase", example: 24000 },
      { id: "months", label: "Quoted tenure in months", example: 48, type: "wholeNumber" },
      { id: "income", label: "Monthly take-home income", example: 95000 },
      { id: "costs", label: "Current EMIs and essential spending", example: 60000 },
    ],
  },
  offer: {
    group: "borrow",
    nav: "Loan offer",
    arrival: "What does this offer really cost?",
    intro: "Use the amount, EMI and tenure on the offer. The estimate will reflect those terms, before fees.",
    question: "What sits behind the monthly EMI?",
    gap: "We only know the offer you enter. We cannot say if another lender would approve you or offer a better rate.",
    screenBase: "borrow_offer",
    fields: [
      { id: "principal", label: "Loan amount offered", example: 800000 },
      { id: "emi", label: "Monthly EMI offered", example: 22000 },
      { id: "months", label: "Tenure in months", example: 48, type: "wholeNumber" },
      { id: "income", label: "Monthly take-home income", example: 95000 },
      { id: "costs", label: "Current EMIs and essential spending", example: 60000 },
    ],
  },
  rejected: {
    group: "borrow",
    nav: "Rejected or shortfall",
    arrival: "What was the decision you were trying to make?",
    intro: "We cannot see why a lender decided as it did. You can still test the monthly commitment you had in mind.",
    question: "How would that hoped-for payment fit?",
    gap: "These figures cannot explain a lender's decision or predict approval. That needs the lender's reason and verified credit and income information.",
    screenBase: "borrow_rejected",
    fields: [
      { id: "emi", label: "EMI you were considering", example: 22000 },
      { id: "income", label: "Monthly take-home income", example: 95000 },
      { id: "costs", label: "Current EMIs and essential spending", example: 60000 },
    ],
  },
  fee: {
    group: "rewards",
    nav: "Annual fee",
    arrival: "Did your redeemed rewards cover the fee?",
    intro: "Use value you really redeemed in rupees. Keep interest separate from the fee comparison.",
    question: "Did redeemed rewards outweigh the annual fee?",
    gap: "We cannot verify points, expiry or card terms from this anonymous check.",
    screenBase: "rewards_fee",
    fields: [
      { id: "redeemed", label: "Rewards you redeemed, in rupees", example: 4200 },
      { id: "fee", label: "Annual card fee, in rupees", example: 3000 },
      { id: "interest", label: "Interest paid this year, if known", example: 1500, type: "optional" },
    ],
  },
  fit: {
    group: "rewards",
    nav: "Card and spending fit",
    arrival: "Where might your card be missing value?",
    intro: "Choose one spending category. We will show a hypothetical rate comparison, not a verdict about your card.",
    question: "How much could an earning-rate difference matter?",
    gap: "We do not know your card's earning rules, exclusions or actual spending. The rates below are illustrative.",
    screenBase: "rewards_fit",
    fields: [
      { id: "category", label: "Where do you spend most?", example: "groceries", type: "select", options: ["Groceries", "Travel", "Online shopping", "Fuel", "Other"] },
      { id: "spend", label: "Typical monthly spend in this category", example: 12000 },
    ],
  },
  balance: {
    group: "rewards",
    nav: "Carrying a balance",
    arrival: "Are rewards keeping up with interest?",
    intro: "Use amounts from the same statement period. If you do not know the interest, we will keep the answer directional.",
    question: "What did interest do to the reward value?",
    gap: "We do not have your statement or know whether the reward value entered can be redeemed as cash.",
    screenBase: "rewards_balance",
    fields: [
      { id: "known", label: "Do you know the interest charged?", example: "yes", type: "select", options: ["Yes", "No"] },
      { id: "interest", label: "Interest charged in this statement period", example: 2100, type: "conditional", showWhen: { field: "known", equals: "yes" } },
      { id: "rewards", label: "Rewards redeemed or valued by issuer in the same period", example: 450 },
    ],
  },
  multi: {
    group: "rewards",
    nav: "Several cards",
    arrival: "What do your cards return after their fees?",
    intro: "Enter two cards separately. This is a fee and redeemed-value comparison, not an overlap or best-card verdict.",
    question: "What can you tell from two card totals?",
    gap: "The totals cannot reveal category overlap, exclusions or which card to use for each purchase.",
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
    arrival: "What are those unused points worth?",
    intro: "Enter the issuer's stated cash value if you have it. We will not invent a conversion or expiry date.",
    question: "What can you actually say about unused points?",
    gap: "Point value and expiry depend on the issuer and redemption choice. We cannot see them here.",
    screenBase: "rewards_unused",
    fields: [
      { id: "points", label: "Unused points shown by issuer", example: 12000 },
      { id: "value", label: "Issuer-stated cash value of those points, if known", example: null, type: "optional" },
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
