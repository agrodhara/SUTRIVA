"use client";

import { useLayoutEffect, useRef, type InputHTMLAttributes } from "react";
import { groupIndian, positionAfterSignificant, sanitizeAmount, significantCount } from "./indian";
import styles from "./journeyUi.module.css";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type" | "inputMode" | "prefix"> & {
  /** Plain digits as stored in journey state, for example "500000". Shown grouped: "5,00,000". */
  value: string;
  onChange: (raw: string) => void;
  /** Currency prefix. Pass null for a plain quantity such as points or miles. */
  prefix?: string | null;
};

/**
 * Amount input with live Indian digit grouping. State stays as plain digits, so blank is never zero and
 * request builders are unchanged. The caret is kept on the same digit while the separators move.
 */
export function MoneyInput({ value, onChange, prefix = "₹", className, ...rest }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const pendingCaret = useRef<number | null>(null);
  const display = groupIndian(value);

  useLayoutEffect(() => {
    if (pendingCaret.current === null || !ref.current) return;
    const position = positionAfterSignificant(display, pendingCaret.current);
    pendingCaret.current = null;
    if (document.activeElement === ref.current) ref.current.setSelectionRange(position, position);
  });

  return (
    <div className={styles.inputWrap}>
      {prefix ? (
        <span className={styles.inputPrefix} aria-hidden="true">
          {prefix}
        </span>
      ) : null}
      <input
        {...rest}
        ref={ref}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        className={[styles.input, prefix ? styles.withPrefix : "", className ?? ""].filter(Boolean).join(" ")}
        value={display}
        onChange={(event) => {
          const entered = event.target.value;
          const caret = event.target.selectionStart ?? entered.length;
          pendingCaret.current = significantCount(entered.slice(0, caret));
          onChange(sanitizeAmount(entered));
        }}
      />
    </div>
  );
}
