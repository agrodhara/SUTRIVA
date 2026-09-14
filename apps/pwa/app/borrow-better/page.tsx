"use client";

import { ChangeEvent, FormEvent, useMemo, useState } from "react";
import { requireApiBaseUrl, trackEvent } from "../../lib/api";
import { borrowingStatusLabels, currency, ErrorState, ExampleValuesButton, FinancialInput, InsightBlock, LoadingState, percent, reasonCodeLabels, ResultMetric } from "../../components/QuickCheckUI";
import { BorrowBetterContinuationFlow, Track11ContinuationStep, Track11ResultVariant } from "../../components/Track11Flow";
import { buildBorrowBetterPayload, emptyBorrowBetterFormState, updateBorrowBetterField, type BorrowBetterFormState } from "./formState";
import { useHydrated } from "../../lib/useHydrated";

type Result = { comfort_status: string; estimated_new_monthly_commitment: number; total_monthly_commitment: number; commitment_ratio: number; reason_codes: string[]; next_best_action: string };
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

export default function BorrowBetterPage() {
  const [form, setForm] = useState<BorrowBetterFormState>(emptyBorrowBetterFormState);
  const [result, setResult] = useState<Result>();
  const [whatIf, setWhatIf] = useState({ desired_borrowing_amount: "", desired_tenure_months: "" });
  const [resultVariant, setResultVariant] = useState<Track11ResultVariant>("original");
  const [trackStep, setTrackStep] = useState<Track11ContinuationStep>("reveal");
  const [viewMode, setViewMode] = useState<ViewMode>("result");
  const [isStale, setIsStale] = useState(false);
  const [exampleMode, setExampleMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [whatIfError, setWhatIfError] = useState("");
  const hydrated = useHydrated();
  const interactionDisabled = !hydrated || loading;

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

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true); setError(""); setWhatIfError(""); trackEvent("check_started", "comfortable_borrowing");
    try {
      const response = await fetch(`${requireApiBaseUrl()}/v1/borrowing-intelligence/comfortable-borrowing-check`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildBorrowBetterPayload(form)),
      });
      if (!response.ok) throw new Error("We couldn’t complete your borrowing comfort check. Please check your inputs.");
      const body = await response.json();
      setResult(body);
      setResultVariant("original");
      setTrackStep("reveal");
      setViewMode("result");
      setIsStale(false);
      setWhatIf({ desired_borrowing_amount: form.desired_borrowing_amount, desired_tenure_months: form.desired_tenure_months });
      trackEvent("check_completed", "comfortable_borrowing");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally { setLoading(false); }
  }

  async function runWhatIfRequest() {
    setLoading(true);
    trackEvent("what_if_started", "comfortable_borrowing");
    try {
      const response = await fetch(`${requireApiBaseUrl()}/v1/borrowing-intelligence/comfortable-borrowing-check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildBorrowBetterPayload({
          ...form,
          desired_borrowing_amount: whatIf.desired_borrowing_amount,
          desired_tenure_months: whatIf.desired_tenure_months,
        })),
      });
      if (!response.ok) throw new Error(WHAT_IF_UPDATE_ERROR_MESSAGE);
      setResult(await response.json());
      setResultVariant("what_if");
      setTrackStep("reveal");
      setViewMode("result");
      setIsStale(false);
      setWhatIfError("");
      trackEvent("what_if_completed", "comfortable_borrowing");
    } catch (err) {
      setWhatIfError(err instanceof Error ? err.message : WHAT_IF_UPDATE_ERROR_MESSAGE);
    } finally {
      setLoading(false);
    }
  }

  async function runWhatIf(event: FormEvent) {
    event.preventDefault();
    await runWhatIfRequest();
  }
  const displayResult = useMemo(() => result, [result]);

  if (displayResult && viewMode === "continuation") {
    return <main className="shell journey"><a className="backLink" href="#" onClick={(event) => { event.preventDefault(); setViewMode("result"); }}>← Back to estimate details</a>
      <BorrowBetterContinuationFlow
        journey="comfortable_borrowing"
        step={trackStep}
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
    <InsightBlock title="1. What did we find?"><div className="metrics"><ResultMetric label="Estimated monthly commitment" value={currency(displayResult.estimated_new_monthly_commitment)} /><ResultMetric label="Total monthly commitment" value={currency(displayResult.total_monthly_commitment)} /><ResultMetric label="Commitment ratio" value={percent(displayResult.commitment_ratio)} /></div><p className="status">{borrowingStatusLabels[displayResult.comfort_status] ?? "Your result is ready"}</p></InsightBlock>
    <p className="status">Commitment ratio = (your existing monthly commitments + the proposed EMI) divided by your monthly income.</p>
    <InsightBlock title="2. Why does it matter?"><div className="reasonParagraphs">{displayResult.reason_codes.map((code, index) => <p key={`${code}-${index}`}>{reasonCodeLabels[code] ?? "Your income, commitments and requested amount affect this estimate."}</p>)}</div></InsightBlock>
    <InsightBlock title="3. What should I do next?"><div className="reasonParagraphs">{guidanceParagraphs(displayResult.next_best_action).map((line, index) => <p key={`${line}-${index}`}>{line}</p>)}</div></InsightBlock>
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
      <button className="primaryButton" disabled={interactionDisabled}>Update estimate</button>
      {whatIfError && <div className="errorState" role="alert"><p>{whatIfError}</p><button type="button" className="secondaryButton" onClick={() => { void runWhatIfRequest(); }} disabled={interactionDisabled}>Try again</button></div>}
    </form></section>
    {isStale && <p className="staleHint" role="status">Inputs changed. Update estimate before opening the next-step screens.</p>}
    <div className="buttonRow"><button type="button" className="primaryButton" disabled={interactionDisabled || !canOpenContinuation} onClick={() => { setTrackStep("reveal"); setViewMode("continuation"); }}>See what I could check next</button></div>
    {error && <ErrorState message={error} />}
  </main>;

  return <main className="shell journey"><a className="backLink" href="/">← Home</a><p className="eyebrow">Borrow Better</p><h1>Know what feels comfortable before you borrow.</h1><p className="lede">Answer a few questions for an initial estimate.</p>
    <form onSubmit={submit}><FinancialInput label="Monthly income" type="number" min="1" required value={form.monthly_income} onChange={set("monthly_income")} disabled={interactionDisabled} /><FinancialInput label="Existing monthly commitments" type="number" min="0" required value={form.existing_monthly_commitments} onChange={set("existing_monthly_commitments")} disabled={interactionDisabled} /><FinancialInput label="Desired borrowing amount" type="number" min="1" required value={form.desired_borrowing_amount} onChange={set("desired_borrowing_amount")} disabled={interactionDisabled} /><FinancialInput label="Desired tenure (months)" type="number" min="1" max="360" required value={form.desired_tenure_months} onChange={set("desired_tenure_months")} disabled={interactionDisabled} />
      <div className="formActions"><ExampleValuesButton disabled={interactionDisabled} onClick={() => { setExampleMode(true); setForm({ monthly_income: "100000", existing_monthly_commitments: "25000", desired_borrowing_amount: "500000", desired_tenure_months: "36" }); setWhatIf({ desired_borrowing_amount: "500000", desired_tenure_months: "36" }); setIsStale(true); }} /><button type="submit" className="primaryButton" disabled={interactionDisabled}>Check borrowing comfort</button></div>
    </form>{loading && <LoadingState />}{error && <ErrorState message={error} retry={() => setError("")} />}</main>;
}
