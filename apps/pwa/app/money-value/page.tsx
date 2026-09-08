"use client";

import { ChangeEvent, FormEvent, useState } from "react";
import { API_BASE_URL, trackEvent } from "../../lib/api";
import { currency, ErrorState, ExampleValuesButton, FinancialInput, GoDeeperCTA, InsightBlock, LoadingState, ResultMetric } from "../../components/QuickCheckUI";

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const set = (key: keyof typeof form) => (event: ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: event.target.value });

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true); setError(""); trackEvent("check_started", "money_value");
    try {
      const response = await fetch(`${API_BASE_URL}/v1/financial-intelligence/money-value-check`, {
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
      setResult(await response.json()); trackEvent("check_completed", "money_value");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally { setLoading(false); }
  }

  if (result) return <main className="shell journey"><a className="backLink" href="/money-value">← Update details</a><p className="eyebrow">Get More From My Money</p><h1>Your money value check</h1>
    <InsightBlock title="1. What did we find?"><div className="metrics">
      <ResultMetric label="Estimated annual rewards" value={currency(result.estimated_annual_rewards)} /><ResultMetric label="Annual fee" value={currency(result.annual_card_fee)} />
      <ResultMetric label="Estimated annual interest cost" value={currency(result.estimated_annual_interest_cost)} /><ResultMetric label="Estimated net annual value" value={currency(result.estimated_net_annual_value)} />
    </div><p className="status">{result.value_status}</p></InsightBlock>
    <InsightBlock title="2. Why does it matter?"><p>{result.reason_codes.join(". ")}</p></InsightBlock>
    <InsightBlock title="3. What should I do next?"><p>{result.next_best_action}</p><GoDeeperCTA journey="money_value" /></InsightBlock></main>;

  return <main className="shell journey"><a className="backLink" href="/">← Home</a><p className="eyebrow">Get More From My Money</p><h1>See what your card use is worth.</h1><p className="lede">Answer a few questions for an initial estimate.</p>
    <form onSubmit={submit}><FinancialInput label="Monthly card spend" type="number" min="0" required value={form.monthly_card_spend} onChange={set("monthly_card_spend")} /><FinancialInput label="Annual card fee" type="number" min="0" required value={form.annual_card_fee} onChange={set("annual_card_fee")} /><FinancialInput label="Estimated reward rate %" type="number" min="0" step="0.1" required value={form.estimated_reward_rate_percent} onChange={set("estimated_reward_rate_percent")} /><FinancialInput label="Revolving balance" optional type="number" min="0" value={form.revolving_balance} onChange={set("revolving_balance")} /><FinancialInput label="Annual interest rate %" optional type="number" min="0" value={form.annual_interest_rate_percent} onChange={set("annual_interest_rate_percent")} />
      <div className="formActions"><ExampleValuesButton onClick={() => setForm({ monthly_card_spend: "75000", annual_card_fee: "4000", estimated_reward_rate_percent: "1.2", revolving_balance: "0", annual_interest_rate_percent: "0" })} /><button type="submit" className="primaryButton" disabled={loading}>Check my money value</button></div>
    </form>{loading && <LoadingState />}{error && <ErrorState message={error} retry={() => setError("")} />}</main>;
}
