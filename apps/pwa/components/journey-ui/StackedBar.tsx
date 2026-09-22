import styles from "./journeyUi.module.css";

export type StackTone = "essentials" | "existing" | "emi" | "left" | "rewards" | "fee" | "interest" | "net";

export type StackSegment = {
  label: string;
  /** Rupees. Segments with a zero or negative value are listed in the legend but draw no bar. */
  value: number;
  tone: StackTone;
  /** Legend text for the value. Defaults to a plain rupee figure from the caller. */
  display: string;
};

type Props = {
  /** Short accessible description of what the bar shows. */
  summary: string;
  segments: readonly StackSegment[];
  /** Total that the bar represents. Percentages in the legend are each segment's share of it. */
  total: number;
  totalLabel: string;
  totalDisplay: string;
};

const TONE_CLASS: Record<StackTone, string> = {
  essentials: styles.toneEssentials,
  existing: styles.toneExisting,
  emi: styles.toneEmi,
  left: styles.toneLeft,
  rewards: styles.toneRewards,
  fee: styles.toneFee,
  interest: styles.toneInterest,
  net: styles.toneNet,
};

const percentOf = (value: number, total: number): string => {
  if (total <= 0 || value <= 0) return "0%";
  const percent = (value / total) * 100;
  return `${percent >= 10 ? Math.round(percent) : Math.round(percent * 10) / 10}%`;
};

/**
 * A labelled bar: every segment has a name, a rupee value and its share of the total in the legend, so the
 * chart never relies on colour or unexplained bars. The drawn bar is decorative; the legend carries the data.
 */
export function StackedBar({ summary, segments, total, totalLabel, totalDisplay }: Props) {
  const drawn = segments.filter((segment) => segment.value > 0);
  return (
    <figure className={styles.stack}>
      <figcaption className={styles.srOnly}>{summary}</figcaption>
      <div className={styles.stackBar} aria-hidden="true">
        {drawn.map((segment) => (
          <span
            key={segment.label}
            className={`${styles.stackSegment} ${TONE_CLASS[segment.tone]}`}
            style={{ flexGrow: segment.value, flexBasis: 0 }}
          />
        ))}
      </div>
      <ul className={styles.legend}>
        {segments.map((segment) => (
          <li key={segment.label} className={styles.legendRow}>
            <span className={`${styles.swatch} ${TONE_CLASS[segment.tone]}`} aria-hidden="true" />
            <span className={styles.legendLabel}>{segment.label}</span>
            <span className={styles.legendValue}>{segment.display}</span>
            <span className={styles.legendShare}>{percentOf(segment.value, total)}</span>
          </li>
        ))}
      </ul>
      <p className={styles.stackTotal}>
        <span>{totalLabel}</span>
        <strong>{totalDisplay}</strong>
      </p>
    </figure>
  );
}
