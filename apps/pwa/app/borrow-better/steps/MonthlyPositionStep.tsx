import { useEffect, useRef, type FormEvent } from "react";
import { JourneyStepShell, RadioCardGroup } from "../../../components/journey-foundation";
import styles from "../borrowBetter.module.css";
import {
  MONTH_END_OPTIONS,
  type BorrowJourneyForm,
  type FieldErrors,
  type MonthEndPosition,
  type PositionFieldKey,
} from "../journeyState";
import { MoneyField } from "./MoneyField";

type Props = {
  form: BorrowJourneyForm;
  /** Errors are shown only after the user has tried to continue. */
  errors: FieldErrors;
  /** Increments on every failed continue attempt so focus can move to the first problem. */
  attempt: number;
  disabled: boolean;
  focusHeadingOnMount: boolean;
  onMoneyChange: (key: PositionFieldKey, value: string) => void;
  onMonthEndChange: (value: MonthEndPosition) => void;
  onContinue: () => void;
};

export function MonthlyPositionStep({ form, errors, attempt, disabled, focusHeadingOnMount, onMoneyChange, onMonthEndChange, onContinue }: Props) {
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

  return (
    <JourneyStepShell
      stepLabel="Step 2 of 5"
      title="Your monthly position"
      supportingText="A few key details give us a clearer picture. This is not a full budget."
      focusHeadingOnMount={focusHeadingOnMount}
    >
      <form ref={formRef} className={styles.form} onSubmit={submit} noValidate>
        <MoneyField label="Monthly take-home income" value={form.monthlyIncome} onChange={(v) => onMoneyChange("monthlyIncome", v)} error={errors.monthlyIncome} disabled={disabled} />
        <MoneyField label="Existing loan and card payments" value={form.existingPayments} onChange={(v) => onMoneyChange("existingPayments", v)} error={errors.existingPayments} hint="Monthly total. Enter 0 if you have none." disabled={disabled} />

        <fieldset className={styles.groupBox}>
          <legend className={styles.groupLegend}>Essential monthly expenses</legend>
          <MoneyField label="Housing" value={form.housing} onChange={(v) => onMoneyChange("housing", v)} error={errors.housing} disabled={disabled} />
          <MoneyField label="Household and utilities" value={form.household} onChange={(v) => onMoneyChange("household", v)} error={errors.household} disabled={disabled} />
          <MoneyField label="Dependants and education" value={form.dependants} onChange={(v) => onMoneyChange("dependants", v)} error={errors.dependants} disabled={disabled} />
          <MoneyField label="Recurring medical or insurance" value={form.medical} onChange={(v) => onMoneyChange("medical", v)} error={errors.medical} disabled={disabled} />
        </fieldset>

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
            <p id="borrow-month-end-error" className={styles.errorText} role="alert">
              {errors.monthEndPosition}
            </p>
          ) : null}
        </div>

        <div className={styles.actions}>
          <button type="submit" className={styles.primaryButton} disabled={disabled}>
            Continue
          </button>
        </div>
      </form>
    </JourneyStepShell>
  );
}
