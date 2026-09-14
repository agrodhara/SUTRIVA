"use client";

import { ChangeEvent, FormEvent, useMemo, useState } from "react";
import { requireApiBaseUrl, trackEvent } from "../../lib/api";
import { currency, ErrorState, ExampleValuesButton, FinancialInput, InsightBlock, LoadingState, moneyValueStatusLabels, reasonCodeLabels, ResultMetric } from "../../components/QuickCheckUI";
import { MoneyValueContinuationFlow, Track11ContinuationStep, Track11ResultVariant } from "../../components/Track11Flow";

type Result = {
  estimated_annual_rewards: number;
  annual_card_fee: number;
  estimated_annual_interest_cost: number;
  estimated_net_annual_value: number;
  value_status: string;
  reason_codes: string[];
  next_best_action: string;
};

export default function MoneyValuePage() {
  const [form, setForm] = useState({ monthly_card_spend: "", annual_card_fee: "", estimated_reward_rate_percent: "", revolving_balance: "", annual_interest_rate_percent: "" });
  const [result, setResult] = useState<Result>();
  const [resultVariant, setResultVariant] = useState<Track11ResultVariant>("original");
  const [trackStep, setTrackStep] = useState<Track11ContinuationStep>("reveal");
  const [exampleMode, setExampleMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const set = (key: keyof typeof form) => (event: ChangeEvent<HTMLInputElement>) => { setExampleMode(false); setForm({ ...form, [key]: event.target.value }); };

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true); setError(""); trackEvent("check_started", "money_value");
    try {
      const response = await fetch(`${requireApiBaseUrl()}/v1/financial-intelligence/money-value-check`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          monthly_card_spend: Number(form.monthly_card_spend),
          annual_card_fee: Number(form.annual_card_fee),
          estimated_reward_rate_percent: Number(form.estimated_reward_rate_percent),
          revolving_balance: Number(form.revolving_balance || 0),
          annual_interest_rate_percent: Number(form.annual_interest_rate_percent || 0),
        }),
      });
      if (!response.ok) throw new Error("We couldn’t complete your money value check. Please check your inputs.");
      setResult(await response.json()); setResultVariant("original"); setTrackStep("reveal"); trackEvent("check_completed", "money_value");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally { setLoading(false); }
  }

  async function runWhatIf(event: FormEvent) {
    event.preventDefault(); setLoading(true); setError("");
    trackEvent("what_if_started", "money_value");
    try {
      const response = await fetch(`${requireApiBaseUrl()}/v1/financial-intelligence/money-value-check`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ monthly_card_spend: Number(form.monthly_card_spend), annual_card_fee: Number(form.annual_card_fee), estimated_reward_rate_percent: Number(form.estimated_reward_rate_percent), revolving_balance: Number(form.revolving_balance || 0), annual_interest_rate_percent: Number(form.annual_interest_rate_percent || 0) }) });
      if (!response.ok) throw new Error("We couldn’t update this what-if estimate.");
      setResult(await response.json()); setResultVariant("what_if"); setTrackStep("reveal"); trackEvent("what_if_completed", "money_value");
    } catch (err) { setError(err instanceof Error ? err.message : "Something went wrong."); } finally { setLoading(false); }
  }
  const displayResult = useMemo(() => result, [result]);

  if (displayResult) return <main className="shell journey"><a className="backLink" href="/money-value">← Update details</a><p className="eyebrow">Get More From My Money</p><h1>Your money value check</h1><p className="estimateLabel">{exampleMode ? "Example preview" : "Your estimate"}</p>
    <InsightBlock title="1. What did we find?"><div className="metrics">
      <ResultMetric label="Estimated annual rewards" value={currency(displayResult.estimated_annual_rewards)} /><ResultMetric label="Annual fee" value={currency(displayResult.annual_card_fee)} />
      <ResultMetric label="Estimated annual interest cost" value={currency(displayResult.estimated_annual_interest_cost)} /><ResultMetric label="Estimated net annual value" value={currency(displayResult.estimated_net_annual_value)} />
    </div><p className="status">{moneyValueStatusLabels[displayResult.value_status] ?? "Your money value result is ready"}</p></InsightBlock>
    <InsightBlock title="2. Why does it matter?"><p>{displayResult.reason_codes.map((code) => reasonCodeLabels[code] ?? "One or more costs may be affecting the value you receive.").join(" ")}</p></InsightBlock>
    <InsightBlock title="3. What should I do next?"><p>{displayResult.next_best_action}</p></InsightBlock>
    <section className="whatIfCard"><h2>Want to see what could improve this?</h2><p>Adjust only the information you already entered.</p><form onSubmit={runWhatIf}><FinancialInput label="Annual card fee" type="number" min="0" required value={form.annual_card_fee} onChange={set("annual_card_fee")} /><FinancialInput label="Estimated reward rate %" type="number" min="0" required value={form.estimated_reward_rate_percent} onChange={set("estimated_reward_rate_percent")} /><FinancialInput label="Revolving balance" type="number" min="0" required value={form.revolving_balance} onChange={set("revolving_balance")} /><FinancialInput label="Annual interest rate %" type="number" min="0" required value={form.annual_interest_rate_percent} onChange={set("annual_interest_rate_percent")} /><button className="primaryButton" disabled={loading}>Update estimate</button></form></section>
    {error && <ErrorState message={error} />}
    <MoneyValueContinuationFlow
      journey="money_value"
      step={trackStep}
      resultVariant={resultVariant}
      onNavigate={setTrackStep}
      onReturnToResult={() => setTrackStep("reveal")}
      netAnnualValue={currency(displayResult.estimated_net_annual_value)}
    />
  </main>;

  return <main className="shell journey"><a className="backLink" href="/">← Home</a><p className="eyebrow">Get More From My Money</p><h1>See what your card use is worth.</h1><p className="lede">Answer a few questions for an initial estimate.</p>
    <form onSubmit={submit}><FinancialInput label="Monthly card spend" type="number" min="0" required value={form.monthly_card_spend} onChange={set("monthly_card_spend")} /><FinancialInput label="Annual card fee" type="number" min="0" required value={form.annual_card_fee} onChange={set("annual_card_fee")} /><FinancialInput label="Estimated reward rate %" type="number" min="0" step="0.1" required value={form.estimated_reward_rate_percent} onChange={set("estimated_reward_rate_percent")} /><FinancialInput label="Revolving balance" optional type="number" min="0" value={form.revolving_balance} onChange={set("revolving_balance")} /><FinancialInput label="Annual interest rate %" optional type="number" min="0" value={form.annual_interest_rate_percent} onChange={set("annual_interest_rate_percent")} />
      <div className="formActions"><ExampleValuesButton onClick={() => { setExampleMode(true); setForm({ monthly_card_spend: "75000", annual_card_fee: "4000", estimated_reward_rate_percent: "1.2", revolving_balance: "0", annual_interest_rate_percent: "0" }); }} /><button type="submit" className="primaryButton" disabled={loading}>Check my money value</button></div>
    </form>{loading && <LoadingState />}{error && <ErrorState message={error} retry={() => setError("")} />}</main>;
}
