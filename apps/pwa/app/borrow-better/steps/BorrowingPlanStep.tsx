import { useEffect, useId, useRef, type FormEvent } from "react";
import { AmountField } from "../../../components/journey-ui/AmountField";
import { ExampleBanner } from "../../../components/journey-ui/ExampleEntry";
import { formatRupeesExact } from "../../../components/journey-ui/indian";
import { PillGroup } from "../../../components/journey-ui/PillGroup";
import { StepHeading } from "../../../components/journey-ui/StepHeading";
import ui from "../../../components/journey-ui/journeyUi.module.css";
import { StackedBar } from "../../../components/journey-ui/StackedBar";
import { buildMonthlyPicture, leftAfterCommitments } from "../borrowSummary";
import { rateCopy } from "../format";
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
  exampleApplied: boolean;
  exampleEdited: boolean;
  onClearExample: () => void;
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
  exampleApplied,
  exampleEdited,
  onClearExample,
  onLoanAmountChange,
  onTenureChange,
  onPurposeChange,
  onEmiEndingChange,
  onBack,
  onContinue,
}: Props) {
  const headingId = useId();
  const ids = { tenure: useId(), purpose: useId() };
  const formRef = useRef<HTMLFormElement>(null);
  const { state: preview, retry } = useEmiPreview(form);
  const left = leftAfterCommitments(form);
  const picture = buildMonthlyPicture(form);

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
    <section aria-labelledby={headingId}>
      <form ref={formRef} className={ui.grid} onSubmit={submit} noValidate>
        <div className={ui.colMain}>
          <div className={`${ui.section} ${ui.o1}`}>
            <button type="button" className={ui.backButton} onClick={onBack}>
              Back
            </button>
            <StepHeading
              id={headingId}
              stepLabel="Step 3 of 5"
              title="Your borrowing plan"
              supportingText="Tell us about the loan you’re considering."
              focusOnMount={focusHeadingOnMount}
            />
            {exampleApplied ? <ExampleBanner edited={exampleEdited} onClear={onClearExample} /> : null}
          </div>

          <div className={`${ui.form} ${ui.o2}`}>
            <AmountField label="Loan amount" value={form.loanAmount} onChange={onLoanAmountChange} error={errors.loanAmount} disabled={disabled} />

            <div className={ui.field}>
              <label className={ui.fieldLabel} htmlFor={ids.tenure}>
                Tenure
              </label>
              <select
                id={ids.tenure}
                className={ui.select}
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
              {errors.tenureMonths ? <p className={ui.errorText}>{errors.tenureMonths}</p> : null}
            </div>

            {/* Read-only by design: policy-controlled, never an input. */}
            <p className={ui.rateNote} data-testid="rate-copy">
              {rateCopy(ratePercent)}
            </p>

            <div className={ui.field}>
              <label className={ui.fieldLabel} htmlFor={ids.purpose}>
                Purpose<span className={ui.optionalTag}>(optional)</span>
              </label>
              <select id={ids.purpose} className={ui.select} value={form.loanPurpose} onChange={(event) => onPurposeChange(event.target.value as LoanPurpose | "")} disabled={disabled}>
                <option value="">Not specified</option>
                {PURPOSE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <PillGroup
              legend={
                <>
                  Will an existing EMI end within six months?<span className={ui.optionalTag}>(optional)</span>
                </>
              }
              name="borrow-emi-ending"
              options={EMI_ENDING_OPTIONS}
              value={form.emiEnding}
              onChange={(value) => onEmiEndingChange(value as EmiEndingAnswer)}
            />
          </div>
        </div>

        <div className={ui.colSide}>
          <div className={`${ui.darkPanel} ${ui.o3}`} aria-live="polite">
            <p className={ui.darkLabel}>Estimated EMI</p>
            {preview.status === "ready" ? (
              <>
                <p className={ui.darkValue}>
                  {formatRupeesExact(preview.emi)} <span className={ui.darkUnit}>per month</span>
                </p>
                {left !== null ? <p className={ui.darkNote}>Before this EMI you have {formatRupeesExact(left)} left after commitments and essentials.</p> : null}
              </>
            ) : preview.status === "loading" ? (
              <p className={ui.darkNote}>Updating your estimate…</p>
            ) : preview.status === "error" ? (
              <div className={ui.errorPanel} role="alert">
                <p>We couldn’t update the estimated EMI. Your details are still here.</p>
                <button type="button" className={ui.secondaryButton} onClick={retry}>
                  Try again
                </button>
              </div>
            ) : (
              <p className={ui.darkNote}>Enter a loan amount and choose a tenure to see the estimated EMI.</p>
            )}
          </div>
          {picture ? (
            <div className={`${ui.card} ${ui.desktopOnly}`}>
              <h3 className={ui.cardHeading}>Your monthly picture</h3>
              <StackedBar summary={picture.summary} segments={picture.segments} total={picture.total} totalLabel="Monthly take-home income" totalDisplay={picture.totalDisplay} />
            </div>
          ) : null}
        </div>

        <div className={ui.colMain}>
          <div className={`${ui.section} ${ui.o4}`}>
          {checkFailed ? (
            <div className={ui.errorPanel} role="alert">
              <p>We couldn’t complete your Borrow Better check. Your details are still here. Please try again.</p>
            </div>
          ) : null}
          <div className={ui.actions}>
            <button type="submit" className={ui.primaryButton} disabled={disabled || checking}>
              {checking ? "Checking…" : "Continue"}
            </button>
          </div>
          </div>
        </div>
      </form>
    </section>
  );
}
