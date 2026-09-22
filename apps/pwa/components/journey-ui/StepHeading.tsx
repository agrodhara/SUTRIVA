import { useEffect, useRef } from "react";
import styles from "./journeyUi.module.css";

type Props = {
  /** Id the step's section points at with aria-labelledby. */
  id: string;
  /** Screen-reader step marker, for example "Step 2 of 5". The visible progress lives in the header. */
  stepLabel: string;
  title: string;
  supportingText?: string;
  /** Style the heading as a small green label; a larger headline follows it in the step. */
  eyebrow?: boolean;
  focusOnMount?: boolean;
};

/** Focusable step heading with a hidden step marker. Used where a step composes its own two-column layout. */
export function StepHeading({ id, stepLabel, title, supportingText, eyebrow = false, focusOnMount = false }: Props) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focusOnMount) ref.current?.focus();
  }, [focusOnMount]);
  return (
    <>
      <p className={styles.srOnly}>{stepLabel}</p>
      <h2 id={id} ref={ref} tabIndex={-1} className={eyebrow ? `${styles.title} ${styles.eyebrowTitle}` : styles.title}>
        {title}
      </h2>
      {supportingText ? <p className={styles.supporting}>{supportingText}</p> : null}
    </>
  );
}
