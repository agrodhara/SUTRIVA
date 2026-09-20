"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { ensureAnonymousSession, requireApiBaseUrl, trackEvent } from "../../lib/api";
import { createJourneyRunId, shouldEmitEventOnce, track11aEnabled, track11bEnabled } from "../../lib/journeySession";
import { BORROW_ILLUSTRATIVE_ANNUAL_RATE_PERCENT, BORROW_ILLUSTRATIVE_RATE_EFFECTIVE_DATE } from "../../lib/track11Config";
import { borrowingStatusLabels, currency, ErrorState, ExampleValuesButton, FinancialInput, InsightBlock, LoadingState, percent, reasonCodeLabels, ResultMetric } from "../../components/QuickCheckUI";
import { BorrowBetterContinuationFlow, Track11ContinuationStep, Track11ResultVariant } from "../../components/Track11Flow";
import { buildBorrowBetterPayload, emptyBorrowBetterFormState, updateBorrowBetterField, type BorrowBetterFormState } from "./formState";
import { useHydrated } from "../../lib/useHydrated";

type Result = {
  comfort_status: string;
  illustrative_annual_rate_percent: number;
  estimated_new_monthly_commitment: number;
  total_monthly_commitment: number;
  commitment_ratio: number;
  debt_ratio_before: number;
  debt_ratio_after: number;
  committed_ratio_before: number;
  committed_ratio_after: number;
  breathing_room_before: number;
  breathing_room_after: number;
  total_repayment: number;
  total_interest: number;
  reason_codes: string[];
  next_best_action: string;
};
type ViewMode = "result" | "continuation";

const AMOUNT_MIN = 1;
const AMOUNT_MAX = 10000000;
const AMOUNT_STEP = 10000;
const TENURE_MIN = 1;
const TENURE_MAX = 360;
const TENURE_STEP = 1;

const WHAT_IF_UPDATE_ERROR_MESSAGE = "We couldn’t update your estimate. Your previous result is still shown. Please try again.";

function guidanceParagraphs(text: string): string[] {
  return text
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);
}

function breathingRoomBand(committedRatioAfter: number, breathingRoomAfter: number): string {
  if (breathingRoomAfter < 0) return "Monthly shortfall";
  const freeShare = 1 - committedRatioAfter;
  if (freeShare < 0.1) return "Very thin breathing room";
  if (freeShare < 0.2) return "Limited breathing room";
  return "More breathing room";
}

