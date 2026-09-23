import { useId, useState } from "react";
import { ExampleBanner } from "../../../components/journey-ui/ExampleEntry";
import { formatRupeesExact } from "../../../components/journey-ui/indian";
import { PillGroup } from "../../../components/journey-ui/PillGroup";
import { StepHeading } from "../../../components/journey-ui/StepHeading";
import ui from "../../../components/journey-ui/journeyUi.module.css";
import type { BorrowCheckResult } from "../borrowApi";
import { selectBorrowSituation } from "../borrowInsight";
import { essentialsTotal } from "../borrowSummary";
import { exploreTenure } from "../borrowTenureExplorer";
import { formatLakh, formatTenureYears, formatWholePercent, rateCopy } from "../format";
import { parseRupeeAmount, TENURE_OPTIONS, type BorrowJourneyForm } from "../journeyState";
import { useEmiPreview } from "../useEmiPreview";

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

const TENURE_PILL_OPTIONS = TENURE_OPTIONS.map((months) => ({ value: String(months), label: `${months} mo` }));

type Props = {
  result: BorrowCheckResult;
  form: BorrowJourneyForm;
  focusHeadingOnMount: boolean;
  exampleApplied: boolean;
  exampleEdited: boolean;
  onBack: () => void;
  onExplore: () => void;
  /** Secondary correction actions. */
  onAdjustLoan: () => void;
  onChangeFigures: () => void;
};

const amount = (raw: string): number => {
  const parsed = parseRupeeAmount(raw);
  return parsed.ok ? parsed.value : 0;
};

