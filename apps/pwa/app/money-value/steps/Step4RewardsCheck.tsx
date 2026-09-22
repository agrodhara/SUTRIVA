"use client";

import { useId } from "react";
import { ExampleBanner } from "../../../components/journey-ui/ExampleEntry";
import { StepHeading } from "../../../components/journey-ui/StepHeading";
import { ValueBars } from "../../../components/journey-ui/ValueBars";
import ui from "../../../components/journey-ui/journeyUi.module.css";
import type { MainPressureCode, RewardsCheckResult } from "../rewardsApi";
import { PERIOD_PHRASE, PRIORITY_OPTIONS } from "../rewardsFormState";
import { CANNOT_CALCULATE, buildRewardBars, netUnavailableReason, rupees } from "../rewardsSummary";

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
    return `Based on ${rupees(result.reward_amount_per_period)} ${noun} ${period}.`;
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
    return `Estimated annual interest cost included: ${rupees(result.estimated_annual_interest_cost)}.`;
  }
  return "Interest impact is unknown. No interest cost has been assumed.";
}

export function Step4RewardsCheck({
  result,
  exampleApplied,
  exampleEdited,
  onBack,
  onNext,
  onChangeFigures,
  focusHeadingOnMount,
}: {
  result: RewardsCheckResult;
  exampleApplied: boolean;
  exampleEdited: boolean;
  onBack: () => void;
  onNext: () => void;
  onChangeFigures: () => void;
  focusHeadingOnMount: boolean;
}) {
  const headingId = useId();
  const rewardsKnown = result.estimated_annual_rewards !== null;
  const net = result.estimated_net_annual_value;
  const netKnown = net !== null;
  const unitWord = result.reward_type === "miles" ? "miles" : "points";
  const basisLine = rewardBasisLine(result);
  const priorities = result.spending_priorities ?? [];
  const reason = netUnavailableReason(result);
  const bars = buildRewardBars(result, false);
  const headline = netKnown ? `Your estimated net annual value is ${rupees(net)}.` : "We can’t calculate your net annual value yet.";

  return (
    <section aria-labelledby={headingId} className={ui.grid}>
      <div className={ui.colMain}>
        <div className={`${ui.section} ${ui.o1}`}>
          <button type="button" className={ui.backButton} onClick={onBack}>
            Back
          </button>
          <StepHeading id={headingId} stepLabel="Step 4 of 5" title="Your Rewards Check" eyebrow focusOnMount={focusHeadingOnMount} />
          <p className={ui.headline}>{headline}</p>
          <p className={ui.supporting}>Based on the information you provided. This is an indicative estimate.</p>
          {exampleApplied ? <ExampleBanner edited={exampleEdited} /> : null}
        </div>

        <div className={`${ui.darkPanel} ${netKnown ? "" : ui.darkPanelMuted} ${ui.o2}`}>
          <p className={ui.darkLabel}>Net annual value</p>
          <p className={ui.darkValue}>{netKnown ? rupees(net) : CANNOT_CALCULATE}</p>
          <p className={ui.darkNote}>{reason ?? (result.interest_input_basis === "known" ? "Estimated annual rewards minus your annual fee and estimated interest." : "Estimated annual rewards minus your annual fee.")}</p>
        </div>

        {result.main_pressure_code || result.nudge_code === "COMPARE_REWARDS_FEE_INTEREST" ? (
          <section className={`${ui.insightCard} ${ui.o6}`} aria-label="Pressure and a nudge">
            {result.main_pressure_code ? (
              <div className={ui.insightRow}>
                <span className={`${ui.insightIcon} ${ui.iconWarn}`} aria-hidden="true">
                  !
                </span>
                <div>
                  <h3 className={ui.insightTitle}>Main pressure</h3>
                  <p className={ui.insightBody}>{MAIN_PRESSURE_COPY[result.main_pressure_code]}</p>
                </div>
              </div>
            ) : null}
            {result.nudge_code === "COMPARE_REWARDS_FEE_INTEREST" ? (
              <div className={ui.insightRow}>
                <span className={`${ui.insightIcon} ${ui.iconGood}`} aria-hidden="true">
                  ✓
                </span>
                <div>
                  <h3 className={ui.insightTitle}>Our nudge</h3>
                  <p className={ui.insightBody}>{NUDGE_COPY}</p>
                </div>
              </div>
            ) : null}
          </section>
        ) : null}
      </div>

      <div className={ui.colSide}>
        <section className={`${ui.card} ${ui.o3}`} aria-labelledby="rewards-economics-title">
          <h3 id="rewards-economics-title" className={ui.cardHeading}>
            Rewards vs fee <span>(a year)</span>
          </h3>
          <ValueBars summary={bars.summary} rows={bars.rows} />
        </section>

        {result.spending_fit_status === "CATEGORY_FIT_UNDETERMINED" && priorities.length > 0 ? (
          <section className={`${ui.card} ${ui.o5}`} aria-labelledby="rewards-priorities-title">
            <h3 id="rewards-priorities-title" className={ui.cardHeading}>
              Your spending priorities
            </h3>
            <ul className={ui.chipList}>
              {priorities.map((priority) => (
                <li key={priority} className={ui.chip}>
                  {PRIORITY_LABELS[priority] ?? priority}
                </li>
              ))}
            </ul>
            <p className={ui.cardText}>We can’t tell from the details you entered how well your card rewards these categories.</p>
          </section>
        ) : null}

        <section className={`${ui.card} ${ui.o7}`} aria-labelledby="rewards-basis-title">
          <h3 id="rewards-basis-title" className={ui.cardHeading}>
            Based on
          </h3>
          <div className={ui.section} style={{ gap: 8 }}>
            {basisLine ? <p className={ui.cardText}>{basisLine}</p> : null}
            {!rewardsKnown && result.annualized_reward_units !== null && result.annualized_reward_units !== undefined ? (
              <p className={ui.cardText}>
                Annualised quantity: {QUANTITY.format(result.annualized_reward_units)} {unitWord}. We haven’t converted this to rupees.
              </p>
            ) : null}
            {!rewardsKnown && (result.annualized_reward_units === null || result.annualized_reward_units === undefined) ? (
              <p className={ui.cardText}>Reward value is unknown, so we can’t estimate annual rewards.</p>
            ) : null}
            <p className={ui.cardText}>{interestLine(result)}</p>
          </div>
        </section>

        <div className={`${ui.section} ${ui.o8}`}>
          {result.guidance_disclaimer ? <p className={ui.disclaimer}>{result.guidance_disclaimer}</p> : null}
          <button type="button" className={ui.primaryButton} onClick={onNext}>
            See a connected-data example
          </button>
          <button type="button" className={ui.linkButton} onClick={onChangeFigures}>
            Change my figures
          </button>
        </div>
      </div>
    </section>
  );
}
