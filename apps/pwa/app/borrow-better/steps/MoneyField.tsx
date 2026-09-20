import { useId } from "react";
import styles from "../borrowBetter.module.css";

type MoneyFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  disabled?: boolean;
};

/** Rupee amount input. Text entry with a numeric keypad, so a blank entry stays blank rather than becoming 0. */
export function MoneyField({ label, value, onChange, error, hint, disabled }: MoneyFieldProps) {
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
      <div className={styles.inputWrap}>
        <span className={styles.inputPrefix} aria-hidden="true">
          {"₹"}
        </span>
        <input
          id={id}
          className={`${styles.input} ${styles.withPrefix}`}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={describedBy}
        />
      </div>
      {error ? (
        <p id={errorId} className={styles.errorText}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
