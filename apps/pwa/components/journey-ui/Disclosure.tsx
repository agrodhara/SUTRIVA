"use client";

import { useId, useState, type ReactNode } from "react";
import styles from "./journeyUi.module.css";

type Props = {
  /** The always-visible control text, e.g. "How this example works". */
  summary: string;
  /** Detail content, only mounted in the DOM while open. */
  children: ReactNode;
  defaultOpen?: boolean;
};

/**
 * A standard button + aria-expanded/aria-controls disclosure, not a native <details>: this keeps the
 * toggle's accessible role and appearance consistent with the rest of the design system across browsers,
 * rather than relying on browser-default <summary> styling and role mapping.
 *
 * Content is only rendered while open, not merely hidden with CSS: closed detail must not be reachable by
 * assistive tech or readable in the page source, and must never leak into an "always visible" text check.
 */
export function Disclosure({ summary, children, defaultOpen = false }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const contentId = useId();

  return (
    <div className={styles.disclosure}>
      <button type="button" className={styles.disclosureToggle} aria-expanded={open} aria-controls={contentId} onClick={() => setOpen((value) => !value)}>
        <span>{summary}</span>
        <span className={styles.disclosureChevron} aria-hidden="true">
          {open ? "−" : "+"}
        </span>
      </button>
      {open ? (
        <div id={contentId} className={styles.disclosureContent}>
          {children}
        </div>
      ) : null}
    </div>
  );
}
