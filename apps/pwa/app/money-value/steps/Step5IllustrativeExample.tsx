"use client";

import { IllustrativeExampleBanner, JourneyStepShell } from "../../../components/journey-foundation";
import styles from "../rewards.module.css";

/**
 * A fixed synthetic example. It takes no user data by design: the props are navigation only, and the
 * numbers below are constants from the approved Rewards journey. Nothing here reads Step 2 or Step 3 state.
 */
const EXAMPLE_TOTAL_SPEND = "₹25,000";

const EXAMPLE_SPEND_MIX = [
  { name: "Dining", share: 32, color: "#1f5fbf" },
  { name: "Travel", share: 18, color: "#6ba3e8" },
  { name: "Grocery", share: 22, color: "#16794f" },
  { name: "Other", share: 28, color: "#9c9b91" },
] as const;

const CHART_TEXT_ALTERNATIVE = `Example monthly spend mix, total ${EXAMPLE_TOTAL_SPEND}: ${EXAMPLE_SPEND_MIX.map(
  (row) => `${row.name} ${row.share}%`,
).join(", ")}.`;

export function Step5IllustrativeExample({ onBack, focusHeadingOnMount }: { onBack: () => void; focusHeadingOnMount: boolean }) {
  return (
    <JourneyStepShell
      stepLabel="Step 5 of 5"
      title="Here is what Sutriva could reveal from a statement."
      supportingText="This synthetic example shows what Sutriva may reveal after you separately choose to connect your data."
      onBack={onBack}
      backLabel="Back"
      focusHeadingOnMount={focusHeadingOnMount}
      actions={
        <a className={styles.homeLink} href="/">
          Back to home
        </a>
      }
    >
      <IllustrativeExampleBanner />

      <figure className={styles.exampleFigure}>
        <figcaption>Example monthly spend mix</figcaption>
        <div className={styles.donutWrap}>
          <div className={styles.donut} role="img" aria-label={CHART_TEXT_ALTERNATIVE} />
          <div className={styles.donutHole} aria-hidden="true">
            <span className={styles.donutTotal}>{EXAMPLE_TOTAL_SPEND}</span>
            <span className={styles.donutTotalLabel}>Total spend</span>
          </div>
        </div>
        <ul className={styles.legend}>
          {EXAMPLE_SPEND_MIX.map((row) => (
            <li key={row.name} className={styles.legendRow}>
              <span className={styles.legendName}>
                <span className={styles.swatch} style={{ background: row.color }} aria-hidden="true" />
                {row.name}
              </span>
              <strong>{row.share}%</strong>
            </li>
          ))}
        </ul>
      </figure>

      <div className={styles.cardStack}>
        <section className={styles.exampleCard}>
          <h3 className={styles.exampleCardTitle}>Possible fee drag</h3>
          <p className={styles.cardText}>Annual fee may not be fully offset by rewards.</p>
        </section>
        <section className={styles.exampleCard}>
          <h3 className={styles.exampleCardTitle}>Dining’s your largest category</h3>
          <p className={styles.cardText}>You may earn more with a card that rewards dining.</p>
        </section>
        <section className={styles.exampleCard}>
          <h3 className={styles.exampleCardTitle}>Interest may erase rewards</h3>
          <p className={styles.cardText}>If you carry a balance, interest costs can outweigh rewards.</p>
        </section>
      </div>
    </JourneyStepShell>
  );
}
