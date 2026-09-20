import { useEffect, useId, useRef, type ReactNode, type Ref } from "react";
import styles from "./journeyFoundation.module.css";

export type JourneyStepShellProps = {
  /** Short step marker, e.g. "Step 2 of 5". Supplied by the journey; the shell has no copy of its own. */
  stepLabel: string;
  title: string;
  supportingText?: string;
  children?: ReactNode;
  actions?: ReactNode;
  /** When provided, a Back button is rendered above the heading. */
  onBack?: () => void;
  backLabel?: string;
  /** Ref to the heading so a journey can move focus after navigation. */
  headingRef?: Ref<HTMLHeadingElement>;
  /** Moves focus to the heading once when the shell mounts. Off by default. */
  focusHeadingOnMount?: boolean;
};

function setRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (typeof ref === "function") ref(value);
  else if (ref) (ref as { current: T | null }).current = value;
}

/** Presentational step container: labelled section, focusable heading, content and action slots. */
export function JourneyStepShell({
  stepLabel,
  title,
  supportingText,
  children,
  actions,
  onBack,
  backLabel = "Back",
  headingRef,
  focusHeadingOnMount = false,
}: JourneyStepShellProps) {
  const headingId = useId();
  const localHeading = useRef<HTMLHeadingElement | null>(null);

  useEffect(() => {
    if (focusHeadingOnMount) localHeading.current?.focus();
  }, [focusHeadingOnMount]);

  return (
    <section className={styles.step} aria-labelledby={headingId}>
      {onBack ? (
        <button type="button" className={styles.backButton} onClick={onBack}>
          {backLabel}
        </button>
      ) : null}
      <p className={styles.stepLabel}>{stepLabel}</p>
      <h2
        id={headingId}
        className={styles.stepTitle}
        tabIndex={-1}
        ref={(node) => {
          localHeading.current = node;
          setRef(headingRef, node);
        }}
      >
        {title}
      </h2>
      {supportingText ? <p className={styles.stepSupporting}>{supportingText}</p> : null}
      {children ? <div className={styles.stepContent}>{children}</div> : null}
      {actions ? <div className={styles.stepActions}>{actions}</div> : null}
    </section>
  );
}
