"use client";

import { useState } from "react";
import ui from "../../components/journey-ui/journeyUi.module.css";
import { saveBorrowCheck, SituationApiError, type Provenance, type SituationResult } from "./situationsApi";
import type { SituationKey } from "./situationsConfig";

// Same light client-side shape check as PilotInterestForm.tsx — the server's own validation
// (app/models/saved_borrow_check.py) is the actual authority, never skipped because this passed.
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Stable, categorical error codes from app/routers/saved_borrow_checks.py / app/services/saved_borrow_checks.py
// — mapped to plain copy; anything else falls back to a generic message.
const FRIENDLY_ERROR: Record<string, string> = {
  rate_limited: "Too many attempts right now. Please try again in a little while.",
  service_unavailable: "We couldn't save that just now. Please try again in a moment.",
  saved_check_not_configured: "Saving isn't available right now.",
  email_send_failed: "We couldn't email that link just now. Please try again in a moment.",
  invalid_input_values: "Something about this result couldn't be saved. Please try again.",
  invalid_origin: "Something went wrong. Please try again.",
  feature_disabled: "This isn't available right now.",
};

type Status = "idle" | "submitting" | "success" | "error";

/**
 * Milestone 2C: the optional "save this check" prompt — email-only for v1 (see
 * docs/product/journeys/B1_SAVED_CHECK_SPEC.md; mobile verification is explicitly deferred, not built
 * here). Rendered only on the result screen of the four B1 (Borrow Better) situations, below the
 * existing PilotInterestForm — a distinct, separate action from it, never merged with it: this is "save
 * my own result to look at again," not "register interest in an invitation." Entirely optional; every
 * other action on the result screen (adjusting figures, exploring another situation) works identically
 * whether or not this form is ever touched, and anonymous completion of the check itself needs none of
 * this.
 */
export function SaveCheckForm({
  situationKey,
  values,
  provenance,
  result,
}: {
  situationKey: SituationKey;
  values: Record<string, unknown>;
  provenance: Provenance;
  result: SituationResult;
}) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  if (status === "success") {
    return (
      <div className={ui.card} style={{ marginTop: 16 }}>
        <p role="status">Sent — check your email for a link back to this result.</p>
      </div>
    );
  }

  async function submit() {
    const trimmed = email.trim();
    if (!EMAIL_SHAPE.test(trimmed)) {
      setError("Enter a valid email address.");
      return;
    }
    setStatus("submitting");
    setError(null);
    try {
      await saveBorrowCheck(situationKey, values, provenance, result, trimmed);
      setStatus("success");
    } catch (err) {
      setStatus("idle");
      const detail = err instanceof SituationApiError ? err.detail : undefined;
      setError((detail && FRIENDLY_ERROR[detail]) || "Something went wrong. Please try again.");
    }
  }

  return (
    <div className={ui.card} style={{ marginTop: 16 }}>
      <h3 className={ui.cardHeading}>Save this check to look at again later?</h3>
      <p className={ui.disclaimer}>
        We&apos;ll email you a private link to this exact result. It isn&apos;t shared with anyone else and isn&apos;t linked to any account.
      </p>
      <form
        className={ui.form}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label className={ui.field}>
          <span className={ui.fieldLabel}>Email address</span>
          <input
            className={ui.input}
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError(null);
            }}
            placeholder="you@example.com"
          />
        </label>
        {error ? (
          <p className={ui.errorText} role="alert">
            {error}
          </p>
        ) : null}
        <div className={ui.actionsRow} style={{ marginTop: 12 }}>
          <button type="submit" className={ui.secondaryButton} disabled={status === "submitting"}>
            {status === "submitting" ? "Sending…" : "Email me this result"}
          </button>
        </div>
      </form>
    </div>
  );
}
