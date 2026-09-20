"use client";

import { FormEvent, useState } from "react";

export type ConsentJourney = "money_value" | "comfortable_borrowing";

export function ConsentPanel({
  journey,
  onContinue,
  onDismiss,
}: {
  journey: ConsentJourney;
  onContinue?: (journey: ConsentJourney) => void;
  onDismiss?: (journey: ConsentJourney) => void;
}) {
  const [agreed, setAgreed] = useState(false);
  const journeyPath = journey === "money_value" ? "/money-value" : "/borrow-better";

  const handleContinue = (event?: FormEvent) => {
    if (event) event.preventDefault();
    if (!agreed) return;
    onContinue?.(journey);
  };

  const handleDismiss = () => {
    onDismiss?.(journey);
  };

  return (
    <main className="shell journey">
      <a className="backLink" href={journeyPath} onClick={(event) => { event.preventDefault(); handleDismiss(); }}>
        ← Back to quick check
      </a>

      <section className="consentPanel" aria-live="polite">
        <p className="eyebrow">Go deeper</p>
        <h1>Before we keep exploring</h1>
        <p className="lede consentIntro">
          This is still only a quick, indicative check. It is not a loan approval, a credit offer, or a guarantee.
        </p>

        <ul className="consentList">
          <li>We are helping you understand your position better, not making a lending decision.</li>
          <li>We do not need to collect extra financial details to continue.</li>
          <li>You can choose to stop at any time and return to the quick check.</li>
        </ul>

        <form onSubmit={handleContinue} className="consentForm">
          <label className="consentCheckbox">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(event) => setAgreed(event.target.checked)}
            />
            <span>I understand this is an indicative check, not a loan approval, and I want to keep exploring.</span>
          </label>

          <div className="consentActions">
            <button type="submit" className="primaryButton" disabled={!agreed}>
              I want to keep exploring
            </button>
            <button type="button" className="secondaryButton" onClick={handleDismiss}>
              Not now
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
