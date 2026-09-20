"use client";

import { useState } from "react";
import { CheckboxCardGroup, JourneyStepShell, RadioCardGroup } from "../../../components/journey-foundation";
import { FinancialInput } from "../../../components/QuickCheckUI";
import styles from "../rewards.module.css";
import {
  MAX_PRIORITIES,
  PERIOD_OPTIONS,
  PRIORITY_OPTIONS,
  effectiveRewardKnowledge,
  hasErrors,
  isRewardPeriod,
  validateStep3,
  type RewardKnowledge,
  type RewardsFormState,
  type SpendingPriority,
} from "../rewardsFormState";
import { ErrorSummary } from "./ErrorSummary";
import { RewardFinderDialog, type RewardFinderOutcome } from "./RewardFinderDialog";

const POINTS_MILES_KNOWLEDGE_OPTIONS = [
  { value: "amount", label: "The approximate ₹ value" },
  { value: "units_only", label: "Only the points or miles quantity" },
  { value: "unknown", label: "I don't know" },
] as const;

const NUMBER_INPUT_PROPS = { type: "number", inputMode: "decimal", min: "0", step: "any" } as const;

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <p id={id} className={styles.fieldError}>
      {message}
    </p>
  ) : null;
}

export function Step3PrioritiesInputs({
  form,
  onChange,
  onFinderOutcome,
  onSubmit,
  onBack,
  loading,
  apiError,
  hydrated,
  focusHeadingOnMount,
}: {
  form: RewardsFormState;
  onChange: (patch: Partial<RewardsFormState>) => void;
  onFinderOutcome: (outcome: RewardFinderOutcome) => void;
  onSubmit: () => void;
  onBack: () => void;
  loading: boolean;
  apiError: boolean;
  hydrated: boolean;
  focusHeadingOnMount: boolean;
}) {
  const [attempt, setAttempt] = useState(0);
  const [finderOpen, setFinderOpen] = useState(false);
  const errors = validateStep3(form);
  const showErrors = attempt > 0;
  const knowledge = effectiveRewardKnowledge(form);
  const isCashback = form.rewardType === "cashback";
  const isPointsOrMiles = form.rewardType === "points" || form.rewardType === "miles";
  const unitWord = form.rewardType === "miles" ? "miles" : "points";
  const atPriorityLimit = form.priorities.length >= MAX_PRIORITIES;

  function handleSubmit() {
    if (hasErrors(errors)) {
      setAttempt((count) => count + 1);
      return;
    }
    onSubmit();
  }

  function handleOutcome(outcome: RewardFinderOutcome) {
    setFinderOpen(false);
    onFinderOutcome(outcome);
  }

  const periodField = (
    <div className={styles.fieldGroup}>
      <label className="field">
        <span>Period</span>
        <select
          className="selectInput"
          value={form.rewardPeriod ?? ""}
          onChange={(event) => {
            const value = event.target.value;
            if (isRewardPeriod(value)) onChange({ rewardPeriod: value });
          }}
          aria-invalid={showErrors && errors.rewardPeriod ? true : undefined}
          aria-describedby={showErrors && errors.rewardPeriod ? "rewards-period-error" : undefined}
        >
          <option value="" disabled>
            Select a period
          </option>
          {PERIOD_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <FieldError id="rewards-period-error" message={showErrors ? errors.rewardPeriod : undefined} />
    </div>
  );

  return (
    <JourneyStepShell
      stepLabel="Step 3 of 5"
      title="Your priorities and inputs"
      onBack={onBack}
      backLabel="Back"
      focusHeadingOnMount={focusHeadingOnMount}
      actions={
        <button type="button" className={styles.primaryAction} onClick={handleSubmit} disabled={!hydrated || loading}>
          {loading ? "Checking…" : "Check my rewards"}
        </button>
      }
    >
      <ErrorSummary attempt={attempt} messages={Object.values(errors)} />

      {apiError ? (
        <div className={styles.errorSummary} role="alert">
          <p className={styles.errorTitle}>We couldn’t complete your rewards check.</p>
          <p className={styles.cardText}>Your answers are still here. Please try again.</p>
        </div>
      ) : null}

      <CheckboxCardGroup
        legend="What are your top spending priorities?"
        hint={`Select up to ${MAX_PRIORITIES} categories.`}
        name="rewards-priorities"
        options={PRIORITY_OPTIONS}
        values={form.priorities}
        maxSelections={MAX_PRIORITIES}
        onChange={(values) => onChange({ priorities: values as SpendingPriority[] })}
      />
      <p className={styles.limitNotice} aria-live="polite">
        {atPriorityLimit ? `You have chosen ${MAX_PRIORITIES}. Clear one to choose another.` : ""}
      </p>
      {showErrors && errors.priorities ? <p className={styles.fieldError}>{errors.priorities}</p> : null}

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Tell us a few details</h3>
        <p className={styles.sectionHint}>Estimated is fine.</p>

        <div className={styles.fieldGroup}>
          <FinancialInput
            label="Monthly card spend (₹)"
            {...NUMBER_INPUT_PROPS}
            value={form.monthlySpend}
            onChange={(event) => onChange({ monthlySpend: event.target.value })}
            aria-invalid={showErrors && errors.monthlySpend ? true : undefined}
            aria-describedby={showErrors && errors.monthlySpend ? "rewards-spend-error" : undefined}
          />
          <FieldError id="rewards-spend-error" message={showErrors ? errors.monthlySpend : undefined} />
        </div>

        <div className={styles.fieldGroup}>
          <FinancialInput
            label="Annual card fee (₹)"
            {...NUMBER_INPUT_PROPS}
            value={form.annualFee}
            onChange={(event) => onChange({ annualFee: event.target.value })}
            aria-invalid={showErrors && errors.annualFee ? true : undefined}
            aria-describedby={showErrors && errors.annualFee ? "rewards-fee-error" : undefined}
          />
          <FieldError id="rewards-fee-error" message={showErrors ? errors.annualFee : undefined} />
        </div>
      </div>

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>What rewards did you actually receive?</h3>

        {form.rewardType === "not_sure" ? (
          <p className={styles.note}>
            You said you’re not sure how your card rewards you, so we can’t estimate reward value yet. You can still continue.
          </p>
        ) : null}

        {isCashback && knowledge === "amount" ? (
          <>
            <div className={styles.fieldGroup}>
              <FinancialInput
                label="Cashback received (₹)"
                {...NUMBER_INPUT_PROPS}
                value={form.rewardAmount}
                onChange={(event) => onChange({ rewardAmount: event.target.value })}
                aria-invalid={showErrors && errors.rewardAmount ? true : undefined}
                aria-describedby={showErrors && errors.rewardAmount ? "rewards-amount-error" : undefined}
              />
              <FieldError id="rewards-amount-error" message={showErrors ? errors.rewardAmount : undefined} />
            </div>
            {periodField}
          </>
        ) : null}

        {isPointsOrMiles ? (
          <>
            <RadioCardGroup
              legend={`What do you know about the ${unitWord} you earned?`}
              name="rewards-reward-knowledge"
              options={POINTS_MILES_KNOWLEDGE_OPTIONS}
              value={form.rewardKnowledge}
              onChange={(value) => onChange({ rewardKnowledge: value as RewardKnowledge })}
            />
            {showErrors && errors.rewardKnowledge ? <p className={styles.fieldError}>{errors.rewardKnowledge}</p> : null}

            {knowledge === "amount" ? (
              <>
                <div className={styles.fieldGroup}>
                  <FinancialInput
                    label="Approximate reward value (₹)"
                    {...NUMBER_INPUT_PROPS}
                    value={form.rewardAmount}
                    onChange={(event) => onChange({ rewardAmount: event.target.value })}
                    aria-invalid={showErrors && errors.rewardAmount ? true : undefined}
                    aria-describedby={showErrors && errors.rewardAmount ? "rewards-amount-error" : undefined}
                  />
                  <FieldError id="rewards-amount-error" message={showErrors ? errors.rewardAmount : undefined} />
                </div>
                {periodField}
                <p className={styles.note}>
                  Use the value of rewards earned in this period, not your total accumulated balance or an older redemption.
                </p>
              </>
            ) : null}

            {knowledge === "units_only" ? (
              <>
                <div className={styles.fieldGroup}>
                  <FinancialInput
                    label={`${unitWord === "miles" ? "Miles" : "Points"} earned in this period`}
                    {...NUMBER_INPUT_PROPS}
                    value={form.rewardUnits}
                    onChange={(event) => onChange({ rewardUnits: event.target.value })}
                    aria-invalid={showErrors && errors.rewardUnits ? true : undefined}
                    aria-describedby={showErrors && errors.rewardUnits ? "rewards-units-error" : undefined}
                  />
                  <FieldError id="rewards-units-error" message={showErrors ? errors.rewardUnits : undefined} />
                </div>
                {periodField}
                <p className={styles.note}>We’ll show the quantity only. We won’t convert it to rupees without a value you provide.</p>
              </>
            ) : null}
          </>
        ) : null}

        {knowledge === "unknown" && form.rewardType !== "not_sure" ? (
          <>
            <p className={styles.note}>You’re continuing without a reward value, so the result will show that it’s unknown.</p>
            <button type="button" className={styles.textButton} onClick={() => onChange({ rewardKnowledge: null })}>
              I’ll enter it instead
            </button>
          </>
        ) : null}

        <button type="button" className={styles.helpLink} onClick={() => setFinderOpen(true)}>
          I don’t know — show me where to find it
        </button>
      </div>

      {finderOpen ? <RewardFinderDialog onClose={() => setFinderOpen(false)} onOutcome={handleOutcome} /> : null}
    </JourneyStepShell>
  );
}
