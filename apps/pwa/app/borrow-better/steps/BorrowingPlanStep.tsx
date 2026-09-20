import { useEffect, useId, useRef, type FormEvent } from "react";
import { JourneyStepShell, RadioCardGroup } from "../../../components/journey-foundation";
import styles from "../borrowBetter.module.css";
import { formatRupeesNearest100, rateCopy } from "../format";
import {
  EMI_ENDING_OPTIONS,
  PURPOSE_OPTIONS,
  TENURE_OPTIONS,
  type BorrowJourneyForm,
  type EmiEndingAnswer,
  type FieldErrors,
  type LoanPurpose,
  type TenureMonths,
} from "../journeyState";
import { useEmiPreview } from "../useEmiPreview";
import { MoneyField } from "./MoneyField";

type Props = {
  form: BorrowJourneyForm;
  errors: FieldErrors;
  attempt: number;
  /** Policy rate shown before the backend has echoed one; the backend value replaces it once known. */
  configuredRatePercent: number;
  checking: boolean;
  checkFailed: boolean;
  disabled: boolean;
  focusHeadingOnMount: boolean;
  onLoanAmountChange: (value: string) => void;
  onTenureChange: (value: BorrowJourneyForm["tenureMonths"]) => void;
  onPurposeChange: (value: BorrowJourneyForm["loanPurpose"]) => void;
  onEmiEndingChange: (value: EmiEndingAnswer) => void;
  onBack: () => void;
  onContinue: () => void;
};

export function BorrowingPlanStep({
  form,
  errors,
  attempt,
  configuredRatePercent,
  checking,
  checkFailed,
  disabled,
  focusHeadingOnMount,
  onLoanAmountChange,
  onTenureChange,
  onPurposeChange,
  onEmiEndingChange,
  onBack,
  onContinue,
}: Props) {
  const ids = { tenure: useId(), purpose: useId() };
  const formRef = useRef<HTMLFormElement>(null);
  const { state: preview, retry } = useEmiPreview(form);

  useEffect(() => {
    if (attempt === 0) return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [attempt]);

  const ratePercent = preview.status === "ready" ? preview.ratePercent : configuredRatePercent;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!checking) onContinue();
  };

  return (
    <JourneyStepShell
      stepLabel="Step 3 of 5"
      title="Your borrowing plan"
      supportingText="Tell us about the loan you’re considering."
      onBack={onBack}
      focusHeadingOnMount={focusHeadingOnMount}
    >
      <form ref={formRef} className={styles.form} onSubmit={submit} noValidate>
        <MoneyField label="Loan amount" value={form.loanAmount} onChange={onLoanAmountChange} error={errors.loanAmount} disabled={disabled} />

        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor={ids.tenure}>
            Tenure
          </label>
          <select
            id={ids.tenure}
            className={styles.select}
            value={form.tenureMonths}
            onChange={(event) => onTenureChange(event.target.value as BorrowJourneyForm["tenureMonths"])}
            disabled={disabled}
            aria-invalid={errors.tenureMonths ? "true" : undefined}
          >
            <option value="">Select tenure</option>
            {TENURE_OPTIONS.map((months: TenureMonths) => (
              <option key={months} value={String(months)}>
                {months} months
              </option>
            ))}
          </select>
          {errors.tenureMonths ? <p className={styles.errorText}>{errors.tenureMonths}</p> : null}
        </div>

        {/* Read-only by design: policy-controlled, never an input. */}
        <p className={styles.rateNote} data-testid="rate-copy">
          {rateCopy(ratePercent)}
        </p>

        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor={ids.purpose}>
            Purpose<span className={styles.optionalTag}>(optional)</span>
          </label>
          <select id={ids.purpose} className={styles.select} value={form.loanPurpose} onChange={(event) => onPurposeChange(event.target.value as LoanPurpose | "")} disabled={disabled}>
            <option value="">Not specified</option>
            {PURPOSE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <RadioCardGroup
          legend={
            <>
              Will an existing EMI end within six months?<span className={styles.optionalTag}>(optional)</span>
            </>
          }
          name="borrow-emi-ending"
          options={EMI_ENDING_OPTIONS}
          value={form.emiEnding}
          onChange={(value) => onEmiEndingChange(value as EmiEndingAnswer)}
        />

        <div className={styles.emiCard} aria-live="polite">
          <p className={styles.emiLabel}>Estimated EMI</p>
          {preview.status === "ready" ? (
            <>
              <p className={styles.emiValue}>{formatRupeesNearest100(preview.emi)}</p>
              <p className={styles.emiUnit}>per month</p>
            </>
          ) : preview.status === "loading" ? (
            <p className={styles.emiHint}>Updating your estimate…</p>
          ) : preview.status === "error" ? (
            <div className={styles.errorPanel} role="alert">
              <p>We couldn’t update the estimated EMI. Your details are still here.</p>
              <button type="button" className={styles.secondaryButton} onClick={retry}>
                Try again
              </button>
            </div>
          ) : (
            <p className={styles.emiHint}>Enter a loan amount and choose a tenure to see the estimated EMI.</p>
          )}
        </div>

        {checkFailed ? (
          <div className={styles.errorPanel} role="alert">
            <p>We couldn’t complete your Borrow Better check. Your details are still here. Please try again.</p>
          </div>
        ) : null}

        <div className={styles.actions}>
          <button type="submit" className={styles.primaryButton} disabled={disabled || checking}>
            {checking ? "Checking…" : "Continue"}
          </button>
        </div>
      </form>
    </JourneyStepShell>
  );
}
