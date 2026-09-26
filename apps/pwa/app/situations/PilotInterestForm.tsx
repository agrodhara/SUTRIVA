"use client";

import { useEffect, useState } from "react";
import ui from "../../components/journey-ui/journeyUi.module.css";
import type { ScreenName } from "../../lib/api";
import { registerPilotInterest, SituationApiError } from "./situationsApi";
import { SITUATIONS, type SituationKey } from "./situationsConfig";

// A light client-side shape check only, to catch an obvious typo before a round trip — the server's own
// validation (see services/api/app/models/situation_pilot_interest.py) is the actual authority on whether
// an email is acceptable, and is never skipped just because this passed.
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// The API's error `detail` values are stable, categorical codes (see
// services/api/app/models/situation_pilot_interest.py's PilotInterestErrorResponse), not visitor-facing
// copy. This maps the ones this form can actually receive to a plain sentence; anything else (including a
// Pydantic validation array, which is not a string and so never reaches here) falls back to a generic one.
const FRIENDLY_ERROR: Record<string, string> = {
  rate_limited: "Too many attempts right now. Please try again in a little while.",
  service_unavailable: "We couldn't save that just now. Please try again in a moment.",
  invalid_origin: "Something went wrong. Please try again.",
  feature_disabled: "This isn't available right now.",
};

type Status = "idle" | "submitting" | "success" | "error";

/**
 * The optional, post-result pilot-interest handoff (consolidated product correction — Copilot review +
 * founder decisions, 2026-09-26). Rendered only from SituationFlow's result screen — never before a
 * result exists — and never required to finish a check or explore another situation: those actions live
 * outside this component and work regardless of whether this form has been touched.
 *
 * Collects exactly one field (email). No name, phone number, or consent checkbox exists here — submitting
 * this form is registering interest in an invitation, not opting into promotional updates.
 */
export function PilotInterestForm({
  situationKey,
  onEmit,
}: {
  situationKey: SituationKey;
  /** Reports only a screen_name for a fixed-shape analytics event — see SituationFlow.tsx's `emit`. Never
   * called with the email itself. */
  onEmit: (eventType: "step_viewed" | "situation_pilot_interest_submitted", screenName: ScreenName) => void;
}) {
  const screenBase = SITUATIONS[situationKey].screenBase;
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onEmit("step_viewed", `${screenBase}_pilot` as ScreenName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screenBase]);

  if (status === "success") {
    return (
      <div className={`${ui.card}`} style={{ marginTop: 16 }}>
        <p role="status">Thanks — we&apos;ve registered your interest. We&apos;ll email you when the Sutriva pilot is ready.</p>
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
      await registerPilotInterest(situationKey, trimmed);
      setStatus("success");
      onEmit("situation_pilot_interest_submitted", `${screenBase}_pilot` as ScreenName);
    } catch (err) {
      setStatus("idle");
      const detail = err instanceof SituationApiError ? err.detail : undefined;
      setError((detail && FRIENDLY_ERROR[detail]) || "Something went wrong. Please try again.");
    }
  }

  return (
    <div className={ui.card} style={{ marginTop: 16 }}>
      <h3 className={ui.cardHeading}>Interested in the Sutriva pilot?</h3>
      <p className={ui.disclaimer}>We&apos;re building a deeper version of this check. Leave your email if you&apos;d like an invitation when it&apos;s ready to test.</p>
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
            {status === "submitting" ? "Registering…" : "Register my interest"}
          </button>
        </div>
      </form>
    </div>
  );
}
