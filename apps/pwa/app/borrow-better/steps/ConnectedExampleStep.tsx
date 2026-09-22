import { useId } from "react";
import { IllustrativeExampleBanner } from "../../../components/journey-foundation";
import { ExampleBanner } from "../../../components/journey-ui/ExampleEntry";
import { StackedBar } from "../../../components/journey-ui/StackedBar";
import { StepHeading } from "../../../components/journey-ui/StepHeading";
import ui from "../../../components/journey-ui/journeyUi.module.css";
import type { BorrowCheckResult } from "../borrowApi";
import { buildBorrowGlance } from "../borrowSummary";
import styles from "../borrowChart.module.css";
import type { BorrowJourneyForm } from "../journeyState";
import { formatRupees } from "../format";
import { SYNTHETIC_EXAMPLE } from "../syntheticExample";

type Props = {
  form: BorrowJourneyForm;
  result: BorrowCheckResult;
  focusHeadingOnMount: boolean;
  exampleApplied: boolean;
  exampleEdited: boolean;
  onBack: () => void;
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

export function ConnectedExampleStep({ form, result, focusHeadingOnMount, exampleApplied, exampleEdited, onBack }: Props) {
  const headingId = useId();
  const example = SYNTHETIC_EXAMPLE;
  const glance = buildBorrowGlance(form, result);

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
            <h3 id="borrow-glance-heading" className={ui.cardHeading}>
              Where your monthly income goes <span>(with this EMI)</span>
            </h3>
            <StackedBar summary={glance.summary} segments={glance.segments} total={glance.total} totalLabel="Monthly take-home income" totalDisplay={glance.totalDisplay} />
          </section>
        ) : null}
      </div>

      <div className={ui.colSide}>
        <section className={`${ui.illustrative} ${ui.o3}`} aria-labelledby="borrow-connected-heading">
          <IllustrativeExampleBanner />
          <h3 id="borrow-connected-heading" className={ui.illustrativeTitle}>
            {example.title}
          </h3>
          <p className={ui.cardText}>{example.intro}</p>
          <p className={ui.notice}>{example.notConnectedNote}</p>

          <ul className={ui.factList}>
            {[example.incomeRegularity, example.recurringCommitments, example.typicalMonthEndBuffer, example.essentialSpending, example.commitmentRelease].map((fact) => (
              <li key={fact.title} className={ui.fact}>
                <span className={ui.factTitle}>{fact.title}</span>
                <span className={ui.factDetail}>{fact.detail}</span>
              </li>
            ))}
          </ul>

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
