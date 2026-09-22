import styles from "./journeyUi.module.css";
import type { StackTone } from "./StackedBar";

export type ValueBarRow = {
  label: string;
  /** Rupees. null means the figure cannot be calculated yet: no bar is drawn and the text says so. */
  value: number | null;
  display: string;
  tone: StackTone;
};

type Props = {
  /** Short accessible description of the comparison. */
  summary: string;
  rows: readonly ValueBarRow[];
};

const TONE_CLASS: Partial<Record<StackTone, string>> = {
  rewards: styles.toneRewards,
  fee: styles.toneFee,
  interest: styles.toneInterest,
  net: styles.toneNet,
  left: styles.toneLeft,
  emi: styles.toneEmi,
};

/**
 * Labelled horizontal bars on one shared scale (the largest absolute value), so a bar is only ever compared
 * with the others on the same screen. Each row prints its own value, so the bars are never the only carrier.
 */
export function ValueBars({ summary, rows }: Props) {
  const scale = Math.max(1, ...rows.map((row) => (row.value === null ? 0 : Math.abs(row.value))));
  return (
    <figure className={styles.valueBars}>
      <figcaption className={styles.srOnly}>{summary}</figcaption>
      {rows.map((row) => (
        <div key={row.label} className={styles.valueRow}>
          <div className={styles.valueRowHead}>
            <span className={styles.legendLabel}>{row.label}</span>
            <span className={row.value === null ? styles.valueMuted : styles.legendValue}>{row.display}</span>
          </div>
          <div className={styles.valueTrack} aria-hidden="true">
            {row.value !== null && row.value !== 0 ? (
              <span
                className={`${styles.valueFill} ${row.value < 0 ? styles.toneEmi : (TONE_CLASS[row.tone] ?? "")}`}
                style={{ width: `${Math.max(2, (Math.abs(row.value) / scale) * 100)}%` }}
              />
            ) : null}
          </div>
        </div>
      ))}
    </figure>
  );
}
