"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { JourneyHeader } from "../../components/journey-ui/JourneyHeader";
import ui from "../../components/journey-ui/journeyUi.module.css";
import { ensureAnonymousSession } from "../../lib/api";
import { SituationFlow, type Step } from "./SituationFlow";
import { SituationLanding } from "./SituationLanding";
import { GROUP_COPY, isSituationKeyInGroup, type SituationGroup, type SituationKey } from "./situationsConfig";

const STEP_NUMBER: Record<Step, number> = { arrival: 1, inputs: 2, result: 3 };
const SITUATION_FLOW_TOTAL_STEPS = 3;

/**
 * The group entry point mounted at /borrow-better and /money-value. A visitor can reach any situation in
 * the group either by choosing it from the landing choice grid, or via a campaign URL carrying
 * `?situation=<key>` — which is read once on mount and opens that situation directly, without asking the
 * visitor to choose it again. The query string never carries anything beyond that one categorical key: no
 * financial figure is ever placed in a URL.
 */
export function SituationsApp({ group }: { group: SituationGroup }) {
  const searchParams = useSearchParams();
  const requested = searchParams.get("situation");
  // A key from the *other* group (e.g. ?situation=offer on /money-value) must not open that situation
  // under this journey's header and copy — falls back to the landing chooser exactly as an unrecognized
  // key already does.
  const [active, setActive] = useState<SituationKey | null>(() => (isSituationKeyInGroup(requested, group) ? requested : null));
  const [situationStep, setSituationStep] = useState<Step>("arrival");

  useEffect(() => {
    void ensureAnonymousSession();
  }, []);

  const copy = GROUP_COPY[group];

  return (
    <main className={ui.root}>
      <JourneyHeader
        journeyName={copy.eyebrow}
        step={active ? STEP_NUMBER[situationStep] : undefined}
        totalSteps={SITUATION_FLOW_TOTAL_STEPS}
        homeHref={active ? undefined : "/"}
      />
      <h1 className={ui.srOnly}>{copy.eyebrow}</h1>
      {active ? (
        <SituationFlow key={active} situationKey={active} onExit={() => setActive(null)} onStepChange={setSituationStep} />
      ) : (
        <SituationLanding group={group} onChoose={(key) => isSituationKeyInGroup(key, group) && setActive(key)} />
      )}
    </main>
  );
}
