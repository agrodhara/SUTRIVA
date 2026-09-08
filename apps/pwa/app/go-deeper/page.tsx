"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Journey, trackEvent } from "../../lib/api";

function isJourney(value: string | null): value is Journey {
  return value === "money_value" || value === "comfortable_borrowing";
}

function journeyPath(journey: Journey): string {
  return journey === "comfortable_borrowing" ? "/borrow-better" : "/money-value";
}

function GoDeeperContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const journey: Journey = isJourney(searchParams.get("journey")) ? (searchParams.get("journey") as Journey) : "money_value";
  const [choice, setChoice] = useState<"interested" | "not_now" | null>(null);

  function handleInterested() {
    trackEvent("go_deeper_selected", journey);
    setChoice("interested");
  }

  function handleNotNow() {
    trackEvent("go_deeper_declined", journey);
    setChoice("not_now");
    router.push(journeyPath(journey));
  }

  return (
    <main className="shell">
      <p className="eyebrow">Consent boundary</p>
      <h1>Go deeper</h1>
      <p className="lede">
        Your quick check used only the information you entered. With your permission, a deeper
        financial view could later use additional information such as account summaries or
        transaction patterns to improve the analysis.
      </p>
      <p className="disclaimer">
        No additional financial data is being collected in this Alpha step.
      </p>
      <p className="disclaimer">
        This Alpha records only that you are interested in exploring deeper insights. It does not
        authorize access to your financial accounts or external data.
      </p>

      {choice === "interested" ? (
        <p className="explanation">
          Thanks — we&apos;ve recorded your interest. There is nothing else to do right now.
        </p>
      ) : (
        <div className="consentActions">
          <button type="button" onClick={handleInterested}>
            I&apos;m interested in deeper insights
          </button>
          <button type="button" className="secondaryButton" onClick={handleNotNow}>
            Not now
          </button>
        </div>
      )}
    </main>
  );
}

export default function GoDeeperPage() {
  return (
    <Suspense fallback={null}>
      <GoDeeperContent />
    </Suspense>
  );
}
