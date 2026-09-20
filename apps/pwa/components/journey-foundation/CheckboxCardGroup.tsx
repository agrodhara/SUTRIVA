import { useId, type ReactNode } from "react";
import type { ChoiceOption } from "./RadioCardGroup";
import styles from "./journeyFoundation.module.css";

export type CheckboxCardGroupProps = {
  legend: ReactNode;
  name: string;
  options: readonly ChoiceOption[];
  /** Controlled selection. An empty array means nothing selected; the component never selects for the user. */
  values: readonly string[];
  onChange: (values: string[]) => void;
  /**
   * Optional cap on selections. Once reached, unselected options are disabled until one is cleared.
   * No default: the journey decides whether a cap applies and what it is.
   */
  maxSelections?: number;
  hint?: string;
  /**
   * ID of the inline error element for this group. Pass it only while that element is rendered;
   * it is added to the fieldset's `aria-describedby` so assistive tech announces the error with the group.
   */
  errorId?: string;
};

export function CheckboxCardGroup({ legend, name, options, values, onChange, maxSelections, hint, errorId }: CheckboxCardGroupProps) {
  const hintId = useId();
  const describedBy = [hint ? hintId : null, errorId ?? null].filter(Boolean).join(" ") || undefined;
  const atLimit = maxSelections !== undefined && values.length >= maxSelections;

  function toggle(optionValue: string, checked: boolean) {
    if (!checked) {
      onChange(values.filter((value) => value !== optionValue));
      return;
    }
    if (values.includes(optionValue) || atLimit) return;
    onChange([...values, optionValue]);
  }

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
          const selected = values.includes(option.value);
          const disabled = option.disabled || (atLimit && !selected);
          const classes = [
            styles.choiceCard,
            selected ? styles.choiceCardSelected : "",
            disabled ? styles.choiceCardDisabled : "",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <label key={option.value} className={classes}>
              <input
                type="checkbox"
                className={styles.choiceInput}
                name={name}
                value={option.value}
                checked={selected}
                disabled={disabled}
                onChange={(event) => toggle(option.value, event.target.checked)}
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
