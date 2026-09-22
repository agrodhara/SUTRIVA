import type { PreviewRow } from "../../components/journey-ui/ExampleEntry";
import { formatRupeesExact } from "../../components/journey-ui/indian";
import {
  BALANCE_OPTIONS,
  PERIOD_PHRASE,
  PRIORITY_OPTIONS,
  REWARD_TYPE_OPTIONS,
  type RewardsFormState,
} from "./rewardsFormState";

/**
 * The one internally consistent sample dataset for Rewards Intelligence. It fills every field on Steps 2 and 3
 * so the same figures drive the fields, the result, the narrative and the graphics. It is sample content, not
 * customer data.
 */
export const REWARDS_EXAMPLE_FORM: RewardsFormState = {
  balanceBehavior: "pay_in_full",
  rewardType: "cashback",
  priorities: ["dining", "travel", "grocery"],
  monthlySpend: "25000",
  annualFee: "4000",
  rewardKnowledge: null,
  rewardAmount: "900",
  rewardUnits: "",
  rewardPeriod: "monthly",
};

/** True while every field still equals the sample value. Any change means "Example values edited". */
export function rewardsFormMatchesExample(form: RewardsFormState): boolean {
  const example = REWARDS_EXAMPLE_FORM;
  const sameList = [...form.priorities].sort().join(",") === [...example.priorities].sort().join(",");
  return (
    sameList &&
    form.balanceBehavior === example.balanceBehavior &&
    form.rewardType === example.rewardType &&
    form.monthlySpend === example.monthlySpend &&
    form.annualFee === example.annualFee &&
    form.rewardKnowledge === example.rewardKnowledge &&
    form.rewardAmount === example.rewardAmount &&
    form.rewardUnits === example.rewardUnits &&
    form.rewardPeriod === example.rewardPeriod
  );
}

const labelOf = (options: readonly { value: string; label: string }[], value: string | null): string =>
  options.find((option) => option.value === value)?.label ?? "Not specified";

export const REWARDS_EXAMPLE_PREVIEW: readonly PreviewRow[] = [
  { label: "Statement balance", value: labelOf(BALANCE_OPTIONS, REWARDS_EXAMPLE_FORM.balanceBehavior) },
  { label: "Reward type", value: labelOf(REWARD_TYPE_OPTIONS, REWARDS_EXAMPLE_FORM.rewardType) },
  { label: "Spending priorities", value: REWARDS_EXAMPLE_FORM.priorities.map((priority) => labelOf(PRIORITY_OPTIONS, priority)).join(", ") },
  { label: "Monthly card spend", value: formatRupeesExact(Number(REWARDS_EXAMPLE_FORM.monthlySpend)) },
  { label: "Annual card fee", value: formatRupeesExact(Number(REWARDS_EXAMPLE_FORM.annualFee)) },
  {
    label: "Cashback received",
    value: `${formatRupeesExact(Number(REWARDS_EXAMPLE_FORM.rewardAmount))} ${PERIOD_PHRASE[REWARDS_EXAMPLE_FORM.rewardPeriod ?? "monthly"]}`,
  },
];
