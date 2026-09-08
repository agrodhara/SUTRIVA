"use client";

import { ChangeEvent, FormEvent, useState } from "react";
import { currency, ErrorState, ExampleValuesButton, FinancialInput, GoDeeperCTA, InsightBlock, LoadingState, ResultMetric } from "../../components/QuickCheckUI";

type Result = { estimated_annual_rewards: number; estimated_annual_interest_cost: number; estimated_net_value: number; flags: string[]; explanation: string };
const API = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";
const flagCopy: Record<string, string> = {
  INTEREST_COST_EXCEEDS_REWARDS: "Interest costs are greater than the rewards estimated from this card use.",
  FEE_EXCEEDS_REWARDS: "The annual fee is greater than the rewards estimated from this card use.",
  SUBSCRIPTION_LEAKAGE: "Recurring costs included in the check reduce your card's overall value."
};

export default function MoneyValuePage() {
  const [form, setForm] = useState({ monthly_card_spend: "", annual_card_fee: "", reward_rate_percent: "", revolving_balance: "", revolving_interest_rate_pa: "" });
  const [result, setResult] = useState<Result>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const set = (key: keyof typeof form) => (event: ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: event.target.value });
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setLoading(true); setError("");
    try {
      const response = await fetch(`${API}/v1/money-value/quick-check`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        monthly_card_spend: Number(form.monthly_card_spend), annual_card_fee: Number(form.annual_card_fee),
        reward_rate_percent: Number(form.reward_rate_percent), revolving_balance: Number(form.revolving_balance || 0),
        revolving_interest_rate_pa: Number(form.revolving_interest_rate_pa || 0)
      }) });
      if (!response.ok) throw new Error();
      setResult(await response.json());
    } catch { setError("We couldn’t complete your money value check. Please try again or return home."); }
    finally { setLoading(false); }
  };
  if (result) return <main className="shell journey"><a className="backLink" href="/money-value">← Update details</a><p className="eyebrow">Get More From My Money</p><h1>Your money value check</h1>
    <InsightBlock title="1. What did we find?"><div className="metrics">
      <ResultMetric label="Estimated annual rewards" value={currency(result.estimated_annual_rewards)} /><ResultMetric label="Annual fee" value={currency(Number(form.annual_card_fee))} />
      <ResultMetric label="Estimated annual interest cost" value={currency(result.estimated_annual_interest_cost)} /><ResultMetric label="Estimated net annual value" value={currency(result.estimated_net_value)} />
    </div><p className="status positive">Initial value estimate</p></InsightBlock>
    <InsightBlock title="2. Why does it matter?"><p>{result.explanation}</p>{result.flags.length > 0 && <ul>{result.flags.map(flag => <li key={flag}>{flagCopy[flag] ?? "One or more costs may be reducing the value you receive."}</li>)}</ul>}</InsightBlock>
    <InsightBlock title="3. What should I do next?"><p>{result.explanation}</p><GoDeeperCTA /></InsightBlock></main>;
  return <main className="shell journey"><a className="backLink" href="/">← Home</a><p className="eyebrow">Get More From My Money</p><h1>See what your card use is worth.</h1><p className="lede">Answer a few questions for an initial estimate.</p>
    <form onSubmit={submit}><FinancialInput label="Monthly card spend" type="number" min="0" required value={form.monthly_card_spend} onChange={set("monthly_card_spend")} /><FinancialInput label="Annual card fee" type="number" min="0" required value={form.annual_card_fee} onChange={set("annual_card_fee")} /><FinancialInput label="Estimated reward rate %" type="number" min="0" step="0.1" required value={form.reward_rate_percent} onChange={set("reward_rate_percent")} /><FinancialInput label="Revolving balance" optional type="number" min="0" value={form.revolving_balance} onChange={set("revolving_balance")} />
      {Number(form.revolving_balance) > 0 && <FinancialInput label="Annual interest rate %" type="number" min="0" max="100" step="0.1" required value={form.revolving_interest_rate_pa} onChange={set("revolving_interest_rate_pa")} />}
      <div className="formActions"><ExampleValuesButton onClick={() => setForm({ monthly_card_spend: "75000", annual_card_fee: "4000", reward_rate_percent: "1.2", revolving_balance: "0", revolving_interest_rate_pa: "" })} /><button type="submit" className="primaryButton" disabled={loading}>Check my money value</button></div>
    </form>{loading && <LoadingState />}{error && <ErrorState message={error} retry={() => setError("")} />}</main>;
}
  return (
    <main className="shell">
      <p className="eyebrow">Get More From My Money</p>
      <h1>Find where money value is leaking.</h1>
      <p className="lede">This page will call the FastAPI quick-check endpoint for rewards, fees, subscriptions and interest leakage.</p>
    </main>
  );
}
