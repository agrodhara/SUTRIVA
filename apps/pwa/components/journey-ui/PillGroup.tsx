import type { ReactNode } from "react";
import styles from "./journeyUi.module.css";

type Props = {
  legend: ReactNode;
  name: string;
  options: readonly { value: string; label: string }[];
  value: string | null;
  onChange: (value: string) => void;
};

/** Short single-choice answers (Yes / No / Not sure) as compact pills. Native radios stay in the DOM. */
export function PillGroup({ legend, name, options, value, onChange }: Props) {
  return (
    <fieldset className={styles.pillGroup}>
      <legend className={styles.pillLegend}>{legend}</legend>
      <div className={styles.pillRow}>
        {options.map((option) => (
          <label key={option.value} className={styles.pill}>
            <input type="radio" name={name} value={option.value} checked={value === option.value} onChange={() => onChange(option.value)} />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
