import styles from "./journeyUi.module.css";

/**
 * The Sutriva leaf mark, drawn as inline SVG to match the approved journey boards (a green leaf with a light
 * vein and a short stem). The repository holds no vector logo file, so this is a redraw of the board's mark:
 * swap this component's artwork for the brand-master asset when one is supplied.
 */
export function SutrivaLeaf({ size = 30 }: { size?: number }) {
  return (
    <svg className={styles.logoMark} width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" focusable="false">
      <path
        d="M35.5 4.2C19.6 3 6.6 11 6 25.2c-.1 2.4.4 4.5 1.3 6.2.9-11.6 9.4-19 21-22.4C19 14 12.6 21.6 10.9 32.7c1.6 1.1 3.7 1.7 6.2 1.7 12.9-.1 20.1-13.3 18.4-30.2Z"
        fill="#1b8455"
      />
      <path d="M8.2 36.5c.6-6.4 3.2-12.6 8.4-17.7" fill="none" stroke="#1b8455" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M12 30c2.6-7.6 8.6-13.4 17-16.6" fill="none" stroke="#dff3e7" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

/** Leaf mark plus the "Sutriva" wordmark. */
export function SutrivaLogo({ size = 30 }: { size?: number }) {
  return (
    <span className={styles.logo}>
      <SutrivaLeaf size={size} />
      <span className={styles.logoWord}>Sutriva</span>
    </span>
  );
}
