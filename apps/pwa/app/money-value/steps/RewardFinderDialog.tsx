"use client";

import { useEffect, useId, useRef } from "react";
import styles from "../rewards.module.css";

export type RewardFinderOutcome = "found" | "units_only" | "continue_without";

const FOCUSABLE = "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])";

/**
 * "Where to find your rewards" help. A modal dialog: focus moves into it on open, Tab is kept
 * inside, Escape closes it, and focus returns to whatever opened it. It never collects a value.
 */
export function RewardFinderDialog({
  onClose,
  onOutcome,
}: {
  onClose: () => void;
  onOutcome: (outcome: RewardFinderOutcome) => void;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    titleRef.current?.focus();
    return () => {
      opener?.focus();
    };
  }, []);

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;

    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;

    if (event.shiftKey && (active === first || active === titleRef.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div
      className={styles.dialogBackdrop}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div ref={dialogRef} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={handleKeyDown}>
        <div className={styles.dialogHeader}>
          <h3 id={titleId} ref={titleRef} tabIndex={-1} className={styles.dialogTitle}>
            Where to find your rewards
          </h3>
          <button type="button" className={styles.dialogClose} aria-label="Close" onClick={onClose}>
            <span aria-hidden="true">×</span>
          </button>
        </div>
        <ul className={styles.sourceList}>
          <li className={styles.sourceItem}>
            <strong>Card app:</strong> Rewards or Benefits
          </li>
          <li className={styles.sourceItem}>
            <strong>Card statement:</strong> Cashback, Rewards credit or Points balance
          </li>
          <li className={styles.sourceItem}>
            <strong>Reward programme app</strong> or recent redemption
          </li>
        </ul>
        <div className={styles.dialogActions}>
          <button type="button" className={styles.primaryAction} onClick={() => onOutcome("found")}>
            I found it — enter amount
          </button>
          <button type="button" className={styles.secondaryAction} onClick={() => onOutcome("units_only")}>
            I know points/miles, not ₹ value
          </button>
          <button type="button" className={styles.secondaryAction} onClick={() => onOutcome("continue_without")}>
            Continue without it
          </button>
        </div>
      </div>
    </div>
  );
}
