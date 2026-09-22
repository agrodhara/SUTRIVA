"use client";

import { useId, useState } from "react";
import { RadioCardGroup } from "../../../components/journey-foundation";
import { ExampleEntry } from "../../../components/journey-ui/ExampleEntry";
import { StepHeading } from "../../../components/journey-ui/StepHeading";
import ui from "../../../components/journey-ui/journeyUi.module.css";
import styles from "../rewards.module.css";
import { REWARDS_EXAMPLE_PREVIEW } from "../rewardsExample";
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

export const REWARD_TYPE_LEGEND = "Which reward type do you want to assess?";
export const REWARD_TYPE_HINT = "If your card offers several types, choose the one you use most. You can run another check for a different reward.";

const labelOf = (options: readonly { value: string; label: string }[], value: string | null) =>
  options.find((option) => option.value === value)?.label ?? "Not chosen yet";

export function Step2CardBehaviour({
  form,
  onChange,
  onContinue,
  hydrated,
  focusHeadingOnMount,
  exampleApplied,
  exampleEdited,
  onApplyExample,
  onClearExample,
}: {
  form: RewardsFormState;
  onChange: (patch: Partial<RewardsFormState>) => void;
  onContinue: () => void;
  hydrated: boolean;
  focusHeadingOnMount: boolean;
  exampleApplied: boolean;
  exampleEdited: boolean;
  onApplyExample: () => void;
  onClearExample: () => void;
}) {
  const headingId = useId();
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
    <section aria-labelledby={headingId} className={ui.grid}>
      <div className={ui.colMain}>
        <div className={`${ui.section} ${ui.o1}`}>
          <StepHeading id={headingId} stepLabel="Step 2 of 5" title="Your card behaviour" focusOnMount={focusHeadingOnMount} />
          <ExampleEntry
            key={exampleApplied ? "applied" : "manual"}
            applied={exampleApplied}
            edited={exampleEdited}
            previewRows={REWARDS_EXAMPLE_PREVIEW}
            onApply={onApplyExample}
            onClear={onClearExample}
            disabled={!hydrated}
          />
        </div>

        <div className={`${ui.form} ${ui.o2}`}>
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
            legend={REWARD_TYPE_LEGEND}
            hint={REWARD_TYPE_HINT}
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
        </div>

        <div className={`${ui.actions} ${ui.o3}`}>
          <button type="button" className={ui.primaryButton} onClick={handleContinue} disabled={!hydrated}>
            Continue
          </button>
        </div>
      </div>

      <aside className={`${ui.colSide} ${ui.desktopOnly}`} aria-label="Your card so far">
        <div className={ui.card}>
          <h3 className={ui.cardHeading}>Your card so far</h3>
          <dl className={ui.summaryRows}>
            <div className={ui.summaryRow}>
              <dt>Statement balance</dt>
              <dd>{labelOf(BALANCE_OPTIONS, form.balanceBehavior)}</dd>
            </div>
            <div className={ui.summaryRow}>
              <dt>Reward type assessed</dt>
              <dd>{labelOf(REWARD_TYPE_OPTIONS, form.rewardType)}</dd>
            </div>
          </dl>
          <p className={ui.cardText} style={{ marginTop: 12 }}>
            Next we compare the rewards you receive with your annual fee and any interest you pay.
          </p>
        </div>
      </aside>
    </section>
  );
}
