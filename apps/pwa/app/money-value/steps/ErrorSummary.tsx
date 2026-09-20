"use client";

import { useEffect, useRef } from "react";
import styles from "../rewards.module.css";

/**
 * Announces validation problems and moves focus to them each time the customer submits with errors.
 * `attempt` increments per failed submit; nothing renders until the first failed attempt.
 */
export function ErrorSummary({ messages, attempt }: { messages: string[]; attempt: number }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (attempt > 0 && messages.length > 0) ref.current?.focus();
    // Focus only when a new failed attempt happens, not while the customer fixes fields.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  if (attempt === 0 || messages.length === 0) return null;

  return (
    <div ref={ref} className={styles.errorSummary} role="alert" tabIndex={-1}>
      <p className={styles.errorTitle}>Please check your answers</p>
      <ul className={styles.errorList}>
        {messages.map((message) => (
          <li key={message}>{message}</li>
        ))}
      </ul>
    </div>
  );
}
