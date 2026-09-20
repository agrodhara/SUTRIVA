import styles from "./journeyFoundation.module.css";

export const ILLUSTRATIVE_EXAMPLE_TEXT = "ILLUSTRATIVE EXAMPLE — NOT YOUR DATA";

/**
 * Persistent notice for synthetic examples. Deliberately takes no props: it cannot
 * be given financial or user-entered values, and it makes no storage, sharing or retention claims.
 */
export function IllustrativeExampleBanner() {
  return (
    <p className={styles.illustrativeBanner} role="note">
      <span className={styles.illustrativeIcon} aria-hidden="true">
        ⓘ
      </span>
      <span>{ILLUSTRATIVE_EXAMPLE_TEXT}</span>
    </p>
  );
}
