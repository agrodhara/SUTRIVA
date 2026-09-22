import type { ReactNode } from "react";
import { JourneyHeader } from "./JourneyHeader";
import styles from "./journeyUi.module.css";

type Props = {
  journeyName: string;
  /** Current step, 1 to 5. */
  step: number;
  /** Show the "← Home" link (Step 2 only, as before). */
  showHome?: boolean;
  children: ReactNode;
};

/** Page frame shared by both journeys: brand tokens, compact branded header, centred content column. */
export function JourneyFrame({ journeyName, step, showHome = false, children }: Props) {
  return (
    <main className={styles.root}>
      <JourneyHeader journeyName={journeyName} step={step} homeHref={showHome ? "/" : undefined} />
      <div className={styles.content}>
        <h1 className={styles.srOnly}>{journeyName}</h1>
        {children}
      </div>
    </main>
  );
}
