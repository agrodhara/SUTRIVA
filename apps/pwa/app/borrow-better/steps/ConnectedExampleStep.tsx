import { useId } from "react";
import { IllustrativeExampleBanner } from "../../../components/journey-foundation";
import { DeclaredDataBadge } from "../../../components/journey-ui/DeclaredDataBadge";
import { Disclosure } from "../../../components/journey-ui/Disclosure";
import { ExampleBanner } from "../../../components/journey-ui/ExampleEntry";
import { formatRupeesExact } from "../../../components/journey-ui/indian";
import { StackedBar } from "../../../components/journey-ui/StackedBar";
import { StepHeading } from "../../../components/journey-ui/StepHeading";
import ui from "../../../components/journey-ui/journeyUi.module.css";
import type { BorrowCheckResult } from "../borrowApi";
import {
  ADDITIONAL_BORROWING_ALLOCATED_EMI,
  ADDITIONAL_BORROWING_AMOUNT,
  NEW_LOAN_EMI,
  OLD_OBLIGATION_MONTHLY_PAYMENT,
  OLD_OBLIGATION_MONTHS_REMAINING,
  OLD_OBLIGATION_PAYOFF_TODAY,
  OLD_OBLIGATION_REMAINING_SCHEDULED_PAYMENTS,
  REPLACED_PORTION_ALLOCATED_EMI,
  REPLACED_PORTION_COST_INCREASE,
  REPLACED_PORTION_TOTAL_COST,
  ROOM_DIFFERENCE_VS_ADDITIONAL_BORROWING_ONLY,
  WHOLE_LOAN_ROOM_AFTER,
} from "../borrowBetterStructureExample";
import { consolidationCaveat } from "../borrowInsight";
import { buildBorrowGlance } from "../borrowSummary";
import styles from "../borrowChart.module.css";
import { formatRupees, formatWholePercent } from "../format";
import { parseRupeeAmount, type BorrowJourneyForm } from "../journeyState";
import { SYNTHETIC_EXAMPLE } from "../syntheticExample";

type Props = {
  form: BorrowJourneyForm;
  result: BorrowCheckResult;
  focusHeadingOnMount: boolean;
  exampleApplied: boolean;
  exampleEdited: boolean;
  onBack: () => void;
  /** Present only when Phase 1.1B is enabled. Undefined hides the link entirely — Step 5 stays a complete
   * ending to the anonymous check either way. */
  onContinueToPilot?: () => void;
};

// Chart geometry (viewBox units). The y axis runs from ₹0 to ₹1.5 lakh.
const CHART = { width: 320, height: 190, left: 44, right: 8, top: 10, bottom: 28, max: 150000 };
const GRIDLINES = [0, 50000, 100000, 150000];
const GRIDLINE_LABELS: Record<number, string> = { 0: "₹0", 50000: "₹0.5L", 100000: "₹1.0L", 150000: "₹1.5L" };

