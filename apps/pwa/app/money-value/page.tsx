"use client";

import { ChangeEvent, FormEvent, useMemo, useState } from "react";
import { requireApiBaseUrl, trackEvent } from "../../lib/api";
import { currency, ErrorState, ExampleValuesButton, FinancialInput, InsightBlock, LoadingState, moneyValueStatusLabels, reasonCodeLabels, ResultMetric } from "../../components/QuickCheckUI";
import { MoneyValueContinuationFlow, Track11ContinuationStep, Track11ResultVariant } from "../../components/Track11Flow";

type RewardType = "cashback" | "points" | "miles" | "not_sure";
type RewardInputBasis = "rate_percent" | "cashback_amount" | "earned_units";

type Result = {
  estimated_annual_rewards: number | null;
  annual_card_fee: number;
  estimated_annual_interest_cost: number;
  estimated_net_annual_value: number | null;
  reward_value_known: boolean;
  unknown_value_reason?: string | null;
  value_status: string;
  reason_codes: string[];
  next_best_action: string;
};

type ViewMode = "result" | "continuation";

type FormState = {
  monthly_card_spend: string;
  annual_card_fee: string;
  estimated_reward_rate_percent: string;
  reward_type: RewardType;
  reward_input_basis: RewardInputBasis;
  reward_period: string;
  cashback_amount: string;
  reward_units_earned: string;
  rupee_value_per_reward_unit: string;
  reward_value_unknown: boolean;
  revolving_balance: string;
  annual_interest_rate_percent: string;
};

type FormTextKey = Exclude<keyof FormState, "reward_value_unknown">;

function guidanceParagraphs(text: string): string[] {
  return text
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);
}

