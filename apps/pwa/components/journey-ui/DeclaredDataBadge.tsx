import styles from "./journeyUi.module.css";

export const DECLARED_DATA_TEXT = "BASED ON WHAT YOU TOLD US — YOUR DECLARED FIGURES";

/**
 * Marks a panel as built from the customer's own declared/calculated figures, as distinct from the blue
 * "ILLUSTRATIVE EXAMPLE — NOT YOUR DATA" banner used for fixed fictional content. No panel may show both
 * badges: a figure is either the customer's own or a labelled example, never both at once.
 */
export function DeclaredDataBadge() {
  return (
    <p className={styles.exampleBanner} style={{ display: "inline-flex", flexDirection: "row", gap: 8 }}>
      <span className={styles.exampleDot} aria-hidden="true" />
      <span>{DECLARED_DATA_TEXT}</span>
    </p>
  );
}