export default function LegacyBorrowBetterPage() {
  const [form, setForm] = useState<BorrowBetterFormState>({
    ...emptyBorrowBetterFormState,
    illustrative_annual_rate_percent: String(BORROW_ILLUSTRATIVE_ANNUAL_RATE_PERCENT),
  });
  const [result, setResult] = useState<Result>();
  const [whatIf, setWhatIf] = useState({ desired_borrowing_amount: "", desired_tenure_months: "" });
  const [resultVariant, setResultVariant] = useState<Track11ResultVariant>("original");
  const [journeyRunId] = useState(() => createJourneyRunId());
  const [trackStep, setTrackStep] = useState<Track11ContinuationStep>("reveal");
  const [trackEntryId, setTrackEntryId] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>("result");
  const [isStale, setIsStale] = useState(false);
  const [exampleMode, setExampleMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [whatIfLoading, setWhatIfLoading] = useState(false);
  const [error, setError] = useState("");
  const [whatIfError, setWhatIfError] = useState("");
  const latestWhatIfRequestSequence = useRef(0);
  const hydrated = useHydrated();
  const interactionDisabled = !hydrated || loading;
  const isTrack11A = track11aEnabled();
  const isTrack11B = track11bEnabled();
  const isContinuationEnabled = isTrack11A && isTrack11B;

  useEffect(() => {
    void (ensureAnonymousSession().catch(() => undefined));
  }, []);

  useEffect(() => {
    if (!isTrack11A) return;
    const startKey = `journey_started:comfortable_borrowing:${journeyRunId}`;
    if (!shouldEmitEventOnce(startKey)) return;
    trackEvent("journey_started", "comfortable_borrowing", { journeyRunId });
  }, [journeyRunId, isTrack11A]);

  useEffect(() => {
    if (!isTrack11A) return;
    const currentStep = result ? (viewMode === "continuation" ? `continuation_${trackStep}` : "result") : "input_form";
    const stepKey = `step_viewed:comfortable_borrowing:${journeyRunId}:${currentStep}:${trackEntryId}`;
    if (!shouldEmitEventOnce(stepKey)) return;
    trackEvent("step_viewed", "comfortable_borrowing", { journeyRunId });
  }, [journeyRunId, result, viewMode, trackStep, trackEntryId, isTrack11A]);

  const set = (key: keyof BorrowBetterFormState) => (event: ChangeEvent<HTMLInputElement>) => {
    setExampleMode(false);
    setWhatIfError("");
    setForm((previous) => updateBorrowBetterField(previous, key, event.target.value));
  };

  const updateWhatIf = (key: keyof typeof whatIf) => (event: ChangeEvent<HTMLInputElement>) => {
    setIsStale(true);
    setWhatIfError("");
    setWhatIf((previous) => ({ ...previous, [key]: event.target.value }));
  };

  const canOpenContinuation = !!result && !isStale && !error && !whatIfError;
  const breathingRoomAfter = result ? result.breathing_room_after : null;
  const breathingRoomAfterPercent = result ? 1 - result.committed_ratio_after : null;
  const needsReconciliationNudge = !!result && (form.month_end_position === "fall_short" || (result.breathing_room_after < 0));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true); setError(""); setWhatIfError("");
    trackEvent("check_started", "comfortable_borrowing", { journeyRunId });
    if (isTrack11A) {
      trackEvent("step_completed", "comfortable_borrowing", { journeyRunId });
      trackEvent("result_requested", "comfortable_borrowing", { journeyRunId });
    }
    try {
      const response = await fetch(`${requireApiBaseUrl()}/v1/borrowing-intelligence/comfortable-borrowing-check`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildBorrowBetterPayload(form, isTrack11A)),
      });
      if (!response.ok) throw new Error("We couldn’t complete your borrowing comfort check. Please check your inputs.");
      const body = await response.json();
      setResult(body);
      setResultVariant("original");
      setTrackStep("reveal");
      setViewMode("result");
      setIsStale(false);
      setWhatIf({ desired_borrowing_amount: form.desired_borrowing_amount, desired_tenure_months: form.desired_tenure_months });
      if (isTrack11A) {
        trackEvent("borrow_result_state_viewed", "comfortable_borrowing", { journeyRunId });
        trackEvent("result_viewed", "comfortable_borrowing", { journeyRunId });
      }
      trackEvent("check_completed", "comfortable_borrowing", { journeyRunId });
    } catch (err) {
      if (isTrack11A) {
        trackEvent("result_failed", "comfortable_borrowing", { journeyRunId });
      }
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally { setLoading(false); }
  }

  async function runWhatIfRequest() {
    const requestSequence = latestWhatIfRequestSequence.current + 1;
    latestWhatIfRequestSequence.current = requestSequence;
    setWhatIfLoading(true);
    trackEvent("what_if_started", "comfortable_borrowing", { journeyRunId });
    if (isTrack11A) {
      trackEvent("result_requested", "comfortable_borrowing", { journeyRunId });
    }
    try {
      const response = await fetch(`${requireApiBaseUrl()}/v1/borrowing-intelligence/comfortable-borrowing-check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          buildBorrowBetterPayload(
            {
              ...form,
              desired_borrowing_amount: whatIf.desired_borrowing_amount,
              desired_tenure_months: whatIf.desired_tenure_months,
            },
            isTrack11A,
          ),
        ),
      });
      if (!response.ok) throw new Error(WHAT_IF_UPDATE_ERROR_MESSAGE);
      const body = await response.json();
      if (requestSequence !== latestWhatIfRequestSequence.current) return;
      setResult(body);
      setResultVariant("what_if");
      setTrackStep("reveal");
      setTrackEntryId((previous) => previous + 1);
      setViewMode("result");
      setIsStale(false);
      setWhatIfError("");
      if (isTrack11A) {
        trackEvent("borrow_result_state_viewed", "comfortable_borrowing", { journeyRunId });
        trackEvent("result_viewed", "comfortable_borrowing", { journeyRunId });
      }
      trackEvent("what_if_completed", "comfortable_borrowing", { journeyRunId });
    } catch (err) {
      if (isTrack11A) {
        if (requestSequence !== latestWhatIfRequestSequence.current) return;
        trackEvent("result_failed", "comfortable_borrowing", { journeyRunId });
      }
      console.error("borrow-better what-if update failed", err);
      if (requestSequence !== latestWhatIfRequestSequence.current) return;
      setWhatIfError(WHAT_IF_UPDATE_ERROR_MESSAGE);
    } finally {
      if (requestSequence !== latestWhatIfRequestSequence.current) return;
      setWhatIfLoading(false);
    }
  }

  async function runWhatIf(event: FormEvent) {
    event.preventDefault();
    await runWhatIfRequest();
  }
  const displayResult = useMemo(() => result, [result]);

  useEffect(() => {
    if (!isTrack11A || !displayResult || !exampleMode || viewMode !== "result") return;
    const viewedKey = `illustrative_example_viewed:comfortable_borrowing:${journeyRunId}`;
    if (!shouldEmitEventOnce(viewedKey)) return;
    trackEvent("illustrative_example_viewed", "comfortable_borrowing", { journeyRunId });
  }, [displayResult, exampleMode, viewMode, journeyRunId, isTrack11A]);

  if (displayResult && viewMode === "continuation" && isContinuationEnabled) {
    return <main className="shell journey"><a className="backLink" href="#" onClick={(event) => { event.preventDefault(); setViewMode("result"); }}>← Back to estimate details</a>
      <BorrowBetterContinuationFlow
        journey="comfortable_borrowing"
        journeyRunId={journeyRunId}
        step={trackStep}
        logicalEntryId={trackEntryId}
        resultVariant={resultVariant}
        returnLabel="← Back to estimate details"
        onNavigate={setTrackStep}
        onReturnToResult={() => setViewMode("result")}
        statusLabel={borrowingStatusLabels[displayResult.comfort_status] ?? "Your result is ready"}
        commitmentRatio={`${percent(displayResult.commitment_ratio)}`}
      />
    </main>;
  }

  if (displayResult) return <main className="shell journey"><a className="backLink" href="/borrow-better">← Update details</a><p className="eyebrow">Borrow Better</p><h1>Your borrowing comfort check</h1><p className="estimateLabel">{exampleMode ? "Example preview" : "Your estimate"}</p>
    <InsightBlock title="1. What did we find?"><div className="metrics"><ResultMetric label="Estimated monthly commitment" value={currency(displayResult.estimated_new_monthly_commitment)} /><ResultMetric label="Total monthly commitment" value={currency(displayResult.total_monthly_commitment)} />{isTrack11A ? <><ResultMetric label="Debt ratio (before → after)" value={`${percent(displayResult.debt_ratio_before)} → ${percent(displayResult.debt_ratio_after)}`} /><ResultMetric label="Committed ratio (before → after)" value={`${percent(displayResult.committed_ratio_before)} → ${percent(displayResult.committed_ratio_after)}`} /><ResultMetric label="Breathing room (before → after)" value={`${currency(displayResult.breathing_room_before)} → ${currency(displayResult.breathing_room_after)}`} /><ResultMetric label="Total interest over tenure" value={currency(displayResult.total_interest)} /></> : <ResultMetric label="Commitment ratio" value={percent(displayResult.commitment_ratio)} />}</div><p className="status">{borrowingStatusLabels[displayResult.comfort_status] ?? "Your result is ready"}</p>{isTrack11A && breathingRoomAfter !== null && breathingRoomAfterPercent !== null && <p className="status">{breathingRoomBand(displayResult.committed_ratio_after, breathingRoomAfter)}: {currency(breathingRoomAfter)} ({percent(breathingRoomAfterPercent)})</p>}{isTrack11A && needsReconciliationNudge && <p className="status">Your declared month-end position suggests a shortfall or conflict with the entered arithmetic. Recheck commitments, amount, tenure, or the illustrative rate before treating this as reliable.</p>}</InsightBlock>
    {isTrack11A && <p className="status">Illustrative annual rate: {displayResult.illustrative_annual_rate_percent}%. This is not an offered rate. Replace it with your actual offered rate if known.</p>}
    {isTrack11A ? <p className="status">Debt ratio uses debt payments only. Committed ratio includes debt plus essential non-debt commitments.</p> : <p className="status">Commitment ratio = (your existing monthly commitments + the proposed EMI) divided by your monthly income.</p>}
    <InsightBlock title="2. Why does it matter?"><div className="reasonParagraphs">{displayResult.reason_codes.map((code, index) => <p key={`${code}-${index}`}>{reasonCodeLabels[code] ?? "Your income, commitments and requested amount affect this estimate."}</p>)}</div></InsightBlock>
    <InsightBlock title="3. What should I do next?"><div className="reasonParagraphs">{guidanceParagraphs(displayResult.next_best_action).map((line, index) => <p key={`${line}-${index}`}>{line}</p>)}</div><div className="buttonRow"><button type="button" className="secondaryButton" onClick={() => { if (isTrack11A) { trackEvent("borrow_nudge_selected", "comfortable_borrowing", { journeyRunId }); } trackEvent("journey_completed", "comfortable_borrowing", { journeyRunId }); }}>See borrowing options</button></div></InsightBlock>
    <section className="whatIfCard"><h2>Want to improve this?</h2><p>Try another amount or tenure using the information you already entered.</p><form onSubmit={runWhatIf}>
      <label className="sliderField">
        <span>Desired borrowing amount</span>
        <div className="sliderFieldRow">
          <input type="range" min={String(AMOUNT_MIN)} max={String(AMOUNT_MAX)} step={String(AMOUNT_STEP)} value={whatIf.desired_borrowing_amount || String(AMOUNT_MIN)} onChange={updateWhatIf("desired_borrowing_amount")} disabled={interactionDisabled} />
          <input type="number" min={String(AMOUNT_MIN)} max={String(AMOUNT_MAX)} step={String(AMOUNT_STEP)} required value={whatIf.desired_borrowing_amount} onChange={updateWhatIf("desired_borrowing_amount")} disabled={interactionDisabled} />
        </div>
      </label>
      <label className="sliderField">
        <span>Desired tenure (months)</span>
        <div className="sliderFieldRow">
          <input type="range" min={String(TENURE_MIN)} max={String(TENURE_MAX)} step={String(TENURE_STEP)} value={whatIf.desired_tenure_months || String(TENURE_MIN)} onChange={updateWhatIf("desired_tenure_months")} disabled={interactionDisabled} />
          <input type="number" min={String(TENURE_MIN)} max={String(TENURE_MAX)} step={String(TENURE_STEP)} required value={whatIf.desired_tenure_months} onChange={updateWhatIf("desired_tenure_months")} disabled={interactionDisabled} />
        </div>
      </label>
      <button className="primaryButton" disabled={!hydrated}>{whatIfLoading ? "Updating estimate..." : "Update estimate"}</button>
      {whatIfError && <div className="errorState" role="alert"><p>{whatIfError}</p><button type="button" className="secondaryButton" onClick={() => { void runWhatIfRequest(); }} disabled={interactionDisabled}>Try again</button></div>}
    </form></section>
    {isStale && <p className="staleHint" role="status">Inputs changed. Update estimate before opening the next-step screens.</p>}
    {isContinuationEnabled && <div className="buttonRow"><button type="button" className="primaryButton" disabled={interactionDisabled || !canOpenContinuation} onClick={() => { trackEvent("result_action_selected", "comfortable_borrowing", { journeyRunId }); setTrackEntryId((previous) => previous + 1); setTrackStep("reveal"); setViewMode("continuation"); }}>See what I could check next</button></div>}
    {error && <ErrorState message={error} />}
  </main>;

  return <main className="shell journey"><a className="backLink" href="/">← Home</a><p className="eyebrow">Borrow Better</p><h1>Know what feels comfortable before you borrow.</h1><p className="lede">Answer a few questions for an initial estimate.</p>
    <form onSubmit={submit}><FinancialInput label="Monthly income" type="number" min="1" required value={form.monthly_income} onChange={set("monthly_income")} disabled={interactionDisabled} />
      {!isTrack11A && <FinancialInput label="Existing monthly commitments" type="number" min="0" required value={form.existing_monthly_commitments} onChange={set("existing_monthly_commitments")} disabled={interactionDisabled} />}
      {isTrack11A && <><FinancialInput label="Existing debt payments" type="number" min="0" required value={form.existing_debt_payments} onChange={set("existing_debt_payments")} disabled={interactionDisabled} /><section className="insightBlock" style={{ gridColumn: "1 / -1" }}><h2>Essential non-debt commitments</h2><div className="reasonParagraphs"><p>Include only recurring essentials. Leave zero where not applicable.</p></div><div className="metrics"><FinancialInput label="Housing or rent" type="number" min="0" required value={form.housing_rent} onChange={set("housing_rent")} disabled={interactionDisabled} /><FinancialInput label="Household or utilities" type="number" min="0" required value={form.household_utilities} onChange={set("household_utilities")} disabled={interactionDisabled} /><FinancialInput label="Dependants or education" type="number" min="0" required value={form.dependants_education} onChange={set("dependants_education")} disabled={interactionDisabled} /><FinancialInput label="Recurring medical or insurance" type="number" min="0" required value={form.recurring_medical_insurance} onChange={set("recurring_medical_insurance")} disabled={interactionDisabled} /><FinancialInput label="Other essential commitments" type="number" min="0" required value={form.other_essential_commitments} onChange={set("other_essential_commitments")} disabled={interactionDisabled} /></div></section></>}
      <FinancialInput label="Desired borrowing amount" type="number" min="1" required value={form.desired_borrowing_amount} onChange={set("desired_borrowing_amount")} disabled={interactionDisabled} /><FinancialInput label="Desired tenure (months)" type="number" min="1" max="360" required value={form.desired_tenure_months} onChange={set("desired_tenure_months")} disabled={interactionDisabled} />
      {isTrack11A && <><FinancialInput label="Illustrative annual rate (%)" type="number" min="0" step="0.1" required value={form.illustrative_annual_rate_percent} onChange={set("illustrative_annual_rate_percent")} disabled={interactionDisabled} /><label className="field"><span>How does your month usually end?</span><select className="selectInput" value={form.month_end_position} onChange={(event) => { const nextValue = event.target.value as BorrowBetterFormState["month_end_position"]; if (form.month_end_position !== nextValue) setExampleMode(false); setWhatIfError(""); setForm((previous) => updateBorrowBetterField(previous, "month_end_position", nextValue)); trackEvent("month_end_position_selected", "comfortable_borrowing", { journeyRunId }); }} disabled={interactionDisabled}><option value="comfortable">I usually have room left</option><option value="tight">It usually feels tight</option><option value="fall_short">I usually fall short</option></select></label></>}
      {isTrack11A && <p className="staleHint" style={{ gridColumn: "1 / -1", marginTop: 0 }}>Illustrative annual rate: {BORROW_ILLUSTRATIVE_ANNUAL_RATE_PERCENT}%. This is not an offered rate. Replace it with your actual offered rate if known. Effective for prototype from {BORROW_ILLUSTRATIVE_RATE_EFFECTIVE_DATE}.</p>}
      <div className="formActions"><ExampleValuesButton disabled={interactionDisabled} onClick={() => { setExampleMode(true); setForm((previous) => ({ ...previous, monthly_income: "100000", existing_monthly_commitments: "25000", existing_debt_payments: "20000", housing_rent: "20000", household_utilities: "4000", dependants_education: "3000", recurring_medical_insurance: "2000", other_essential_commitments: "1000", desired_borrowing_amount: "500000", desired_tenure_months: "36", illustrative_annual_rate_percent: String(BORROW_ILLUSTRATIVE_ANNUAL_RATE_PERCENT), month_end_position: "tight" })); setWhatIf({ desired_borrowing_amount: "500000", desired_tenure_months: "36" }); setIsStale(true); }} /><button type="submit" className="primaryButton" disabled={interactionDisabled}>Check borrowing comfort</button></div>
    </form>{loading && <LoadingState />}{error && <ErrorState message={error} retry={() => setError("")} />}</main>;
}
