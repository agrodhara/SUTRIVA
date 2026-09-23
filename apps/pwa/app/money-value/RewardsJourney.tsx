"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { trackEvent } from "../../lib/api";
import type { ProductEventType, ScreenName } from "../../lib/api";
import { createJourneyRunId } from "../../lib/journeySession";
import { useHydrated } from "../../lib/useHydrated";
import { JourneyFrame } from "../../components/journey-ui/JourneyFrame";
import { REWARDS_EXAMPLE_FORM, rewardsFormMatchesExample } from "./rewardsExample";
import { postRewardsCheck, type RewardsCheckResult } from "./rewardsApi";
import { INITIAL_REWARDS_FORM, buildRewardsPayload, type RewardsFormState } from "./rewardsFormState";
import { Step2CardBehaviour } from "./steps/Step2CardBehaviour";
import { Step3PrioritiesInputs } from "./steps/Step3PrioritiesInputs";
import type { RewardFinderOutcome } from "./steps/RewardFinderDialog";
import { Step4RewardsCheck } from "./steps/Step4RewardsCheck";
import { Step5IllustrativeExample } from "./steps/Step5IllustrativeExample";

type Step = "card_behaviour" | "priorities_inputs" | "check" | "example";

const STEPS: readonly Step[] = ["card_behaviour", "priorities_inputs", "check", "example"];

const SCREEN_NAME: Record<Step, ScreenName> = {
  card_behaviour: "rewards_card_behaviour",
  priorities_inputs: "rewards_priorities_inputs",
  check: "rewards_check",
  example: "rewards_connected_example",
};

/** Event fired when a screen is entered. Steps 2-3 are plain views; 4-5 use the approved final-journey events. */
const ENTRY_EVENT: Record<Step, ProductEventType> = {
  card_behaviour: "step_viewed",
  priorities_inputs: "step_viewed",
  check: "result_declared",
  example: "connected_example_seen",
};

type Entry = { step: Step; id: number };

function isStep(value: unknown): value is Step {
  return typeof value === "string" && (STEPS as readonly string[]).includes(value);
}

/**
 * History state for a step. The only entry this journey owns is the non-sensitive step identifier.
 * Any state already present is preserved: the Next.js App Router keeps its own router bookkeeping in
 * `history.state`, and dropping it makes Next reload the page on Back, which would wipe the journey.
 */
function stateForStep(step: Step): Record<string, unknown> {
  const existing = window.history.state;
  const preserved = existing !== null && typeof existing === "object" ? (existing as Record<string, unknown>) : {};
  return { ...preserved, rewardsStep: step };
}

/**
 * Rewards Intelligence 1.1A Steps 2-5 as an in-page state machine.
 *
 * All values are transient React state. Browser history carries only the non-sensitive step identifier,
 * so a refresh or an invalid direct entry restarts safely at Step 2 instead of inventing missing data.
 */
