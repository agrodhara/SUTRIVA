"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { trackEvent, type ScreenName } from "../../lib/api";
import { createJourneyRunId, track11bEnabled } from "../../lib/journeySession";
import { useHydrated } from "../../lib/useHydrated";
import { BORROW_ILLUSTRATIVE_ANNUAL_RATE_PERCENT } from "../../lib/track11Config";
import { fetchBorrowCheck, type BorrowCheckResult } from "./borrowApi";
import { JourneyFrame } from "../../components/journey-ui/JourneyFrame";
import { PilotHandoff } from "../pilot/PilotHandoff";
import { BORROW_EXAMPLE_FORM, borrowFormMatchesExample } from "./borrowExample";
import {
  buildBorrowCheckBody,
  emptyBorrowJourneyForm,
  isMonthlyPositionValid,
  validateBorrowingPlan,
  validateMonthlyPosition,
  type BorrowJourneyForm,
  type FieldErrors,
  type PositionFieldKey,
} from "./journeyState";
import { BorrowCheckStep } from "./steps/BorrowCheckStep";
import { BorrowingPlanStep } from "./steps/BorrowingPlanStep";
import { ConnectedExampleStep } from "./steps/ConnectedExampleStep";
import { MonthlyPositionStep } from "./steps/MonthlyPositionStep";

export type BorrowStep = "monthly_position" | "plan" | "check" | "connected_example" | "pilot";

const STEPS: readonly BorrowStep[] = ["monthly_position", "plan", "check", "connected_example", "pilot"];
const HISTORY_KEY = "borrowStep";
const JOURNEY = "comfortable_borrowing" as const;

/**
 * History state for a step. The step id is merged into whatever state is already there, because the Next.js
 * router keeps its own marker in `history.state` and treats an entry without it as foreign (a hard reload).
 */
function historyStateFor(step: BorrowStep): Record<string, unknown> {
  const existing = typeof window !== "undefined" ? window.history.state : null;
  return { ...(existing && typeof existing === "object" ? existing : {}), [HISTORY_KEY]: step };
}

function isBorrowStep(value: unknown): value is BorrowStep {
  return typeof value === "string" && (STEPS as readonly string[]).includes(value);
}

/**
 * Steps 2-5 of the final Borrow Better 1.1A journey as an in-page state machine.
 *
 * Inputs and results live only in component state: nothing is written to the URL, storage, cookies or
 * product events. Only the non-sensitive step identifier is placed in browser history, and a refresh or a
 * history entry that points past what has been completed restarts safely at Step 2.
 */
