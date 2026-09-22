import { useEffect, useId, useRef, type FormEvent } from "react";
import { RadioCardGroup } from "../../../components/journey-foundation";
import { AmountField } from "../../../components/journey-ui/AmountField";
import { ExampleEntry } from "../../../components/journey-ui/ExampleEntry";
import { formatRupeesExact } from "../../../components/journey-ui/indian";
import { StackedBar } from "../../../components/journey-ui/StackedBar";
import { StepHeading } from "../../../components/journey-ui/StepHeading";
import ui from "../../../components/journey-ui/journeyUi.module.css";
import { BORROW_EXAMPLE_PREVIEW } from "../borrowExample";
import { buildMonthlyPicture, essentialsTotal, leftAfterCommitments } from "../borrowSummary";
import {
  MONTH_END_OPTIONS,
  type BorrowJourneyForm,
  type FieldErrors,
  type MonthEndPosition,
  type PositionFieldKey,
} from "../journeyState";

type Props = {
  form: BorrowJourneyForm;
  /** Errors are shown only after the user has tried to continue. */
  errors: FieldErrors;
  /** Increments on every failed continue attempt so focus can move to the first problem. */
  attempt: number;
  disabled: boolean;
  focusHeadingOnMount: boolean;
  exampleApplied: boolean;
  exampleEdited: boolean;
  onApplyExample: () => void;
  onClearExample: () => void;
  onMoneyChange: (key: PositionFieldKey, value: string) => void;
  onMonthEndChange: (value: MonthEndPosition) => void;
  onContinue: () => void;
};

export function MonthlyPositionStep({
  form,
  errors,
  attempt,
  disabled,
  focusHeadingOnMount,
  exampleApplied,
  exampleEdited,
  onApplyExample,
  onClearExample,
  onMoneyChange,
  onMonthEndChange,
  onContinue,
}: Props) {
  const headingId = useId();
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (attempt === 0) return;
    const first = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"], [data-invalid-group="true"] input');
    first?.focus();
  }, [attempt]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onContinue();
  };

  const essentials = essentialsTotal(form);
  const left = leftAfterCommitments(form);
  const picture = buildMonthlyPicture(form);

  return (
    <section aria-labelledby={headingId} className={ui.grid}>
      <div className={ui.colMain}>
        <div className={`${ui.section} ${ui.o1}`}>
          <StepHeading
            id={headingId}
            stepLabel="Step 2 of 5"
            title="Your monthly position"
            supportingText="A few key details give us a clearer picture. This is not a full budget."
            focusOnMount={focusHeadingOnMount}
          />
          <ExampleEntry
            key={exampleApplied ? "applied" : "manual"}
            applied={exampleApplied}
            edited={exampleEdited}
            previewRows={BORROW_EXAMPLE_PREVIEW}
            onApply={onApplyExample}
            onClear={onClearExample}
            disabled={disabled}
          />
        </div>

        <form ref={formRef} className={`${ui.form} ${ui.o2}`} onSubmit={submit} noValidate>
          <AmountField label="Monthly take-home income" value={form.monthlyIncome} onChange={(v) => onMoneyChange("monthlyIncome", v)} error={errors.monthlyIncome} disabled={disabled} />
          <AmountField label="Existing loan and card payments" value={form.existingPayments} onChange={(v) => onMoneyChange("existingPayments", v)} error={errors.existingPayments} hint="Monthly total. Enter 0 if you have none." disabled={disabled} />

          <fieldset className={ui.groupBox}>
            <legend className={ui.groupLegend}>Essential monthly expenses</legend>
            <div className={ui.groupGrid}>
              <AmountField label="Housing" value={form.housing} onChange={(v) => onMoneyChange("housing", v)} error={errors.housing} disabled={disabled} />
              <AmountField label="Household and utilities" value={form.household} onChange={(v) => onMoneyChange("household", v)} error={errors.household} disabled={disabled} />
              <AmountField label="Dependants and education" value={form.dependants} onChange={(v) => onMoneyChange("dependants", v)} error={errors.dependants} disabled={disabled} />
              <AmountField label="Recurring medical or insurance" value={form.medical} onChange={(v) => onMoneyChange("medical", v)} error={errors.medical} disabled={disabled} />
            </div>
            {essentials !== null ? (
              <dl className={ui.summaryRows} style={{ marginTop: 12 }}>
                <div className={ui.summaryRow}>
                  <dt>Total essentials</dt>
                  <dd>{formatRupeesExact(essentials)}</dd>
                </div>
              </dl>
            ) : null}
          </fieldset>

          {left !== null ? (
            <p className={left < 0 ? `${ui.leftStrip} ${ui.leftStripNegative}` : ui.leftStrip} aria-live="polite">
              <span>Left after commitments &amp; essentials</span>
              <span className={ui.leftStripValue}>{formatRupeesExact(left)}</span>
            </p>
          ) : null}

          <div data-invalid-group={errors.monthEndPosition ? "true" : undefined}>
            <RadioCardGroup
              legend="Usual month-end position"
              name="borrow-month-end-position"
              options={MONTH_END_OPTIONS}
              value={form.monthEndPosition}
              errorId={errors.monthEndPosition ? "borrow-month-end-error" : undefined}
              onChange={(value) => onMonthEndChange(value as MonthEndPosition)}
            />
            {errors.monthEndPosition ? (
              <p id="borrow-month-end-error" className={ui.errorText} role="alert">
                {errors.monthEndPosition}
              </p>
            ) : null}
          </div>

          <div className={ui.actions}>
            <button type="submit" className={ui.primaryButton} disabled={disabled}>
              Continue
            </button>
          </div>
        </form>
      </div>

      <aside className={`${ui.colSide} ${ui.desktopOnly}`} aria-label="Your monthly picture">
        <div className={ui.card}>
          <h3 className={ui.cardHeading}>Your monthly picture</h3>
          {picture ? (
            <StackedBar summary={picture.summary} segments={picture.segments} total={picture.total} totalLabel="Monthly take-home income" totalDisplay={picture.totalDisplay} />
          ) : (
            <p className={ui.cardText}>Enter your income, payments and essentials to see how your month adds up.</p>
          )}
        </div>
      </aside>
    </section>
  );
}
