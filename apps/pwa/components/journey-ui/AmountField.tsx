import { useId } from "react";
import { MoneyInput } from "./MoneyInput";
import styles from "./journeyUi.module.css";

type Props = {
  label: string;
  /** Plain digits as held in journey state. */
  value: string;
  onChange: (raw: string) => void;
  error?: string;
  hint?: string;
  disabled?: boolean;
  /** Currency prefix; null for a plain quantity such as points or miles. */
  prefix?: string | null;
};

/** Labelled amount input with Indian digit grouping, an optional hint and an inline error. */
export function AmountField({ label, value, onChange, error, hint, disabled, prefix }: Props) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [hint ? hintId : "", error ? errorId : ""].filter(Boolean).join(" ") || undefined;

  return (
    <div className={styles.field}>
      <label className={styles.fieldLabel} htmlFor={id}>
        {label}
      </label>
      {hint ? (
        <span id={hintId} className={styles.rateNote}>
          {hint}
        </span>
      ) : null}
      <MoneyInput
        id={id}
        prefix={prefix}
        value={value}
        onChange={onChange}
        disabled={disabled}
        aria-invalid={error ? "true" : undefined}
        aria-describedby={describedBy}
      />
      {error ? (
        <p id={errorId} className={styles.errorText}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
