import type { ReactNode } from "react";
import { SutrivaLogo } from "./SutrivaLogo";
import styles from "./journeyUi.module.css";

type Props = {
  journeyName: string;
  children: ReactNode;
};

/**
 * Frame for the optional Step 6 pilot handoff. Deliberately not `JourneyFrame`: Step 6 is outside the
 * five-step anonymous check (see docs/product/journeys/JOURNEY_FLOW_SPEC.md), so it carries an "Optional"
 * tag instead of a "Step X of 5" progress bar — showing "Step 6 of 5" would be nonsensical, and a filled
 * progress bar would misstate this as a required continuation of the check.
 */
export function PilotFrame({ journeyName, children }: Props) {
  return (
    <main className={styles.root}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.brand}>
            <SutrivaLogo />
            <span className={styles.journeyName}>{journeyName}</span>
          </div>
          <span className={styles.pilotOptionalBadge}>Optional</span>
        </div>
      </header>
      <div className={styles.content}>
        <h1 className={styles.srOnly}>{journeyName} — pilot interest</h1>
        {children}
      </div>
    </main>
  );
}
