"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { IllustrativeExampleBanner } from "../../components/journey-foundation";
import { PilotFrame } from "../../components/journey-ui/PilotFrame";
import ui from "../../components/journey-ui/journeyUi.module.css";
import { trackEvent } from "../../lib/api";
import { createJourneyRunId } from "../../lib/journeySession";
import { PilotApiError, postPilotInterest, postPilotMobile, postPilotMobileResend, postPilotVerify, type PilotJourney } from "./pilotApi";

type Substep = "invitation" | "mobile" | "otp" | "success";

type JourneyCopy = {
  journeyName: string;
  /** Carried forward from Step 5, in the exact wording approved for Step 6 — not Step 5's own wording. */
  benefitQuestion: string;
  /** What today's anonymous check plainly cannot do, so interest is invited honestly. */
  caveat: string;
  /**
   * Restates the fixed Step 5 fictional facts in prose, anchored to "the fictional example you just saw"
   * so it can never read as the customer's own data. Mirrors the constants in Step5IllustrativeExample.tsx
   * / syntheticExample.ts exactly — keep these in sync if those change.
   */
  illustrativeReminder: string;
};

const JOURNEY_COPY: Record<PilotJourney, JourneyCopy> = {
  money_value: {
    journeyName: "Rewards Intelligence",
    benefitQuestion: "Do my rewards match where I spend, or are fees and interest eating the value?",
    caveat: "This check can't compare across your other cards or value lounge access.",
    illustrativeReminder:
      "In the fictional example you just saw: dining was 32% of the month's spend, and fee/interest costs could offset the gains.",
  },
  comfortable_borrowing: {
    journeyName: "Borrow Better",
    benefitQuestion: "Which commitments are putting pressure on my monthly room, and how might that change over time?",
    caveat: "This check doesn't know which of your debts a new loan would replace.",
    illustrativeReminder:
      "In the fictional example you just saw: a recurring obligation of ₹31,500 was identified, alongside essential spending that increased in 2 of the last 6 months.",
  },
};

