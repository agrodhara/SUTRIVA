import { SutrivaLogo } from "./SutrivaLogo";
import styles from "./journeyUi.module.css";

export const JOURNEY_TOTAL_STEPS = 5;

type Props = {
  /** Journey name shown beside the logo on wide screens, for example "Borrow Better". */
  journeyName: string;
  /** Current step, 1 to 5. */
  step: number;
  /** When set, a "← Home" link is shown. It is a full-page navigation on purpose, which clears in-memory state. */
  homeHref?: string;
};

/**
 * Compact branded header for every journey screen. The progress text and bar are decorative here: the step
 * label is announced once by the step heading region, so it is not read twice.
 */
export function JourneyHeader({ journeyName, step, homeHref }: Props) {
  const percent = Math.round((step / JOURNEY_TOTAL_STEPS) * 100);
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
        <div className={styles.progress} aria-hidden="true">
          <span className={styles.progressText}>
            Step {step} of {JOURNEY_TOTAL_STEPS}
          </span>
          <span className={styles.progressTrack}>
            <span className={styles.progressFill} style={{ width: `${percent}%` }} />
          </span>
        </div>
      </div>
    </header>
  );
}