export function BorrowJourney() {
  const hydrated = useHydrated();
  const [journeyRunId] = useState(() => createJourneyRunId());
  const [form, setForm] = useState<BorrowJourneyForm>(emptyBorrowJourneyForm);
  const [step, setStep] = useState<BorrowStep>("monthly_position");
  const [entry, setEntry] = useState(0);
  const [result, setResult] = useState<BorrowCheckResult | null>(null);
  const [positionAttempt, setPositionAttempt] = useState(0);
  const [planAttempt, setPlanAttempt] = useState(0);
  const [positionErrors, setPositionErrors] = useState<FieldErrors>({});
  const [planErrors, setPlanErrors] = useState<FieldErrors>({});
  const [checking, setChecking] = useState(false);
  const [checkFailed, setCheckFailed] = useState(false);
  // Example mode: the sample dataset is the active dataset. "Edited" is derived, never stored.
  const [exampleApplied, setExampleApplied] = useState(false);

  const formRef = useRef(form);
  const resultRef = useRef(result);
  const stepRef = useRef(step);
  const submittingRef = useRef(false);
  const emittedEntryRef = useRef(-1);
  formRef.current = form;
  resultRef.current = result;
  stepRef.current = step;

  const emit = useCallback(
    (eventType: "step_viewed" | "step_completed" | "result_declared" | "connected_example_seen", screenName: ScreenName) => {
      trackEvent(eventType, JOURNEY, { journeyRunId, screenName });
    },
    [journeyRunId],
  );

  const enterStep = useCallback((next: BorrowStep, mode: "push" | "none") => {
    setStep(next);
    setEntry((value) => value + 1);
    if (mode === "push" && typeof window !== "undefined") {
      window.history.pushState(historyStateFor(next), "");
    }
  }, []);

  // A step is only reachable if what it needs exists; anything else falls back to Step 2. "pilot" is the
  // optional Step 6 handoff: reachable only with a declared result and only while Phase 1.1B is enabled.
  const resolveAllowedStep = useCallback((target: unknown): BorrowStep => {
    if (!isBorrowStep(target) || target === "monthly_position") return "monthly_position";
    if (!isMonthlyPositionValid(formRef.current)) return "monthly_position";
    if (target === "plan") return "plan";
    if (target === "pilot") return resultRef.current && track11bEnabled() ? "pilot" : "connected_example";
    return resultRef.current ? target : "plan";
  }, []);

  // Browser history: restart at Step 2 on load, and follow Back/Forward within the allowed steps.
  useEffect(() => {
    window.history.replaceState(historyStateFor("monthly_position"), "");
    const onPopState = (event: PopStateEvent) => {
      const target = resolveAllowedStep((event.state as Record<string, unknown> | null)?.[HISTORY_KEY]);
      if (target === stepRef.current) return;
      enterStep(target, "none");
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [enterStep, resolveAllowedStep]);

  // Exactly one screen-entry event per actual entry, never on an ordinary rerender. "pilot" (Step 6) emits
  // its own five-event funnel from inside PilotHandoff, not this generic step-entry event.
  useEffect(() => {
    if (emittedEntryRef.current === entry) return;
    emittedEntryRef.current = entry;
    if (step === "monthly_position") emit("step_viewed", "borrow_monthly_position");
    else if (step === "plan") emit("step_viewed", "borrow_plan");
    else if (step === "check") emit("result_declared", "borrow_check");
    else if (step === "connected_example") emit("connected_example_seen", "borrow_connected_example");
  }, [entry, step, emit]);

  const goBack = (previous: BorrowStep) => {
    if (window.history.state?.[HISTORY_KEY] === stepRef.current) window.history.back();
    else enterStep(previous, "none");
  };

  // Any edit invalidates the previous result, so a stale result can never be shown or navigated to.
  const changeForm = (update: (previous: BorrowJourneyForm) => BorrowJourneyForm) => {
    setForm(update);
    setResult(null);
    setCheckFailed(false);
  };

  const applyExample = () => {
    setForm({ ...BORROW_EXAMPLE_FORM });
    setExampleApplied(true);
    setResult(null);
    setCheckFailed(false);
    setPositionErrors({});
    setPlanErrors({});
  };

  // Clearing returns to manual entry on Step 2 with every field empty.
  const clearExample = () => {
    setForm(emptyBorrowJourneyForm);
    setExampleApplied(false);
    setResult(null);
    setCheckFailed(false);
    setPositionErrors({});
    setPlanErrors({});
    if (stepRef.current !== "monthly_position") enterStep("monthly_position", "push");
  };

  const onMoneyChange = (key: PositionFieldKey, value: string) => {
    changeForm((previous) => ({ ...previous, [key]: value }));
    setPositionErrors((previous) => ({ ...previous, [key]: undefined }));
  };

  const continueFromPosition = () => {
    const errors = validateMonthlyPosition(form);
    setPositionErrors(errors);
    if (Object.keys(errors).length > 0) {
      setPositionAttempt((value) => value + 1);
      return;
    }
    emit("step_completed", "borrow_monthly_position");
    enterStep("plan", "push");
  };

  const continueFromPlan = async () => {
    if (submittingRef.current) return;
    const errors = validateBorrowingPlan(form);
    setPlanErrors(errors);
    const body = buildBorrowCheckBody(form);
    if (!body || Object.keys(errors).length > 0) {
      setPlanAttempt((value) => value + 1);
      return;
    }

    submittingRef.current = true;
    setChecking(true);
    setCheckFailed(false);
    try {
      const response = await fetchBorrowCheck(body);
      // The user may have left this step while the request was in flight; never navigate them forward.
      if (stepRef.current !== "plan") return;
      setResult(response);
      emit("step_completed", "borrow_plan");
      enterStep("check", "push");
    } catch {
      // Inputs stay as entered; only a fixed message is shown.
      setCheckFailed(true);
    } finally {
      submittingRef.current = false;
      setChecking(false);
    }
  };

  const disabled = !hydrated;
  // Inputs lock while a check is in flight so the result always matches what is on screen.
  const planInputsDisabled = disabled || checking;
  const focusHeadingOnMount = entry > 0;
  const exampleEdited = exampleApplied && !borrowFormMatchesExample(form);
  const example = { exampleApplied, exampleEdited };
  const headerStep = { monthly_position: 2, plan: 3, check: 4, connected_example: 5, pilot: 5 }[step];
  const pilotEnabled = track11bEnabled();

  if (step === "pilot") {
    // Finish without joining / Cancel / Done all exit the same way Step 5's own "Back to home" does: a
    // hard navigation, which intentionally clears transient in-memory journey state.
    return <PilotHandoff journey="comfortable_borrowing" onExit={() => { window.location.href = "/"; }} />;
  }

  return (
    <JourneyFrame journeyName="Borrow Better" step={headerStep} showHome={step === "monthly_position"}>

        {step === "monthly_position" ? (
          <MonthlyPositionStep
            form={form}
            errors={positionErrors}
            attempt={positionAttempt}
            disabled={disabled}
            focusHeadingOnMount={focusHeadingOnMount}
            {...example}
            onApplyExample={applyExample}
            onClearExample={clearExample}
            onMoneyChange={onMoneyChange}
            onMonthEndChange={(value) => {
              changeForm((previous) => ({ ...previous, monthEndPosition: value }));
              setPositionErrors((previous) => ({ ...previous, monthEndPosition: undefined }));
            }}
            onContinue={continueFromPosition}
          />
        ) : null}

        {step === "plan" ? (
          <BorrowingPlanStep
            form={form}
            errors={planErrors}
            attempt={planAttempt}
            configuredRatePercent={BORROW_ILLUSTRATIVE_ANNUAL_RATE_PERCENT}
            checking={checking}
            checkFailed={checkFailed}
            disabled={planInputsDisabled}
            focusHeadingOnMount={focusHeadingOnMount}
            {...example}
            onClearExample={clearExample}
            onLoanAmountChange={(value) => {
              changeForm((previous) => ({ ...previous, loanAmount: value }));
              setPlanErrors((previous) => ({ ...previous, loanAmount: undefined }));
            }}
            onTenureChange={(value) => {
              changeForm((previous) => ({ ...previous, tenureMonths: value }));
              setPlanErrors((previous) => ({ ...previous, tenureMonths: undefined }));
            }}
            onPurposeChange={(value) => changeForm((previous) => ({ ...previous, loanPurpose: value }))}
            onEmiEndingChange={(value) => changeForm((previous) => ({ ...previous, emiEnding: value }))}
            onBack={() => goBack("monthly_position")}
            onContinue={() => void continueFromPlan()}
          />
        ) : null}

        {step === "check" && result ? (
          <BorrowCheckStep
            result={result}
            form={form}
            focusHeadingOnMount={focusHeadingOnMount}
            {...example}
            onBack={() => goBack("plan")}
            onExplore={() => enterStep("connected_example", "push")}
            onAdjustLoan={() => goBack("plan")}
            onChangeFigures={() => enterStep("monthly_position", "push")}
          />
        ) : null}

        {step === "connected_example" && result ? (
          <ConnectedExampleStep
            form={form}
            result={result}
            focusHeadingOnMount={focusHeadingOnMount}
            {...example}
            onBack={() => goBack("check")}
            onContinueToPilot={pilotEnabled ? () => enterStep("pilot", "push") : undefined}
          />
        ) : null}
    </JourneyFrame>
  );
}