export default function MoneyValuePage() {
  const [form, setForm] = useState<FormState>({
    monthly_card_spend: "",
    annual_card_fee: "",
    estimated_reward_rate_percent: "",
    reward_type: "cashback" as RewardType,
    reward_input_basis: "rate_percent" as RewardInputBasis,
    reward_period: "monthly",
    cashback_amount: "",
    reward_units_earned: "",
    rupee_value_per_reward_unit: "",
    reward_value_unknown: false,
    revolving_balance: "",
    annual_interest_rate_percent: "",
  });
  const [result, setResult] = useState<Result>();
  const [resultVariant, setResultVariant] = useState<Track11ResultVariant>("original");
  const [trackStep, setTrackStep] = useState<Track11ContinuationStep>("reveal");
  const [viewMode, setViewMode] = useState<ViewMode>("result");
  const [isStale, setIsStale] = useState(false);
  const [exampleMode, setExampleMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const set = (key: FormTextKey) => (event: ChangeEvent<HTMLInputElement>) => {
    setExampleMode(false);
    setIsStale(true);
    setForm({ ...form, [key]: event.target.value });
  };

  const setSelect = (key: FormTextKey) => (event: ChangeEvent<HTMLSelectElement>) => {
    setExampleMode(false);
    setIsStale(true);
    setForm({ ...form, [key]: event.target.value });
  };

  const setRewardType = (rewardType: RewardType) => {
    setExampleMode(false);
    setIsStale(true);
    setForm((previous) => ({
      ...previous,
      reward_type: rewardType,
      reward_input_basis:
        rewardType === "cashback" ? "rate_percent" : rewardType === "not_sure" ? previous.reward_input_basis : "earned_units",
      reward_value_unknown: rewardType === "not_sure" ? true : previous.reward_value_unknown,
    }));
  };

  const buildPayload = () => {
    const payload: Record<string, unknown> = {
      monthly_card_spend: Number(form.monthly_card_spend),
      annual_card_fee: Number(form.annual_card_fee),
      reward_type: form.reward_type,
      revolving_balance: Number(form.revolving_balance || 0),
      annual_interest_rate_percent: Number(form.annual_interest_rate_percent || 0),
    };

    if (form.reward_type === "not_sure") {
      payload.reward_value_unknown = true;
      return payload;
    }

    payload.reward_input_basis = form.reward_input_basis;

    if (form.reward_input_basis === "rate_percent") {
      payload.estimated_reward_rate_percent = Number(form.estimated_reward_rate_percent);
    }

    if (form.reward_input_basis === "cashback_amount") {
      payload.cashback_amount = Number(form.cashback_amount);
      payload.reward_period = form.reward_period;
    }

    if (form.reward_input_basis === "earned_units") {
      payload.reward_units_earned = Number(form.reward_units_earned);
      payload.reward_period = form.reward_period;
      payload.reward_value_unknown = form.reward_value_unknown;
      if (!form.reward_value_unknown) {
        payload.rupee_value_per_reward_unit = Number(form.rupee_value_per_reward_unit);
      }
    }

    return payload;
  };

  const canOpenContinuation = !!result && !isStale && !error;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true); setError(""); trackEvent("check_started", "money_value");
    try {
      const response = await fetch(`${requireApiBaseUrl()}/v1/financial-intelligence/money-value-check`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload()),
      });
      if (!response.ok) throw new Error("We couldn’t complete your money value check. Please check your inputs.");
      setResult(await response.json());
      setResultVariant("original");
      setTrackStep("reveal");
      setViewMode("result");
      setIsStale(false);
      trackEvent("check_completed", "money_value");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally { setLoading(false); }
  }

  async function runWhatIf(event: FormEvent) {
    event.preventDefault(); setLoading(true); setError("");
    trackEvent("what_if_started", "money_value");
    try {
      const response = await fetch(`${requireApiBaseUrl()}/v1/financial-intelligence/money-value-check`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(buildPayload()) });
      if (!response.ok) throw new Error("We couldn’t update this what-if estimate.");
      setResult(await response.json());
      setResultVariant("what_if");
      setTrackStep("reveal");
      setViewMode("result");
      setIsStale(false);
      trackEvent("what_if_completed", "money_value");
    } catch (err) { setError(err instanceof Error ? err.message : "Something went wrong."); } finally { setLoading(false); }
  }
  const displayResult = useMemo(() => result, [result]);

  const formatCurrencyMaybe = (value: number | null, reason?: string | null) => {
    if (value !== null) return currency(value);
    if (reason === "REWARD_VALUE_UNKNOWN") return "Unknown until reward value is provided";
    if (reason === "REWARD_CONVERSION_UNKNOWN") return "Unknown until rupee value per point/mile is provided";
    return "Unknown until reward details are completed";
  };

  if (displayResult && viewMode === "continuation") {
    return <main className="shell journey"><a className="backLink" href="#" onClick={(event) => { event.preventDefault(); setViewMode("result"); }}>← Back to estimate details</a>
      <MoneyValueContinuationFlow
        journey="money_value"
        step={trackStep}
        resultVariant={resultVariant}
        returnLabel="← Back to estimate details"
        onNavigate={setTrackStep}
        onReturnToResult={() => setViewMode("result")}
        netAnnualValue={formatCurrencyMaybe(displayResult.estimated_net_annual_value, displayResult.unknown_value_reason)}
      />
    </main>;
  }

  if (displayResult) return <main className="shell journey"><a className="backLink" href="/money-value">← Update details</a><p className="eyebrow">Get More From My Money</p><h1>Your money value check</h1><p className="estimateLabel">{exampleMode ? "Example preview" : "Your estimate"}</p>
    <InsightBlock title="1. What did we find?"><div className="metrics">
      <ResultMetric label="Estimated annual rewards" value={formatCurrencyMaybe(displayResult.estimated_annual_rewards)} /><ResultMetric label="Annual fee" value={currency(displayResult.annual_card_fee)} />
      <ResultMetric label="Estimated annual interest cost" value={currency(displayResult.estimated_annual_interest_cost)} /><ResultMetric label="Estimated net annual value" value={formatCurrencyMaybe(displayResult.estimated_net_annual_value, displayResult.unknown_value_reason)} />
    </div><p className="status">{moneyValueStatusLabels[displayResult.value_status] ?? "Your money value result is ready"}</p></InsightBlock>
    <InsightBlock title="2. Why does it matter?"><div className="reasonParagraphs">{displayResult.reason_codes.map((code, index) => <p key={`${code}-${index}`}>{reasonCodeLabels[code] ?? "One or more costs may be affecting the value you receive."}</p>)}</div></InsightBlock>
    <InsightBlock title="3. What should I do next?"><div className="reasonParagraphs">{guidanceParagraphs(displayResult.next_best_action).map((line, index) => <p key={`${line}-${index}`}>{line}</p>)}</div></InsightBlock>
    <section className="whatIfCard"><h2>Want to see what could improve this?</h2><p>Adjust only the information you already entered.</p><form onSubmit={runWhatIf}><FinancialInput label="Monthly card spend" type="number" min="0" required value={form.monthly_card_spend} onChange={set("monthly_card_spend")} /><FinancialInput label="Annual card fee" type="number" min="0" required value={form.annual_card_fee} onChange={set("annual_card_fee")} />
      {form.reward_type === "cashback" && form.reward_input_basis === "rate_percent" && <FinancialInput label="Estimated reward rate %" type="number" min="0" step="0.1" required value={form.estimated_reward_rate_percent} onChange={set("estimated_reward_rate_percent")} />}
      {form.reward_type === "cashback" && form.reward_input_basis === "cashback_amount" && <FinancialInput label="Cashback amount" type="number" min="0" required value={form.cashback_amount} onChange={set("cashback_amount")} />}
      {form.reward_type !== "cashback" && form.reward_type !== "not_sure" && <FinancialInput label={form.reward_type === "points" ? "Points earned" : "Miles earned"} type="number" min="0" required value={form.reward_units_earned} onChange={set("reward_units_earned")} />}
      {form.reward_type !== "not_sure" && form.reward_input_basis !== "rate_percent" && <label className="field"><span>Reward period</span><select className="selectInput" value={form.reward_period} onChange={setSelect("reward_period")}><option value="monthly">Monthly</option><option value="yearly">Yearly</option></select></label>}
      {form.reward_type !== "cashback" && form.reward_type !== "not_sure" && !form.reward_value_unknown && <FinancialInput label="Rupee value per point/mile" type="number" min="0.01" step="0.01" required value={form.rupee_value_per_reward_unit} onChange={set("rupee_value_per_reward_unit")} />}
      {form.reward_type !== "cashback" && form.reward_type !== "not_sure" && <label className="checkRow"><input type="checkbox" checked={form.reward_value_unknown} onChange={(event) => { setIsStale(true); setForm({ ...form, reward_value_unknown: event.target.checked }); }} />I do not know the rupee value per point/mile yet</label>}
      <FinancialInput label="Revolving balance" type="number" min="0" required value={form.revolving_balance} onChange={set("revolving_balance")} /><FinancialInput label="Annual interest rate %" type="number" min="0" required value={form.annual_interest_rate_percent} onChange={set("annual_interest_rate_percent")} /><button className="primaryButton" disabled={loading}>Update estimate</button></form></section>
    {isStale && <p className="staleHint" role="status">Inputs changed. Update estimate before opening the next-step screens.</p>}
    <div className="buttonRow"><button type="button" className="primaryButton" disabled={!canOpenContinuation} onClick={() => { setTrackStep("reveal"); setViewMode("continuation"); }}>See what I could check next</button></div>
    {error && <ErrorState message={error} />}
  </main>;

  return <main className="shell journey"><a className="backLink" href="/">← Home</a><p className="eyebrow">Get More From My Money</p><h1>See what your card use is worth.</h1><p className="lede">Answer a few questions for an initial estimate.</p>
    <form onSubmit={submit}><FinancialInput label="Monthly card spend" type="number" min="0" required value={form.monthly_card_spend} onChange={set("monthly_card_spend")} /><FinancialInput label="Annual card fee" type="number" min="0" required value={form.annual_card_fee} onChange={set("annual_card_fee")} />
      <section className="rewardChooser"><h2>How does your card reward you?</h2><div className="rewardChooserGrid">
        <button type="button" className={`rewardOption${form.reward_type === "cashback" ? " isSelected" : ""}`} onClick={() => setRewardType("cashback")}>Cashback</button>
        <button type="button" className={`rewardOption${form.reward_type === "points" ? " isSelected" : ""}`} onClick={() => setRewardType("points")}>Points</button>
        <button type="button" className={`rewardOption${form.reward_type === "miles" ? " isSelected" : ""}`} onClick={() => setRewardType("miles")}>Miles</button>
        <button type="button" className={`rewardOption${form.reward_type === "not_sure" ? " isSelected" : ""}`} onClick={() => setRewardType("not_sure")}>I am not sure</button>
      </div></section>
      {form.reward_type === "cashback" && <label className="field"><span>Cashback input type</span><select className="selectInput" value={form.reward_input_basis} onChange={setSelect("reward_input_basis")}><option value="rate_percent">Estimated reward rate (%)</option><option value="cashback_amount">Known cashback amount</option></select></label>}
      {form.reward_type === "cashback" && form.reward_input_basis === "rate_percent" && <FinancialInput label="Estimated reward rate %" type="number" min="0" step="0.1" required value={form.estimated_reward_rate_percent} onChange={set("estimated_reward_rate_percent")} />}
      {form.reward_type === "cashback" && form.reward_input_basis === "cashback_amount" && <FinancialInput label="Cashback amount" type="number" min="0" required value={form.cashback_amount} onChange={set("cashback_amount")} />}
      {form.reward_type === "cashback" && form.reward_input_basis === "cashback_amount" && <label className="field"><span>Cashback period</span><select className="selectInput" value={form.reward_period} onChange={setSelect("reward_period")}><option value="monthly">Monthly</option><option value="yearly">Yearly</option></select></label>}
      {form.reward_type !== "cashback" && form.reward_type !== "not_sure" && <FinancialInput label={form.reward_type === "points" ? "Points earned" : "Miles earned"} type="number" min="0" required value={form.reward_units_earned} onChange={set("reward_units_earned")} />}
      {form.reward_type !== "cashback" && form.reward_type !== "not_sure" && <label className="field"><span>Points/miles period</span><select className="selectInput" value={form.reward_period} onChange={setSelect("reward_period")}><option value="monthly">Monthly</option><option value="yearly">Yearly</option></select></label>}
      {form.reward_type !== "cashback" && form.reward_type !== "not_sure" && !form.reward_value_unknown && <FinancialInput label="Rupee value per point/mile" type="number" min="0.01" step="0.01" required value={form.rupee_value_per_reward_unit} onChange={set("rupee_value_per_reward_unit")} />}
      {form.reward_type !== "cashback" && form.reward_type !== "not_sure" && <label className="checkRow"><input type="checkbox" checked={form.reward_value_unknown} onChange={(event) => { setIsStale(true); setForm({ ...form, reward_value_unknown: event.target.checked }); }} />I do not know the rupee value per point/mile yet</label>}
      <FinancialInput label="Revolving balance" optional type="number" min="0" value={form.revolving_balance} onChange={set("revolving_balance")} /><FinancialInput label="Annual interest rate %" optional type="number" min="0" value={form.annual_interest_rate_percent} onChange={set("annual_interest_rate_percent")} />
      <div className="formActions"><ExampleValuesButton onClick={() => { setExampleMode(true); setForm({ monthly_card_spend: "75000", annual_card_fee: "4000", estimated_reward_rate_percent: "1.2", reward_type: "cashback", reward_input_basis: "rate_percent", reward_period: "monthly", cashback_amount: "", reward_units_earned: "", rupee_value_per_reward_unit: "", reward_value_unknown: false, revolving_balance: "0", annual_interest_rate_percent: "0" }); setIsStale(true); }} /><button type="submit" className="primaryButton" disabled={loading}>Check my money value</button></div>
    </form>{loading && <LoadingState />}{error && <ErrorState message={error} retry={() => setError("")} />}</main>;
}