function CashFlowChart() {
  const plotWidth = CHART.width - CHART.left - CHART.right;
  const plotHeight = CHART.height - CHART.top - CHART.bottom;
  const slot = plotWidth / SYNTHETIC_EXAMPLE.months.length;
  const barWidth = 12;
  const y = (value: number) => CHART.top + plotHeight - (value / CHART.max) * plotHeight;

  return (
    <svg className={styles.chartSvg} viewBox={`0 0 ${CHART.width} ${CHART.height}`} role="img" aria-label={SYNTHETIC_EXAMPLE.chartSummary}>
      <defs>
        <pattern id="borrowExampleHatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="5" height="5" fill="#ffffff" />
          <rect width="3" height="5" fill="#2952a3" />
        </pattern>
      </defs>
      {GRIDLINES.map((value) => (
        <g key={value}>
          <line x1={CHART.left} x2={CHART.width - CHART.right} y1={y(value)} y2={y(value)} stroke="#e3e1d6" strokeWidth="1" />
          <text x={CHART.left - 6} y={y(value) + 4} textAnchor="end" fontSize="10" fill="#35352f">
            {GRIDLINE_LABELS[value]}
          </text>
        </g>
      ))}
      {SYNTHETIC_EXAMPLE.months.map((entry, index) => {
        const groupX = CHART.left + slot * index + (slot - barWidth * 2 - 3) / 2;
        return (
          <g key={entry.month}>
            <rect x={groupX} y={y(entry.income)} width={barWidth} height={CHART.top + plotHeight - y(entry.income)} fill="#16794f" />
            <rect
              x={groupX + barWidth + 3}
              y={y(entry.commitments)}
              width={barWidth}
              height={CHART.top + plotHeight - y(entry.commitments)}
              fill="url(#borrowExampleHatch)"
              stroke="#2952a3"
              strokeWidth="1"
            />
            <text x={CHART.left + slot * index + slot / 2} y={CHART.height - 10} textAnchor="middle" fontSize="10" fill="#35352f">
              {entry.month}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

const amount = (raw: string): number => {
  const parsed = parseRupeeAmount(raw);
  return parsed.ok ? parsed.value : 0;
};

export function ConnectedExampleStep({ form, result, focusHeadingOnMount, exampleApplied, exampleEdited, onBack, onContinueToPilot }: Props) {
  const headingId = useId();
  const example = SYNTHETIC_EXAMPLE;
  const glance = buildBorrowGlance(form, result);

  const caveat = consolidationCaveat(form.loanPurpose, formatRupeesExact(amount(form.loanAmount)));

  const beforeShare = Math.min(Math.max(result.debt_ratio_before, 0), 1) * 100;
  const addedShare = Math.min(Math.max(result.debt_ratio_after - result.debt_ratio_before, 0), 1 - beforeShare / 100) * 100;

  return (
    <section aria-labelledby={headingId} className={ui.grid}>
      <div className={ui.colMain}>
        <div className={`${ui.section} ${ui.o1}`}>
          <button type="button" className={ui.backButton} onClick={onBack}>
            Back to your check
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

        {glance ? (
          <section className={`${ui.card} ${ui.o2}`} aria-labelledby="borrow-glance-heading">
            <DeclaredDataBadge />
            <h3 id="borrow-glance-heading" className={ui.cardHeading} style={{ marginTop: 10 }}>
              Your monthly payment mix, based on what you told us
            </h3>
            <StackedBar summary={glance.summary} segments={glance.segments} total={glance.total} totalLabel={glance.totalLabel} totalDisplay={glance.totalDisplay} />
            {glance.shortfall !== null ? (
              <p className={`${ui.notice} ${ui.noticeWarn}`} style={{ marginTop: 12 }}>
                This is {formatRupeesExact(glance.shortfall)} more than your monthly take-home income.
              </p>
            ) : (
              <p className={ui.cardText} style={{ marginTop: 12 }}>
                Debt payments currently take up {formatWholePercent(result.debt_ratio_before)} of your income. This loan would change that mix — see below.
              </p>
            )}
            <p className={ui.disclaimer} style={{ marginTop: 8 }}>
              This is your self-declared total, not verified against a bureau or bank statement.
            </p>
          </section>
        ) : null}

        <section className={`${ui.card} ${ui.o3}`} aria-labelledby="borrow-share-heading">
          <DeclaredDataBadge />
          <h3 id="borrow-share-heading" className={ui.cardHeading} style={{ marginTop: 10 }}>
            {`A new EMI would take your debt-payment share from ${formatWholePercent(result.debt_ratio_before)} to ${formatWholePercent(result.debt_ratio_after)} of your income.`}
          </h3>
          <div className={ui.compare}>
            <div className={`${ui.compareCell} ${ui.compareBefore}`}>
              <span className={ui.compareValue}>{formatWholePercent(result.debt_ratio_before)}</span>
              <span className={ui.compareCaption}>Before this loan</span>
            </div>
            <span className={ui.compareArrow} aria-hidden="true">
              →
            </span>
            <div className={`${ui.compareCell} ${ui.compareAfter}`}>
              <span className={ui.compareValue}>{formatWholePercent(result.debt_ratio_after)}</span>
              <span className={ui.compareCaption}>After this loan</span>
            </div>
          </div>
          <div className={ui.shareBar} aria-hidden="true">
            <span className={ui.shareBefore} style={{ width: `${beforeShare}%` }} />
            <span className={ui.shareAdded} style={{ width: `${addedShare}%` }} />
          </div>
          <p className={ui.cardText} style={{ marginTop: 12 }}>
            {result.breathing_room_after < 0
              ? // The exact shortfall figure is already stated once, in the panel above — repeating it a
                // third time here added no new information. This names the next action in concrete terms
                // (return to the check) without suggesting that changing the amount or tenure would
                // necessarily make the loan affordable — only that it's where those changes can be tried.
                "This shortfall isn't resolved here. Return to your check to try a different loan amount or tenure."
              : `That's a ${formatRupeesExact(Math.abs(result.main_pressure.monthly_amount))} monthly increase, leaving about ${formatRupeesExact(result.breathing_room_after)}.`}
          </p>
          <p className={ui.disclaimer} style={{ marginTop: 8 }}>
            Calculated from what you told us and a fixed illustrative rate; not a measure of any specific card&apos;s utilization.
          </p>
        </section>

        {caveat ? (
          <section className={`${ui.card} ${ui.o4}`} aria-labelledby="borrow-consolidation-heading">
            <h3 id="borrow-consolidation-heading" className={ui.cardHeading}>
              {caveat.headline}
            </h3>
            <p className={ui.cardText}>{caveat.explanation}</p>
            <p className={ui.cardText}>{caveat.why}</p>
            <p className={ui.disclaimer} style={{ marginTop: 8 }}>
              {caveat.limitation}
            </p>
          </section>
        ) : null}
      </div>

      <div className={ui.colSide}>
        <section className={`${ui.illustrative} ${ui.o5}`} aria-labelledby="borrow-connected-heading">
          <IllustrativeExampleBanner />
          <h3 id="borrow-connected-heading" className={ui.illustrativeTitle}>
            {example.title}
          </h3>
          <p className={ui.cardText}>{example.intro}</p>
          <p className={ui.notice}>{example.notConnectedNote}</p>

          {/*
           * One graphic, up to three short cues, one question — not a five-fact list or a bordered
           * three-card flow. The six-month trend is the visual hook (restored to the default view per the
           * approved Borrow Better Journey v1.0 diagram); the detailed table stays behind the disclosure.
           */}
          <section className={ui.chartBlock} aria-labelledby="borrow-example-chart">
            <h4 id="borrow-example-chart" className={styles.chartHeading}>
              {example.chartTitle}
            </h4>
            <ul className={styles.legend}>
              <li className={styles.legendItem}>
                <span className={styles.swatchIncome} aria-hidden="true" /> Income
              </li>
              <li className={styles.legendItem}>
                <span className={styles.swatchCommitments} aria-hidden="true" /> Total commitments
              </li>
            </ul>
            <CashFlowChart />
          </section>

          {/*
           * Three compact cues, each explicitly "in this example": income regularity, recurring
           * debt/payment pressure, and month-end room. Salary regularity and spending behaviour are
           * bank/payment-activity facts, not credit-report findings — neither is labelled as bureau
           * information here.
           */}
          <ul className={ui.cueRow} aria-label="Fictional patterns in this example">
            <li className={ui.cue}>
              <span className={`${ui.insightIcon} ${ui.iconInfo}`} aria-hidden="true">
                i
              </span>
              <span className={ui.cueText}>
                <span className={ui.cueLabel}>Income regularity</span>
                <span className={ui.cueValue}>Salary received consistently in this example.</span>
              </span>
            </li>
            <li className={ui.cue}>
              <span className={`${ui.insightIcon} ${ui.iconWarn}`} aria-hidden="true">
                !
              </span>
              <span className={ui.cueText}>
                <span className={ui.cueLabel}>Recurring debt</span>
                <span className={ui.cueValue}>{example.recurringCommitments.detail} in this example.</span>
              </span>
            </li>
            <li className={ui.cue}>
              <span className={`${ui.insightIcon} ${ui.iconWarn}`} aria-hidden="true">
                !
              </span>
              <span className={ui.cueText}>
                <span className={ui.cueLabel}>Month-end room</span>
                {/*
                 * Two separate fictional facts, not one causal claim: the chart above shows income versus
                 * total commitments, not a month-end balance over time, so it cannot support saying the
                 * ₹8,200 buffer is "narrowing" because of the spending increase. Both figures are kept,
                 * stated independently.
                 */}
                <span className={ui.cueValue}>About {example.typicalMonthEndBuffer.detail} typical in this example.</span>
                <span className={ui.cueValue}>Essential spending also increased {example.essentialSpending.detail}</span>
              </span>
            </li>
          </ul>

          {/*
           * The one visible question: framed at the customer, about their own situation — not a promised
           * saving or approval improvement, and not naming either the ₹6,000 or ₹8,000 example EMI, so it
           * can never read as pointing at one specific figure over the other.
           */}
          <p className={ui.investigateQuestion}>Could existing debt be the pressure to examine before taking another loan?</p>

          <Disclosure summary="How this example works">
            <section aria-labelledby="borrow-example-table-heading">
              <h4 id="borrow-example-table-heading" className={styles.chartHeading}>
                Month-by-month figures
              </h4>
              {/* Very narrow screens scroll the table inside this region, never the page. */}
              <div className={styles.tableScroll} role="region" aria-labelledby="borrow-example-table-caption" tabIndex={0}>
                <table className={styles.dataTable}>
                  <caption id="borrow-example-table-caption">Example income and total commitments by month, rounded to the nearest {"₹1,000"}</caption>
                  <thead>
                    <tr>
                      <th scope="col">Month</th>
                      <th scope="col">Income</th>
                      <th scope="col">Total commitments</th>
                    </tr>
                  </thead>
                  <tbody>
                    {example.months.map((entry) => (
                      <tr key={entry.month}>
                        <th scope="row">{entry.month}</th>
                        <td>{formatRupees(entry.income)}</td>
                        <td>{formatRupees(entry.commitments)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section aria-labelledby="borrow-commitment-release-heading">
              <h4 id="borrow-commitment-release-heading" className={styles.chartHeading}>
                A separate obligation in this example
              </h4>
              {/*
               * Explicitly distinguished from the ₹8,000/10-month obligation below: same fixed example,
               * but a different, smaller obligation. The two must never be read as the same one.
               */}
              <p className={ui.cardText}>
                {`This example also notes a separate, smaller obligation: ${example.commitmentRelease.detail} This is unrelated to the ${formatRupees(OLD_OBLIGATION_MONTHLY_PAYMENT)}/month obligation used in the worked comparison below.`}
              </p>
            </section>

            <section aria-labelledby="borrow-better-structure-heading">
              <h4 id="borrow-better-structure-heading" className={styles.chartHeading}>
                Only part of a loan like this would replace named debt — the rest is new borrowing
              </h4>
              <p className={ui.cardText}>
                {`In this fixed example, a named personal loan of ${formatRupees(OLD_OBLIGATION_MONTHLY_PAYMENT)}/month with ${OLD_OBLIGATION_MONTHS_REMAINING} months remaining (${formatRupees(OLD_OBLIGATION_REMAINING_SCHEDULED_PAYMENTS)} in remaining scheduled payments) has a separate, lower payoff amount of ${formatRupees(OLD_OBLIGATION_PAYOFF_TODAY)} today. That payoff is the portion of a ${formatRupees(500000)}/36-month/14% loan (full EMI ${formatRupees(NEW_LOAN_EMI)}/month, used in full for every room figure) used to close it — the remaining ${formatRupees(ADDITIONAL_BORROWING_AMOUNT)} is additional borrowing.`}
              </p>
              <p className={`${ui.notice} ${ui.noticeWarn}`}>
                {`Flag: the replaced obligation's monthly payment falls from ${formatRupees(OLD_OBLIGATION_MONTHLY_PAYMENT)} to an allocated ${formatRupees(REPLACED_PORTION_ALLOCATED_EMI)}, but its total cost rises from the ${formatRupees(OLD_OBLIGATION_REMAINING_SCHEDULED_PAYMENTS)} in remaining scheduled payments to ${formatRupees(REPLACED_PORTION_TOTAL_COST)} (+${formatRupees(REPLACED_PORTION_COST_INCREASE)}) because the term extends to 36 months. A lower EMI is not automatically a saving.`}
              </p>
              <p className={ui.cardText}>
                {`Room after this loan is ${formatRupees(WHOLE_LOAN_ROOM_AFTER)}/month — ${formatRupees(ROOM_DIFFERENCE_VS_ADDITIONAL_BORROWING_ONLY)} higher than if the same loan added no replacement, because the old ${formatRupees(OLD_OBLIGATION_MONTHLY_PAYMENT)}/month payment is no longer paid separately. The additional-borrowing portion's allocated EMI is ${formatRupees(ADDITIONAL_BORROWING_ALLOCATED_EMI)}/month.`}
              </p>
              <p className={ui.disclaimer} style={{ marginTop: 8 }}>
                Illustrative example — not your data. A personalised replacement comparison would need details this version doesn&apos;t collect, such as which specific loan or card a new loan would replace and its remaining balance and term.
              </p>
            </section>
          </Disclosure>
        </section>

        {onContinueToPilot ? (
          <button type="button" className={`${ui.primaryButton} ${ui.o6}`} onClick={onContinueToPilot}>
            See how to join the pilot
          </button>
        ) : null}

        {/* Intentional full-page navigation: a hard load of "/" clears transient in-memory journey state. Do not convert to next/link. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a className={`${ui.linkButton} ${ui.o7}`} href="/">
          Back to home
        </a>
      </div>
    </section>
  );
}