function normalizePhoneNumber(raw: string): string | null {
  const digits = raw.replace(/[^\d]/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (raw.startsWith("+") && /^\+[1-9][0-9]{7,14}$/.test(raw.replace(/\s/g, ""))) return raw.replace(/\s/g, "");
  return null;
}

const API_ERROR_COPY: Record<string, string> = {
  invalid_code: "That code didn’t match. Check it and try again.",
  code_expired: "That code has expired. Request a new one.",
  too_many_attempts: "Too many attempts on this code. Request a new one.",
  resend_too_soon: "Please wait a little longer before requesting another code.",
  already_verified: "This number is already verified.",
  sms_provider_not_configured: "We can’t send a verification code right now. Please try again later.",
  pilot_registration_not_found: "That request has expired. Please start again.",
};

function errorMessageFor(code: string): string {
  return API_ERROR_COPY[code] ?? "Something went wrong. Please try again.";
}

export function PilotHandoff({ journey, onExit }: { journey: PilotJourney; onExit: () => void }) {
  const copy = JOURNEY_COPY[journey];
  const headingId = useId();
  const [substep, setSubstep] = useState<Substep>("invitation");
  const [pilotRegistrationId, setPilotRegistrationId] = useState<string | null>(null);
  const [phoneInput, setPhoneInput] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [displayPhone, setDisplayPhone] = useState("");
  const [optionalUpdates, setOptionalUpdates] = useState(false);
  const [code, setCode] = useState("");
  const [resendAfterSeconds, setResendAfterSeconds] = useState(30);
  const [resendReadyAt, setResendReadyAt] = useState<number>(0);
  const [resendReady, setResendReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [journeyRunId] = useState(() => createJourneyRunId());

  const [resendSecondsLeft, setResendSecondsLeft] = useState(0);

  // Disables (rather than silently ignoring clicks on) the resend button until the cooldown the server
  // told us about has actually elapsed, and shows a live countdown matching that state.
  useEffect(() => {
    if (resendReadyAt === 0) return;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((resendReadyAt - Date.now()) / 1000));
      setResendSecondsLeft(remaining);
      setResendReady(remaining === 0);
    };
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [resendReadyAt]);

  const emit = useCallback(
    (eventType: "pilot_interest_clicked" | "mobile_submitted" | "otp_sent" | "otp_verified" | "optional_updates_opted_in") => {
      try {
        trackEvent(eventType, journey, { journeyRunId });
      } catch {
        // Analytics is best-effort and must never block the handoff.
      }
    },
    [journey, journeyRunId],
  );

  const handleContinue = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      let id = pilotRegistrationId;
      if (!id) {
        const result = await postPilotInterest(journey);
        id = result.pilot_registration_id;
        setPilotRegistrationId(id);
        emit("pilot_interest_clicked");
      }
      setSubstep("mobile");
    } catch (err) {
      setError(err instanceof PilotApiError ? errorMessageFor(err.code) : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [emit, journey, pilotRegistrationId]);

  const handleSendCode = useCallback(async () => {
    const normalized = normalizePhoneNumber(phoneInput);
    if (!normalized) {
      setPhoneError("Enter a valid 10-digit mobile number.");
      return;
    }
    setPhoneError(null);
    setError(null);
    setLoading(true);
    try {
      if (!pilotRegistrationId) throw new PilotApiError("pilot_registration_not_found", 409);
      const result = await postPilotMobile(pilotRegistrationId, normalized, optionalUpdates);
      emit("mobile_submitted");
      if (optionalUpdates) emit("optional_updates_opted_in");
      emit("otp_sent");
      setDisplayPhone(normalized);
      setResendAfterSeconds(result.resend_after_seconds);
      setResendReadyAt(Date.now() + result.resend_after_seconds * 1000);
      setCode("");
      setSubstep("otp");
    } catch (err) {
      setError(err instanceof PilotApiError ? errorMessageFor(err.code) : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [emit, optionalUpdates, phoneInput, pilotRegistrationId]);

  const handleResend = useCallback(async () => {
    if (!pilotRegistrationId || !resendReady) return;
    setError(null);
    setLoading(true);
    try {
      const result = await postPilotMobileResend(pilotRegistrationId);
      emit("otp_sent");
      setResendAfterSeconds(result.resend_after_seconds);
      setResendReadyAt(Date.now() + result.resend_after_seconds * 1000);
      setCode("");
    } catch (err) {
      setError(err instanceof PilotApiError ? errorMessageFor(err.code) : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [emit, pilotRegistrationId, resendReady]);

  const handleVerify = useCallback(async () => {
    if (!pilotRegistrationId) return;
    setError(null);
    setLoading(true);
    try {
      await postPilotVerify(pilotRegistrationId, code);
      emit("otp_verified");
      setSubstep("success");
    } catch (err) {
      setError(err instanceof PilotApiError ? errorMessageFor(err.code) : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [code, emit, pilotRegistrationId]);

  return (
    <PilotFrame journeyName={copy.journeyName}>
      <section aria-labelledby={headingId} className={ui.pilotLayout}>
        <div>
          {substep === "invitation" ? (
            <div className={`${ui.section} ${ui.o1}`}>
              <h2 id={headingId} className={ui.title}>
                Want to join the pilot?
              </h2>
              <p className={ui.headline}>{copy.benefitQuestion}</p>
              <p className={ui.supporting}>{copy.caveat}</p>

              <section className={`${ui.illustrative} ${ui.o2}`} aria-label="Reminder of the fictional example from Step 5">
                <IllustrativeExampleBanner />
                <p className={ui.cardText}>{copy.illustrativeReminder}</p>
              </section>

              <p className={ui.cardText} style={{ marginTop: 12 }}>
                This step only registers pilot interest through mobile verification — it doesn’t run any connected analysis.
              </p>
              <p className={ui.disclaimer} style={{ marginTop: 8 }}>
                Registering interest does not guarantee an invitation or a financial product.
              </p>
              {error ? <p className={`${ui.notice} ${ui.noticeWarn}`}>{error}</p> : null}

              <div className={ui.actionsRow} style={{ marginTop: 16 }}>
                <button type="button" className={ui.primaryButton} onClick={handleContinue} disabled={loading}>
                  {loading ? "Please wait…" : "Continue"}
                </button>
                <button type="button" className={ui.linkButton} onClick={onExit}>
                  Finish without joining
                </button>
              </div>
            </div>
          ) : null}

          {substep === "mobile" ? (
            <div className={`${ui.section} ${ui.o1}`}>
              <h2 id={headingId} className={ui.title}>
                Enter your mobile number
              </h2>
              <p className={ui.supporting}>We’ll text a one-time code to verify it’s you.</p>
              <p className={ui.cardText}>
                We’ll contact you about this pilot using this number. If you also choose product updates below, that’s a separate, optional choice.
              </p>
              <p className={ui.disclaimer}>Continuing may link this registration to the anonymous check you just completed.</p>

              <div className={ui.field} style={{ marginTop: 12 }}>
                <label className={ui.fieldLabel} htmlFor="pilot-phone">
                  Mobile number
                </label>
                <div className={ui.inputWrap}>
                  <span className={ui.inputPrefix} aria-hidden="true">
                    +91
                  </span>
                  <input
                    id="pilot-phone"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel-national"
                    className={`${ui.input} ${ui.withPhonePrefix}`}
                    value={phoneInput}
                    onChange={(event) => setPhoneInput(event.target.value)}
                    aria-invalid={phoneError ? "true" : undefined}
                    placeholder="98765 43210"
                  />
                </div>
                {phoneError ? <p className={ui.errorText}>{phoneError}</p> : null}
              </div>

              <label className={ui.checkboxRow}>
                <input type="checkbox" checked={optionalUpdates} onChange={(event) => setOptionalUpdates(event.target.checked)} />
                <span>Also send me occasional Sutriva product updates (optional, separate from this pilot).</span>
              </label>

              {error ? <p className={`${ui.notice} ${ui.noticeWarn}`}>{error}</p> : null}

              <div className={ui.actionsRow} style={{ marginTop: 16 }}>
                <button type="button" className={ui.primaryButton} onClick={handleSendCode} disabled={loading}>
                  {loading ? "Sending…" : "Send code"}
                </button>
                <button type="button" className={ui.linkButton} onClick={() => setSubstep("invitation")}>
                  Back
                </button>
              </div>
            </div>
          ) : null}

          {substep === "otp" ? (
            <div className={`${ui.section} ${ui.o1}`}>
              <h2 id={headingId} className={ui.title}>
                Enter the code we sent
              </h2>
              <p className={ui.supporting}>Sent to {displayPhone}.</p>

              <div className={ui.field} style={{ marginTop: 12 }}>
                <label className={ui.fieldLabel} htmlFor="pilot-otp">
                  Verification code
                </label>
                <input
                  id="pilot-otp"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  className={ui.input}
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/[^\d]/g, ""))}
                  maxLength={8}
                />
              </div>

              {error ? <p className={`${ui.notice} ${ui.noticeWarn}`}>{error}</p> : null}

              <div className={ui.actionsRow} style={{ marginTop: 16 }}>
                <button type="button" className={ui.primaryButton} onClick={handleVerify} disabled={loading || code.length < 4}>
                  {loading ? "Verifying…" : "Verify"}
                </button>
                <button type="button" className={ui.linkButton} onClick={handleResend} disabled={loading || !resendReady}>
                  {resendReady ? "Resend code" : `Resend in ${resendSecondsLeft}s`}
                </button>
              </div>
              <div className={ui.actionsRow}>
                <button type="button" className={ui.linkButton} onClick={() => setSubstep("mobile")}>
                  Change number
                </button>
                <button type="button" className={ui.linkButton} onClick={onExit}>
                  Cancel
                </button>
              </div>
              <p className={ui.rateNote} style={{ marginTop: 8 }}>
                {`Codes expire after a few minutes. You can request a new one about every ${resendAfterSeconds} seconds.`}
              </p>
            </div>
          ) : null}

          {substep === "success" ? (
            <div className={`${ui.section} ${ui.o1}`}>
              <h2 id={headingId} className={ui.title}>
                Your interest has been registered.
              </h2>
              <p className={ui.cardText}>We may contact you about this pilot using your verified number. If you chose product updates, those are separate.</p>
              <div className={ui.actionsRow} style={{ marginTop: 16 }}>
                <button type="button" className={ui.primaryButton} onClick={onExit}>
                  Done
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </PilotFrame>
  );
}