export function RewardsJourney() {
  const [journeyRunId] = useState(() => createJourneyRunId());
  const hydrated = useHydrated();
  const [form, setForm] = useState<RewardsFormState>(INITIAL_REWARDS_FORM);
  const [result, setResult] = useState<RewardsCheckResult | null>(null);
  const [entry, setEntry] = useState<Entry>({ step: "card_behaviour", id: 0 });
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState(false);
  // Example mode: the sample dataset is the active dataset. "Edited" is derived, never stored.
  const [exampleApplied, setExampleApplied] = useState(false);

  const resultRef = useRef<RewardsCheckResult | null>(null);
  const loadingRef = useRef(false);
  const emittedEntryRef = useRef(-1);

  const emit = useCallback(
    (eventType: ProductEventType, screenName: ScreenName) => {
      try {
        trackEvent(eventType, "money_value", { journeyRunId, screenName });
      } catch {
        // Analytics is best-effort and must never block the journey.
      }
    },
    [journeyRunId],
  );

  // Exactly one view/declared/seen event per actual screen entry. The ref guards against effect re-runs.
  useEffect(() => {
    if (emittedEntryRef.current === entry.id) return;
    emittedEntryRef.current = entry.id;
    emit(ENTRY_EVENT[entry.step], SCREEN_NAME[entry.step]);
  }, [entry, emit]);

  // Browser history: only the step identifier is stored. A refresh drops React state, so restart at Step 2.
  useEffect(() => {
    window.history.replaceState(stateForStep("card_behaviour"), "");

    function handlePopState(event: PopStateEvent) {
      const marker = (event.state as { rewardsStep?: unknown } | null)?.rewardsStep;
      if (!isStep(marker)) return;
      const needsResult = marker === "check" || marker === "example";
      const target: Step = needsResult && !resultRef.current ? "priorities_inputs" : marker;
      setApiError(false);
      setEntry((previous) => ({ step: target, id: previous.id + 1 }));
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const advance = useCallback((next: Step) => {
    window.history.pushState(stateForStep(next), "");
    setEntry((previous) => ({ step: next, id: previous.id + 1 }));
  }, []);

  const goBack = useCallback(() => {
    // Browser history mirrors the visible steps, so Back stays coherent with the browser Back button.
    window.history.back();
  }, []);

  const clearResult = useCallback(() => {
    resultRef.current = null;
    setResult(null);
  }, []);

  const updateForm = useCallback(
    (patch: Partial<RewardsFormState>) => {
      setApiError(false);
      clearResult();
      setForm((previous) => {
        const next = { ...previous, ...patch };
        if (patch.rewardType !== undefined && patch.rewardType !== previous.rewardType) {
          next.rewardKnowledge = null;
          next.rewardAmount = "";
          next.rewardUnits = "";
        }
        return next;
      });
    },
    [clearResult],
  );

  const applyExample = useCallback(() => {
    setApiError(false);
    clearResult();
    setForm({ ...REWARDS_EXAMPLE_FORM, priorities: [...REWARDS_EXAMPLE_FORM.priorities] });
    setExampleApplied(true);
  }, [clearResult]);

  // Clearing returns to manual entry on Step 2 with every field empty.
  const clearExample = useCallback(() => {
    setApiError(false);
    clearResult();
    setForm(INITIAL_REWARDS_FORM);
    setExampleApplied(false);
    if (entry.step !== "card_behaviour") advance("card_behaviour");
  }, [advance, clearResult, entry.step]);

  const handleFinderOutcome = useCallback(
    (outcome: RewardFinderOutcome) => {
      setApiError(false);
      clearResult();
      setForm((previous) => {
        if (outcome === "continue_without") return { ...previous, rewardKnowledge: "unknown" };
        const pointsOrMiles = previous.rewardType === "points" || previous.rewardType === "miles";
        if (outcome === "found") {
          const rewardType = previous.rewardType === null || previous.rewardType === "not_sure" ? "cashback" : previous.rewardType;
          const changed = rewardType !== previous.rewardType;
          return { ...previous, rewardType, rewardKnowledge: "amount", rewardAmount: changed ? "" : previous.rewardAmount };
        }
        const changed = !pointsOrMiles;
        return {
          ...previous,
          rewardType: pointsOrMiles ? previous.rewardType : "points",
          rewardKnowledge: "units_only",
          rewardAmount: changed ? "" : previous.rewardAmount,
        };
      });
    },
    [clearResult],
  );

  const submit = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setApiError(false);
    try {
      const response = await postRewardsCheck(buildRewardsPayload(form));
      resultRef.current = response;
      setResult(response);
      emit("step_completed", "rewards_priorities_inputs");
      advance("check");
    } catch {
      setApiError(true);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [advance, emit, form]);

  const completeStep2 = useCallback(() => {
    emit("step_completed", "rewards_card_behaviour");
    advance("priorities_inputs");
  }, [advance, emit]);

  // Later screens move focus to their heading; the first screen leaves focus where the page put it.
  const focusHeading = entry.id > 0;
  const exampleEdited = exampleApplied && !rewardsFormMatchesExample(form);
  const example = { exampleApplied, exampleEdited };
  const headerStep = { card_behaviour: 2, priorities_inputs: 3, check: 4, example: 5 }[entry.step];

  return (
    <JourneyFrame journeyName="Rewards Intelligence" step={headerStep} showHome={entry.step === "card_behaviour"}>
      {entry.step === "card_behaviour" ? (
        <Step2CardBehaviour
          key={entry.id}
          form={form}
          onChange={updateForm}
          onContinue={completeStep2}
          hydrated={hydrated}
          focusHeadingOnMount={focusHeading}
          {...example}
          onApplyExample={applyExample}
          onClearExample={clearExample}
        />
      ) : null}
      {entry.step === "priorities_inputs" ? (
        <Step3PrioritiesInputs
          key={entry.id}
          form={form}
          onChange={updateForm}
          onFinderOutcome={handleFinderOutcome}
          onSubmit={submit}
          onBack={goBack}
          loading={loading}
          apiError={apiError}
          hydrated={hydrated}
          focusHeadingOnMount={focusHeading}
          {...example}
          onClearExample={clearExample}
        />
      ) : null}
      {entry.step === "check" && result ? (
        <Step4RewardsCheck
          key={entry.id}
          result={result}
          balanceBehavior={form.balanceBehavior}
          {...example}
          onBack={goBack}
          onNext={() => advance("example")}
          onChangeFigures={goBack}
          focusHeadingOnMount={focusHeading}
        />
      ) : null}
      {entry.step === "example" && result ? (
        <Step5IllustrativeExample
          key={entry.id}
          result={result}
          balanceBehavior={form.balanceBehavior}
          selectedPriorities={form.priorities}
          {...example}
          onBack={goBack}
          focusHeadingOnMount={focusHeading}
        />
      ) : null}
    </JourneyFrame>
  );
}
