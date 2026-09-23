"use client";

import { useId } from "react";
import { IllustrativeExampleBanner } from "../../../components/journey-foundation";
import { ExampleBanner } from "../../../components/journey-ui/ExampleEntry";
import { StepHeading } from "../../../components/journey-ui/StepHeading";
import { ValueBars } from "../../../components/journey-ui/ValueBars";
import ui from "../../../components/journey-ui/journeyUi.module.css";
import styles from "../rewards.module.css";
import { selectRewardsSituation } from "../rewardsInsight";
import type { RewardsCheckResult } from "../rewardsApi";
import { PERIOD_PHRASE, PRIORITY_OPTIONS, type BalanceBehavior, type SpendingPriority } from "../rewardsFormState";
import { buildRewardBars, rupees } from "../rewardsSummary";

/**
 * The illustrative panel below is fixed synthetic content: the numbers are constants from the approved Rewards
 * journey and nothing in it reads what the customer entered. The separate "at a glance" card above it is drawn
 * from the active dataset (typed or sample).
 */
const EXAMPLE_TOTAL_SPEND = "₹25,000";

const EXAMPLE_SPEND_MIX = [
  { name: "Dining", share: 32, color: "#1f5fbf" },
  { name: "Travel", share: 18, color: "#6ba3e8" },
  { name: "Grocery", share: 22, color: "#1b8455" },
  { name: "Other", share: 28, color: "#9c9b91" },
] as const;

const CHART_TEXT_ALTERNATIVE = `Example monthly spend mix, total ${EXAMPLE_TOTAL_SPEND}: ${EXAMPLE_SPEND_MIX.map(
  (row) => `${row.name} ${row.share}%`,
).join(", ")}.`;

const PRIORITY_LABELS: Record<string, string> = Object.fromEntries(PRIORITY_OPTIONS.map((option) => [option.value, option.label]));

export function Step5IllustrativeExample({
  result,
  balanceBehavior,
  selectedPriorities,
  exampleApplied,
  exampleEdited,
  onBack,
  focusHeadingOnMount,
}: {
  result: RewardsCheckResult;
  balanceBehavior: BalanceBehavior | null;
  /** The customer's own priorities from the active dataset, not an echo from the backend. */
  selectedPriorities: readonly SpendingPriority[];
  exampleApplied: boolean;
  exampleEdited: boolean;
  onBack: () => void;
  focusHeadingOnMount: boolean;
}) {
  const headingId = useId();
  const finding = selectRewardsSituation(result, balanceBehavior);
  const netLabel = finding.netBeforeInterest !== null && !finding.isFinal ? "Net annual value (before interest)" : "Net annual value";
  const bars = buildRewardBars(result, true, { value: finding.netBeforeInterest, label: netLabel });
  const reason = finding.netBeforeInterest === null ? "We need a reward value to work out what your rewards are worth. We haven’t guessed one." : null;
  const priorities = selectedPriorities.map((priority) => PRIORITY_LABELS[priority] ?? priority);
  const period = result.reward_period ? PERIOD_PHRASE[result.reward_period] : null;

  return (
    <section aria-labelledby={headingId} className={ui.grid}>
      <div className={ui.colMain}>
        <div className={`${ui.section} ${ui.o1}`}>
          <button type="button" className={ui.backButton} onClick={onBack}>
            Back
          </button>
          <StepHeading
            id={headingId}
            stepLabel="Step 5 of 5"
            title="Your figures at a glance"
            supportingText={exampleApplied ? "Drawn from the sample figures you are using." : "Drawn from the figures you entered. Nothing has been connected."}
            focusOnMount={focusHeadingOnMount}
          />
          {exampleApplied ? <ExampleBanner edited={exampleEdited} /> : null}
        </div>

        <section className={`${ui.card} ${ui.o2}`} aria-labelledby="rewards-glance-heading">
          <h3 id="rewards-glance-heading" className={ui.cardHeading}>
            Rewards, fee and net value <span>(a year)</span>
          </h3>
          <ValueBars summary={bars.summary} rows={bars.rows} />
          {reason ? (
            <p className={ui.notice} style={{ marginTop: 14 }}>
              {reason}
            </p>
          ) : null}
          {priorities.length > 0 || period ? (
            <p className={ui.rateNote} style={{ marginTop: 12 }}>
              {priorities.length > 0 ? `Priorities: ${priorities.join(", ")}.` : ""}
              {priorities.length > 0 && period ? " " : ""}
              {period && result.reward_amount_per_period !== null && result.reward_amount_per_period !== undefined
                ? `Rewards entered: ${rupees(result.reward_amount_per_period)} ${period}.`
                : ""}
            </p>
          ) : null}
        </section>
      </div>

      <div className={ui.colSide}>
        <section className={`${ui.illustrative} ${ui.o3}`} aria-labelledby="rewards-connected-heading">
          <IllustrativeExampleBanner />
          <h3 id="rewards-connected-heading" className={ui.illustrativeTitle}>
            What connected data could add
          </h3>
          <p className={ui.cardText}>This fictional example shows what permissioned data could help analyse.</p>
          <p className={ui.notice}>This version does not connect to your bank data.</p>

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

          <ul className={ui.factList}>
            <li className={ui.fact}>
              <span className={ui.factDetail}>Possible fee drag</span>
              <span className={ui.factTitle}>Annual fee may not be fully offset by rewards.</span>
            </li>
            <li className={ui.fact}>
              <span className={ui.factDetail}>Dining’s your largest category</span>
              <span className={ui.factTitle}>You may earn more with a card that rewards dining.</span>
            </li>
            <li className={ui.fact}>
              <span className={ui.factDetail}>Interest may erase rewards</span>
              <span className={ui.factTitle}>If you carry a balance, interest costs can outweigh rewards.</span>
            </li>
          </ul>
        </section>

        {/* Intentional full-page navigation: a hard load of "/" clears transient in-memory journey state. Do not convert to next/link. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a className={`${ui.linkButton} ${ui.o4}`} href="/">
          Back to home
        </a>
      </div>
    </section>
  );
}
