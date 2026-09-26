import { SutrivaLogo } from "./SutrivaLogo";
import styles from "./journeyUi.module.css";

export const JOURNEY_TOTAL_STEPS = 5;

type Props = {
  /** Journey name shown beside the logo on wide screens, for example "Borrow Better". */
  journeyName: string;
  /**
   * Current step. Omit it (along with `totalSteps`) to show the brand only, with no progress indicator —
   * for a screen that isn't part of a fixed-length, numbered sequence.
   */
  step?: number;
  /** The sequence length `step` counts against. Defaults to the original 5-step journey; a shorter flow
   * (see ../../app/situations/SituationsApp.tsx) passes its own true length so the bar and "Step X of Y"
   * text never imply steps that don't exist. */
  totalSteps?: number;
  /** When set, a "← Home" link is shown. It is a full-page navigation on purpose, which clears in-memory state. */
  homeHref?: string;
};

/**
 * Compact branded header for every journey screen. The progress text and bar are decorative here: the step
 * label is announced once by the step heading region, so it is not read twice.
 */
export function JourneyHeader({ journeyName, step, totalSteps = JOURNEY_TOTAL_STEPS, homeHref }: Props) {
  const percent = step === undefined ? 0 : Math.round((step / totalSteps) * 100);
  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <div className={styles.brand}>
          {homeHref ? (
            // Intentional full-page navigation: a hard load of "/" clears transient in-memory journey state. Do not convert to next/link.
            // eslint-disable-next-line @next/next/no-html-link-for-pages
            <a className={styles.homeLink} href={homeHref}>
              ← Home
            </a>
          ) : null}
          <SutrivaLogo />
          <span className={styles.journeyName}>{journeyName}</span>
        </div>
        {step === undefined ? null : (
          <div className={styles.progress} aria-hidden="true">
            <span className={styles.progressText}>
              Step {step} of {totalSteps}
            </span>
            <span className={styles.progressTrack}>
              <span className={styles.progressFill} style={{ width: `${percent}%` }} />
            </span>
          </div>
        )}
      </div>
    </header>
  );
}
