import { useId, type ReactNode } from "react";
import styles from "./journeyFoundation.module.css";

export type ChoiceOption = {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
};

export type RadioCardGroupProps = {
  legend: ReactNode;
  /** Shared `name` for the native radio inputs. */
  name: string;
  options: readonly ChoiceOption[];
  /** Controlled value. `null` means nothing selected; the component never selects for the user. */
  value: string | null;
  onChange: (value: string) => void;
  hint?: string;
  /**
   * ID of the inline error element for this group. Pass it only while that element is rendered;
   * it is added to the fieldset's `aria-describedby` so assistive tech announces the error with the group.
   */
  errorId?: string;
};

export function RadioCardGroup({ legend, name, options, value, onChange, hint, errorId }: RadioCardGroupProps) {
  const hintId = useId();
  const describedBy = [hint ? hintId : null, errorId ?? null].filter(Boolean).join(" ") || undefined;

  return (
    <fieldset className={styles.choiceGroup} aria-describedby={describedBy}>
      <legend className={styles.choiceLegend}>{legend}</legend>
      {hint ? (
        <p id={hintId} className={styles.choiceHint}>
          {hint}
        </p>
      ) : null}
      <div className={styles.choiceList}>
        {options.map((option) => {
          const selected = value === option.value;
          const classes = [
            styles.choiceCard,
            selected ? styles.choiceCardSelected : "",
            option.disabled ? styles.choiceCardDisabled : "",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <label key={option.value} className={classes}>
              <input
                type="radio"
                className={styles.choiceInput}
                name={name}
                value={option.value}
                checked={selected}
                disabled={option.disabled}
                onChange={() => onChange(option.value)}
              />
              <span className={styles.choiceBody}>
                <span className={styles.choiceLabel}>{option.label}</span>
                {option.description ? <span className={styles.choiceDescription}>{option.description}</span> : null}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
