"use client";

import { JourneyStepShell } from "../../../components/journey-foundation";
import styles from "../rewards.module.css";
import type { MainPressureCode, RewardsCheckResult } from "../rewardsApi";
import { PERIOD_PHRASE, PRIORITY_OPTIONS } from "../rewardsFormState";

const RUPEES = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});
const QUANTITY = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

const MAIN_PRESSURE_COPY: Record<MainPressureCode, string> = {
  REWARD_VALUE_UNKNOWN: "We don’t have a reward value yet, so we can’t tell whether your rewards cover the annual fee.",
  INTEREST_EFFECT_UNKNOWN: "Interest impact is unknown, so we can’t show your net value after interest.",
  FEE_EXCEEDS_REWARDS: "Your annual fee is higher than the estimated annual rewards.",
  FEE_REDUCES_VALUE: "Your annual fee reduces the value you get from your rewards.",
  NO_FEE_PRESSURE: "No annual-fee pressure identified from what you entered.",
};

const NUDGE_COPY = "Compare the rewards you actually receive with the annual fee and any interest you pay.";

const PRIORITY_LABELS: Record<string, string> = Object.fromEntries(PRIORITY_OPTIONS.map((option) => [option.value, option.label]));

function rewardBasisLine(result: RewardsCheckResult): string | null {
  if (!result.reward_period) return null;
  const period = PERIOD_PHRASE[result.reward_period];
  if (result.reward_amount_per_period !== null && result.reward_amount_per_period !== undefined) {
    const noun = result.reward_type === "cashback" ? "cashback" : "reward value";
    return `Based on ${RUPEES.format(result.reward_amount_per_period)} ${noun} ${period}.`;
  }
  if (result.reward_units_per_period !== null && result.reward_units_per_period !== undefined) {
    const unit = result.reward_type === "miles" ? "miles" : "points";
    return `Based on ${QUANTITY.format(result.reward_units_per_period)} ${unit} ${period}.`;
  }
  return null;
}

function interestLine(result: RewardsCheckResult): string {
  if (result.interest_input_basis === "no_balance") return "No interest cost is included because you pay the statement balance in full.";
  if (result.interest_input_basis === "known" && result.estimated_annual_interest_cost !== null) {
    return `Estimated annual interest cost included: ${RUPEES.format(result.estimated_annual_interest_cost)}.`;
  }
  return "Interest impact is unknown. No interest cost has been assumed.";
}

export function Step4RewardsCheck({
  result,
  onBack,
  onNext,
  focusHeadingOnMount,
}: {
  result: RewardsCheckResult;
  onBack: () => void;
  onNext: () => void;
  focusHeadingOnMount: boolean;
}) {
  const rewardsKnown = result.estimated_annual_rewards !== null;
  const netKnown = result.estimated_net_annual_value !== null;
  const unitWord = result.reward_type === "miles" ? "miles" : "points";
  const basisLine = rewardBasisLine(result);
  const priorities = result.spending_priorities ?? [];

  return (
    <JourneyStepShell
      stepLabel="Step 4 of 5"
      title="Your Rewards Check"
      supportingText="Based on the information you provided. This is an indicative estimate."
      onBack={onBack}
      backLabel="Back"
      focusHeadingOnMount={focusHeadingOnMount}
      actions={
        <button type="button" className={styles.primaryAction} onClick={onNext}>
          See what connected intelligence could reveal <span aria-hidden="true">→</span>
        </button>
      }
    >
      <div className={styles.cardStack}>
        <section className={`${styles.card} ${styles.cardEconomics}`} aria-labelledby="rewards-economics-title">
          <h3 id="rewards-economics-title" className={styles.cardTitle}>
            Card economics
          </h3>
          <p className={styles.cardText}>Based on your inputs.</p>
          <dl className={styles.metricList}>
            <div className={styles.metric}>
              <dt className={styles.metricLabel}>Estimated annual rewards</dt>
              <dd className={rewardsKnown ? styles.metricValue : `${styles.metricValue} ${styles.metricValueMuted}`}>
                {rewardsKnown ? RUPEES.format(result.estimated_annual_rewards as number) : "Unknown"}
              </dd>
            </div>
            <div className={styles.metric}>
              <dt className={styles.metricLabel}>Annual fee</dt>
              <dd className={styles.metricValue}>{RUPEES.format(result.annual_card_fee)}</dd>
            </div>
            <div className={styles.metric}>
              <dt className={styles.metricLabel}>Estimated net annual value</dt>
              <dd
                className={
                  netKnown
                    ? `${styles.metricValue} ${(result.estimated_net_annual_value as number) < 0 ? styles.metricNegative : ""}`
                    : `${styles.metricValue} ${styles.metricValueMuted}`
                }
              >
                {netKnown ? RUPEES.format(result.estimated_net_annual_value as number) : "Not available yet"}
              </dd>
            </div>
          </dl>

          {basisLine ? <p className={styles.cardText}>{basisLine}</p> : null}
          {!rewardsKnown && result.annualized_reward_units !== null && result.annualized_reward_units !== undefined ? (
            <p className={styles.cardText}>
              Annualised quantity: {QUANTITY.format(result.annualized_reward_units)} {unitWord}. We haven’t converted this to rupees.
            </p>
          ) : null}
          {!rewardsKnown && (result.annualized_reward_units === null || result.annualized_reward_units === undefined) ? (
            <p className={styles.cardText}>Reward value is unknown, so we can’t estimate annual rewards.</p>
          ) : null}
          <p className={styles.cardText}>{interestLine(result)}</p>
          {!netKnown ? (
            <p className={styles.cardText}>
              {rewardsKnown
                ? "A net value after interest can’t be shown while the interest impact is unknown."
                : "A net value needs a reward value."}
            </p>
          ) : null}
        </section>

        {result.spending_fit_status === "CATEGORY_FIT_UNDETERMINED" && priorities.length > 0 ? (
          <section className={styles.card} aria-labelledby="rewards-priorities-title">
            <h3 id="rewards-priorities-title" className={styles.cardTitle}>
              Your spending priorities
            </h3>
            <ul className={styles.chipList}>
              {priorities.map((priority) => (
                <li key={priority} className={styles.chip}>
                  {PRIORITY_LABELS[priority] ?? priority}
                </li>
              ))}
            </ul>
            <p className={styles.cardText}>
              We can’t tell from the details you entered how well your card rewards these categories.
            </p>
          </section>
        ) : null}

        {result.main_pressure_code ? (
          <section className={styles.card} aria-labelledby="rewards-pressure-title">
            <h3 id="rewards-pressure-title" className={styles.cardTitle}>
              Main pressure
            </h3>
            <p className={styles.cardText}>{MAIN_PRESSURE_COPY[result.main_pressure_code]}</p>
          </section>
        ) : null}

        {result.nudge_code === "COMPARE_REWARDS_FEE_INTEREST" ? (
          <section className={styles.card} aria-labelledby="rewards-nudge-title">
            <h3 id="rewards-nudge-title" className={styles.cardTitle}>
              Our nudge
            </h3>
            <p className={styles.cardText}>{NUDGE_COPY}</p>
          </section>
        ) : null}

        {result.guidance_disclaimer ? <p className={styles.disclaimer}>{result.guidance_disclaimer}</p> : null}
      </div>
    </JourneyStepShell>
  );
}
