"use client";

import { useId, useState, type KeyboardEvent } from "react";
import styles from "./journeyUi.module.css";

export const EXAMPLE_MODE_TEXT = "Example mode — these are sample figures, not your data.";

export type PreviewRow = { label: string; value: string };

type EntryProps = {
  /** True while the sample dataset is the active dataset. */
  applied: boolean;
  /** True when a sample value has been changed since it was applied. */
  edited: boolean;
  /** Sample figures shown before anything is applied. */
  previewRows: readonly PreviewRow[];
  onApply: () => void;
  onClear: () => void;
  disabled?: boolean;
};

/** Status line for the active example dataset. Shown on every step while example mode is on. */
export function ExampleBanner({ edited, onClear }: { edited: boolean; onClear?: () => void }) {
  return (
    <div className={styles.exampleBanner} role="status">
      <p className={styles.exampleText}>
        <span className={styles.exampleDot} aria-hidden="true" />
        <span className={styles.exampleLabel}>{EXAMPLE_MODE_TEXT}</span>
        {edited ? <span className={styles.editedBadge}>Example values edited</span> : null}
      </p>
      {onClear ? (
        <button type="button" className={styles.linkButton} onClick={onClear}>
          Clear example and enter my values
        </button>
      ) : null}
    </div>
  );
}

/**
 * Step 2 entry choice: "Enter my values" (default) or "Try an example". Choosing the example tab only
 * previews the sample figures. Nothing in the form changes until "Use these example values" is pressed.
 */
export function ExampleEntry({ applied, edited, previewRows, onApply, onClear, disabled = false }: EntryProps) {
  const [tab, setTab] = useState<"manual" | "example">("manual");
  const baseId = useId();
  const tabIds = { manual: `${baseId}-manual`, example: `${baseId}-example` };
  const panelId = `${baseId}-panel`;

  if (applied) return <ExampleBanner edited={edited} onClear={onClear} />;

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      const next = tab === "manual" ? "example" : "manual";
      setTab(next);
      document.getElementById(tabIds[next])?.focus();
    }
  };

  const tabButton = (key: "manual" | "example", label: string) => (
    <button
      type="button"
      role="tab"
      id={tabIds[key]}
      aria-selected={tab === key}
      aria-controls={key === "example" ? panelId : undefined}
      tabIndex={tab === key ? 0 : -1}
      className={`${styles.tab} ${tab === key ? styles.tabActive : ""}`}
      onClick={() => setTab(key)}
      onKeyDown={onKeyDown}
    >
      {label}
    </button>
  );

  return (
    <div className={styles.entry}>
      <div className={styles.tabs} role="tablist" aria-label="How to enter your figures">
        {tabButton("manual", "Enter my values")}
        {tabButton("example", "Try an example")}
      </div>
      {tab === "example" ? (
        <div id={panelId} role="tabpanel" aria-labelledby={tabIds.example} className={styles.preview}>
          <p className={styles.previewTitle}>Sample figures (not your data)</p>
          <dl className={styles.previewList}>
            {previewRows.map((row) => (
              <div key={row.label} className={styles.previewRow}>
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
          <button type="button" className={styles.primaryButton} onClick={onApply} disabled={disabled}>
            Use these example values
          </button>
        </div>
      ) : null}
    </div>
  );
}
