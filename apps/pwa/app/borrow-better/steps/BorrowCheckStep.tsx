import { JourneyStepShell } from "../../../components/journey-foundation";
import type { BorrowCheckResult } from "../borrowApi";
import styles from "../borrowBetter.module.css";
import { formatApproxLakh, formatLakh, formatRupeesNearest100, formatTenureYears, formatWholePercent, rateCopy } from "../format";

export const BORROW_CHECK_DISCLAIMER = "Indicative estimate — not a loan approval, eligibility decision or offer.";

const RECONCILIATION_COPY: Record<NonNullable<BorrowCheckResult["reconciliation_note"]>, string> = {
  MONTH_END_FALL_SHORT:
    "You said your month usually ends short. That answer is not part of this calculation, so check whether these figures match what you see in practice.",
  MONTH_END_POSITION_UNKNOWN:
    "You weren’t sure how your month usually ends. That answer is not part of this calculation, so treat the breathing-room figures as approximate.",
};

const EMI_ENDING_COPY: Record<NonNullable<BorrowCheckResult["emi_ending_note"]>, string> = {
  EMI_MAY_END_WITHIN_SIX_MONTHS:
    "You said an existing EMI may end within six months. This is a note only and is not used in the figures above.",
};

type Props = {
  result: BorrowCheckResult;
  tenureMonths: number;
  focusHeadingOnMount: boolean;
  onBack: () => void;
  onExplore: () => void;
};

export function BorrowCheckStep({ result, tenureMonths, focusHeadingOnMount, onBack, onExplore }: Props) {
  const nudge = result.loan_reduction_nudge;
  const belowZero = result.breathing_room_after < 0;

  return (
    <JourneyStepShell
      stepLabel="Step 4 of 5"
      title="Your Borrow Better check"
      supportingText="Here’s the estimated impact on your finances."
      onBack={onBack}
      focusHeadingOnMount={focusHeadingOnMount}
      actions={
        <button type="button" className={styles.primaryButton} onClick={onExplore}>
          Explore more comfortable options
        </button>
      }
    >
      <section className={styles.metricCard} aria-labelledby="borrow-debt-payments">
        <h3 id="borrow-debt-payments" className={styles.metricTitle}>
          Debt payments <span>(% of income)</span>
        </h3>
        <div className={styles.compare}>
          <div className={`${styles.compareCell} ${styles.compareBefore}`}>
            <span className={styles.compareValue}>{formatWholePercent(result.debt_ratio_before)}</span>
            <span className={styles.compareCaption}>Before</span>
          </div>
          <span className={styles.compareArrow} aria-hidden="true">
            →
          </span>
          <div className={`${styles.compareCell} ${styles.compareAfter}`}>
            <span className={styles.compareValue}>{formatWholePercent(result.debt_ratio_after)}</span>
            <span className={styles.compareCaption}>After</span>
          </div>
        </div>
      </section>

      <section className={styles.metricCard} aria-labelledby="borrow-breathing-room">
        <h3 id="borrow-breathing-room" className={styles.metricTitle}>
          Monthly breathing room
        </h3>
        <div className={styles.compare}>
          <div className={`${styles.compareCell} ${styles.compareBefore}`}>
            <span className={styles.compareValue}>{formatRupeesNearest100(result.breathing_room_before)}</span>
            <span className={styles.compareCaption}>Before</span>
          </div>
          <span className={styles.compareArrow} aria-hidden="true">
            →
          </span>
          <div className={`${styles.compareCell} ${styles.compareAfter}`}>
            <span className={styles.compareValue}>{formatRupeesNearest100(result.breathing_room_after)}</span>
            <span className={styles.compareCaption}>After</span>
          </div>
        </div>
        {belowZero ? <p className={styles.notice}>After this EMI, your estimated monthly position would be below zero.</p> : null}
      </section>

      <div className={styles.figureRow}>
        <p className={styles.figureLabel}>Estimated EMI</p>
        <p className={styles.figureValue}>{formatRupeesNearest100(result.estimated_new_monthly_commitment)}</p>
        <p className={styles.figureCaption}>per month</p>
      </div>
      <div className={styles.figureRow}>
        <p className={styles.figureLabel}>Total repayment</p>
        <p className={styles.figureValue}>{formatApproxLakh(result.total_repayment)}</p>
        <p className={styles.figureCaption}>over {formatTenureYears(tenureMonths)}</p>
      </div>
      <div className={styles.figureRow}>
        <p className={styles.figureLabel}>Total interest</p>
        <p className={styles.figureValue}>{formatApproxLakh(result.total_interest)}</p>
      </div>

      <section className={styles.pressure} aria-labelledby="borrow-main-pressure">
        <h3 id="borrow-main-pressure" className={styles.pressureTitle}>
          Main pressure
        </h3>
        <p className={styles.pressureBody}>
          The proposed EMI reduces your estimated monthly breathing room by approximately {formatRupeesNearest100(result.main_pressure.monthly_amount)}.
        </p>
      </section>

      {nudge ? (
        <section className={styles.nudge} aria-labelledby="borrow-nudge">
          <h3 id="borrow-nudge" className={styles.nudgeTitle}>
            A possible nudge
          </h3>
          <p className={styles.nudgeBody}>
            Reducing the loan by {formatLakh(nudge.reduction_amount)} could preserve about {formatRupeesNearest100(nudge.monthly_breathing_room_preserved)} of monthly breathing room.
          </p>
        </section>
      ) : null}

      {result.reconciliation_note ? <p className={styles.notice}>{RECONCILIATION_COPY[result.reconciliation_note]}</p> : null}
      {result.emi_ending_note ? <p className={styles.notice}>{EMI_ENDING_COPY[result.emi_ending_note]}</p> : null}

      <p className={styles.rateNote}>{rateCopy(result.illustrative_annual_rate_percent)}</p>
      <p className={styles.disclaimer}>{BORROW_CHECK_DISCLAIMER}</p>
    </JourneyStepShell>
  );
}
