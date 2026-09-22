"use client";

import { useId, useState } from "react";
import { CheckboxCardGroup, RadioCardGroup } from "../../../components/journey-foundation";
import { AmountField } from "../../../components/journey-ui/AmountField";
import { ExampleBanner } from "../../../components/journey-ui/ExampleEntry";
import { formatRupeesExact } from "../../../components/journey-ui/indian";
import { StepHeading } from "../../../components/journey-ui/StepHeading";
import ui from "../../../components/journey-ui/journeyUi.module.css";
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
  exampleApplied,
  exampleEdited,
  onClearExample,
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
  exampleApplied: boolean;
  exampleEdited: boolean;
  onClearExample: () => void;
}) {
  const headingId = useId();
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
      <label className={ui.field}>
        <span className={ui.fieldLabel}>Period</span>
        <select
          className={ui.select}
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

  const spendNumber = Number(form.monthlySpend);
  const feeNumber = Number(form.annualFee);
  const rewardNumber = Number(form.rewardAmount);
  const shownAmount = (raw: string, value: number) => (raw.trim() === "" || !Number.isFinite(value) ? "Not entered yet" : formatRupeesExact(value));

  return (
    <section aria-labelledby={headingId} className={ui.grid}>
      <div className={ui.colMain}>
        <div className={`${ui.section} ${ui.o1}`}>
          <button type="button" className={ui.backButton} onClick={onBack}>
            Back
          </button>
          <StepHeading id={headingId} stepLabel="Step 3 of 5" title="Your priorities and inputs" focusOnMount={focusHeadingOnMount} />
          {exampleApplied ? <ExampleBanner edited={exampleEdited} onClear={onClearExample} /> : null}
        </div>

        <div className={`${ui.form} ${ui.o2}`}>
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
        errorId={showErrors && errors.priorities ? "rewards-priorities-error" : undefined}
        onChange={(values) => onChange({ priorities: values as SpendingPriority[] })}
      />
      <p className={styles.limitNotice} aria-live="polite">
        {atPriorityLimit ? `You have chosen ${MAX_PRIORITIES}. Clear one to choose another.` : ""}
      </p>
      {showErrors && errors.priorities ? (
        <p id="rewards-priorities-error" className={styles.fieldError}>
          {errors.priorities}
        </p>
      ) : null}

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Tell us a few details</h3>
        <p className={styles.sectionHint}>Estimated is fine.</p>

        <div className={styles.fieldGroup}>
          <AmountField label="Monthly card spend" value={form.monthlySpend} onChange={(raw) => onChange({ monthlySpend: raw })} error={showErrors ? errors.monthlySpend : undefined} />
        </div>

        <div className={styles.fieldGroup}>
          <AmountField label="Annual card fee" value={form.annualFee} onChange={(raw) => onChange({ annualFee: raw })} error={showErrors ? errors.annualFee : undefined} />
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
              <AmountField label="Cashback received" value={form.rewardAmount} onChange={(raw) => onChange({ rewardAmount: raw })} error={showErrors ? errors.rewardAmount : undefined} />
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
              errorId={showErrors && errors.rewardKnowledge ? "rewards-knowledge-error" : undefined}
              onChange={(value) => onChange({ rewardKnowledge: value as RewardKnowledge })}
            />
            {showErrors && errors.rewardKnowledge ? (
              <p id="rewards-knowledge-error" className={styles.fieldError}>
                {errors.rewardKnowledge}
              </p>
            ) : null}

            {knowledge === "amount" ? (
              <>
                <div className={styles.fieldGroup}>
                  <AmountField label="Approximate reward value" value={form.rewardAmount} onChange={(raw) => onChange({ rewardAmount: raw })} error={showErrors ? errors.rewardAmount : undefined} />
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
                  <AmountField label={`${unitWord === "miles" ? "Miles" : "Points"} earned in this period`} value={form.rewardUnits} onChange={(raw) => onChange({ rewardUnits: raw })} error={showErrors ? errors.rewardUnits : undefined} prefix={null} />
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
        </div>

        <div className={`${ui.actions} ${ui.o3}`}>
          <button type="button" className={ui.primaryButton} onClick={handleSubmit} disabled={!hydrated || loading}>
            {loading ? "Checking…" : "Check my rewards"}
          </button>
        </div>
      </div>

      <aside className={`${ui.colSide} ${ui.desktopOnly}`} aria-label="Your figures so far">
        <div className={ui.card}>
          <h3 className={ui.cardHeading}>Your figures so far</h3>
          <dl className={ui.summaryRows}>
            <div className={ui.summaryRow}>
              <dt>Card spend a month</dt>
              <dd>{shownAmount(form.monthlySpend, spendNumber)}</dd>
            </div>
            <div className={ui.summaryRow}>
              <dt>Fee a year</dt>
              <dd>{shownAmount(form.annualFee, feeNumber)}</dd>
            </div>
            <div className={ui.summaryRow}>
              <dt>Rewards received</dt>
              <dd>{shownAmount(form.rewardAmount, rewardNumber)}</dd>
            </div>
          </dl>
          <p className={ui.cardText} style={{ marginTop: 12 }}>
            We never guess a missing figure. If something is not known, the result says so.
          </p>
        </div>
      </aside>
    </section>
  );
}
