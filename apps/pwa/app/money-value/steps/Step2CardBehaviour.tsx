"use client";

import { useState } from "react";
import { JourneyStepShell, RadioCardGroup } from "../../../components/journey-foundation";
import styles from "../rewards.module.css";
import {
  BALANCE_OPTIONS,
  REWARD_TYPE_OPTIONS,
  hasErrors,
  isBalanceBehavior,
  isRewardType,
  validateStep2,
  type RewardsFormState,
} from "../rewardsFormState";
import { ErrorSummary } from "./ErrorSummary";

export function Step2CardBehaviour({
  form,
  onChange,
  onContinue,
  hydrated,
  focusHeadingOnMount,
}: {
  form: RewardsFormState;
  onChange: (patch: Partial<RewardsFormState>) => void;
  onContinue: () => void;
  hydrated: boolean;
  focusHeadingOnMount: boolean;
}) {
  const [attempt, setAttempt] = useState(0);
  const errors = validateStep2(form);
  const showErrors = attempt > 0;

  function handleContinue() {
    if (hasErrors(errors)) {
      setAttempt((count) => count + 1);
      return;
    }
    onContinue();
  }

  return (
    <JourneyStepShell
      stepLabel="Step 2 of 5"
      title="Your card behaviour"
      focusHeadingOnMount={focusHeadingOnMount}
      actions={
        <button type="button" className={styles.primaryAction} onClick={handleContinue} disabled={!hydrated}>
          Continue
        </button>
      }
    >
      <ErrorSummary attempt={attempt} messages={Object.values(errors)} />
      <RadioCardGroup
        legend="Do you pay the full statement balance?"
        hint="This helps us understand your situation."
        name="rewards-balance-behavior"
        options={BALANCE_OPTIONS}
        value={form.balanceBehavior}
        errorId={showErrors && errors.balanceBehavior ? "rewards-balance-error" : undefined}
        onChange={(value) => {
          if (isBalanceBehavior(value)) onChange({ balanceBehavior: value });
        }}
      />
      {showErrors && errors.balanceBehavior ? (
        <p id="rewards-balance-error" className={styles.fieldError}>
          {errors.balanceBehavior}
        </p>
      ) : null}
      <RadioCardGroup
        legend="What type of rewards does your card offer?"
        name="rewards-reward-type"
        options={REWARD_TYPE_OPTIONS}
        value={form.rewardType}
        errorId={showErrors && errors.rewardType ? "rewards-reward-type-error" : undefined}
        onChange={(value) => {
          if (isRewardType(value)) onChange({ rewardType: value });
        }}
      />
      {showErrors && errors.rewardType ? (
        <p id="rewards-reward-type-error" className={styles.fieldError}>
          {errors.rewardType}
        </p>
      ) : null}
    </JourneyStepShell>
  );
}