export function BorrowCheckStep({ result, form, focusHeadingOnMount, exampleApplied, exampleEdited, onBack, onExplore, onAdjustLoan, onChangeFigures }: Props) {
  const headingId = useId();
  const income = amount(form.monthlyIncome);
  const existingPayments = amount(form.existingPayments);
  const essentials = essentialsTotal(form) ?? 0;
  const loanAmount = amount(form.loanAmount);
  const submittedTenure = Number(form.tenureMonths);

  // "Try a different tenure": a what-if preview. Nothing here resubmits the check or changes the saved plan.
  const [exploredTenure, setExploredTenure] = useState<number>(submittedTenure);
  const exploring = exploredTenure !== submittedTenure;
  const { state: preview } = useEmiPreview({ loanAmount: form.loanAmount, tenureMonths: String(exploredTenure) as BorrowJourneyForm["tenureMonths"] });

  const exploration =
    exploring && preview.status === "ready"
      ? exploreTenure({
          emi: preview.emi,
          tenureMonths: exploredTenure,
          loanAmount,
          income,
          existingPayments,
          breathingRoomBefore: result.breathing_room_before,
          debtRatioBefore: result.debt_ratio_before,
        })
      : null;

  const emi = exploration?.emi ?? result.estimated_new_monthly_commitment;
  const breathingRoomAfter = exploration?.breathingRoomAfter ?? result.breathing_room_after;
  const debtRatioAfter = exploration?.debtRatioAfter ?? result.debt_ratio_after;
  const totalRepayment = exploration?.totalRepayment ?? result.total_repayment;
  const totalInterest = exploration?.totalInterest ?? result.total_interest;
  const activeTenureMonths = exploration?.tenureMonths ?? submittedTenure;

  const finding = selectBorrowSituation({
    income,
    existingPayments,
    essentials,
    emi,
    breathingRoomBefore: result.breathing_room_before,
    breathingRoomAfter,
  });

  const nudge = result.loan_reduction_nudge;
  const belowZero = breathingRoomAfter < 0;
  // The nudge amount is fixed by the backend at ₹1 lakh, regardless of the size of a shortfall: it can
  // reduce one without closing it. This is a real derived figure (not a new formula) from the same two
  // fields already shown above — never presented as resolving the shortfall when it plainly doesn't.
  const nudgeResultingRoom = nudge ? breathingRoomAfter + nudge.monthly_breathing_room_preserved : null;
  const nudgeInsufficient = nudge !== null && nudgeResultingRoom !== null && nudgeResultingRoom < 0;
  const beforeShare = Math.min(Math.max(result.debt_ratio_before, 0), 1) * 100;
  const addedShare = Math.min(Math.max(debtRatioAfter - result.debt_ratio_before, 0), 1 - beforeShare / 100) * 100;

  return (
    <section aria-labelledby={headingId} className={ui.grid}>
      <div className={ui.colMain}>
        <div className={`${ui.section} ${ui.o1}`}>
          <button type="button" className={ui.backButton} onClick={onBack}>
            Back
          </button>
          <StepHeading id={headingId} stepLabel="Step 4 of 5" title="Your Borrow Better check" eyebrow focusOnMount={focusHeadingOnMount} />
          <p className={ui.headline}>{finding.headline}</p>
          {exampleApplied ? <ExampleBanner edited={exampleEdited} /> : null}
        </div>

        <div className={`${ui.darkPanel} ${ui.o2}`}>
          <p className={ui.darkLabel}>Estimated EMI</p>
          <p className={ui.darkValue}>
            {formatRupeesExact(emi)} <span className={ui.darkUnit}>per month</span>
          </p>
          <p className={ui.darkNote}>
            {formatRupeesExact(loanAmount)} over {formatTenureYears(activeTenureMonths)}
            {exploring ? " — trying a different tenure, not your saved plan" : ""}
          </p>
        </div>

        <div className={`${ui.card} ${ui.o3}`}>
          <h3 className={ui.cardHeading}>Try a different tenure</h3>
          <PillGroup legend="Tenure" name="borrow-check-tenure" options={TENURE_PILL_OPTIONS} value={String(exploredTenure)} onChange={(value) => setExploredTenure(Number(value))} />
          <p className={ui.cardText} style={{ marginTop: 8 }}>
            The rate stays fixed — only tenure changes here.
          </p>
        </div>

        <section className={`${ui.insightCard} ${ui.o6}`} aria-label="Why this, and one thing to try">
          <div className={ui.insightRow}>
            <span className={`${ui.insightIcon} ${finding.code === "additional_borrowing" ? ui.iconInfo : ui.iconWarn}`} aria-hidden="true">
              {finding.code === "additional_borrowing" ? "i" : "!"}
            </span>
            <div>
              <p className={ui.insightBody}>{finding.explanation}</p>
              <p className={ui.insightBody}>{finding.why}</p>
            </div>
          </div>
          <div className={ui.insightRow}>
            <span className={`${ui.insightIcon} ${ui.iconGood}`} aria-hidden="true">
              ✓
            </span>
            <div>
              <p className={ui.insightBody}>{finding.tryThis}</p>
            </div>
          </div>
          {nudge && !exploring ? (
            <div className={ui.insightRow}>
              {/* An insufficient nudge (reduces but doesn't close a shortfall) is not a reassuring green
                  check: it gets the same warning treatment as the shortfall finding above. */}
              <span className={`${ui.insightIcon} ${nudgeInsufficient ? ui.iconWarn : ui.iconGood}`} aria-hidden="true">
                {nudgeInsufficient ? "!" : "✓"}
              </span>
              <div>
                <h3 className={ui.insightTitle}>A possible nudge</h3>
                <p className={ui.insightBody}>
                  Reducing the loan by {formatLakh(nudge.reduction_amount)} could preserve about {formatRupeesExact(nudge.monthly_breathing_room_preserved)} of monthly breathing room.
                </p>
                {nudgeInsufficient ? (
                  <p className={ui.insightBody}>
                    This reduces the shortfall but does not close it — you would still be about {formatRupeesExact(Math.abs(nudgeResultingRoom as number))} short each month.
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
        </section>
      </div>

      <div className={ui.colSide}>
        <section className={`${ui.card} ${ui.o3}`} aria-labelledby="borrow-debt-payments">
          <h3 id="borrow-debt-payments" className={ui.cardHeading}>
            Debt payments <span>(% of income)</span>
          </h3>
          <div className={ui.compare}>
            <div className={`${ui.compareCell} ${ui.compareBefore}`}>
              <span className={ui.compareValue}>{formatWholePercent(result.debt_ratio_before)}</span>
              <span className={ui.compareCaption}>Before</span>
            </div>
            <span className={ui.compareArrow} aria-hidden="true">
              →
            </span>
            <div className={`${ui.compareCell} ${ui.compareAfter}`}>
              <span className={ui.compareValue}>{formatWholePercent(debtRatioAfter)}</span>
              <span className={ui.compareCaption}>After</span>
            </div>
          </div>
          <div className={ui.shareBar} aria-hidden="true">
            <span className={ui.shareBefore} style={{ width: `${beforeShare}%` }} />
            <span className={ui.shareAdded} style={{ width: `${addedShare}%` }} />
          </div>
        </section>

        <section className={`${ui.card} ${ui.o4}`} aria-labelledby="borrow-breathing-room">
          <h3 id="borrow-breathing-room" className={ui.cardHeading}>
            Monthly breathing room
          </h3>
          <div className={ui.compare}>
            <div className={`${ui.compareCell} ${ui.compareBefore}`}>
              <span className={ui.compareValue}>{formatRupeesExact(result.breathing_room_before)}</span>
              <span className={ui.compareCaption}>Before</span>
            </div>
            <span className={ui.compareArrow} aria-hidden="true">
              →
            </span>
            <div className={`${ui.compareCell} ${ui.compareAfter}`}>
              <span className={ui.compareValue}>{formatRupeesExact(breathingRoomAfter)}</span>
              <span className={ui.compareCaption}>After</span>
            </div>
          </div>
          {belowZero ? <p className={`${ui.notice} ${ui.noticeWarn}`} style={{ marginTop: 12 }}>After this EMI, your estimated monthly position would be below zero.</p> : null}
        </section>

        <div className={`${ui.tileRow} ${ui.o5}`}>
          <div className={ui.tile}>
            <span className={ui.tileLabel}>Total repayment</span>
            <span className={ui.tileValue}>{formatRupeesExact(totalRepayment)}</span>
            <span className={ui.tileCaption}>over {formatTenureYears(activeTenureMonths)}</span>
          </div>
          <div className={ui.tile}>
            <span className={ui.tileLabel}>Total interest</span>
            <span className={ui.tileValue}>{formatRupeesExact(totalInterest)}</span>
            <span className={ui.tileCaption}>at the illustrative rate</span>
          </div>
        </div>

        <div className={`${ui.section} ${ui.o7}`}>
          {result.reconciliation_note ? <p className={ui.notice}>{RECONCILIATION_COPY[result.reconciliation_note]}</p> : null}
          {result.emi_ending_note ? <p className={ui.notice}>{EMI_ENDING_COPY[result.emi_ending_note]}</p> : null}
          <p className={ui.rateNote}>{rateCopy(result.illustrative_annual_rate_percent)}</p>
          <p className={ui.disclaimer}>{BORROW_CHECK_DISCLAIMER}</p>
        </div>

        <div className={`${ui.section} ${ui.o8}`}>
          <button type="button" className={ui.primaryButton} onClick={onExplore}>
            See a connected-data example
          </button>
          <div className={ui.actionsRow}>
            <button type="button" className={ui.secondaryButton} onClick={onAdjustLoan}>
              Adjust loan amount or tenure
            </button>
            <button type="button" className={ui.linkButton} onClick={onChangeFigures}>
              Change my figures
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
