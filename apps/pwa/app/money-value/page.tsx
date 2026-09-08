"use client";

import { FormEvent, useState } from "react";
import { API_BASE_URL, trackEvent } from "../../lib/api";

type MoneyValueResult = {
  estimated_annual_rewards: number;
  estimated_annual_interest_cost: number;
  estimated_annual_subscription_leakage: number;
  estimated_net_value: number;
  flags: string[];
  explanation: string;
};

const initialForm = {
  monthly_card_spend: "50000",
  annual_card_fee: "1500",
  reward_rate_percent: "1.5",
  revolving_balance: "0",
  revolving_interest_rate_pa: "0.36",
  unused_subscription_cost_monthly: "0",
};

export default function MoneyValuePage() {
  const [form, setForm] = useState(initialForm);
  const [result, setResult] = useState<MoneyValueResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function updateField(field: keyof typeof initialForm) {
    return (event: React.ChangeEvent<HTMLInputElement>) => {
      setForm((current) => ({ ...current, [field]: event.target.value }));
    };
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    trackEvent("check_started", "money_value");

    try {
      const response = await fetch(`${API_BASE_URL}/v1/money-value/quick-check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          monthly_card_spend: Number(form.monthly_card_spend),
          annual_card_fee: Number(form.annual_card_fee),
          reward_rate_percent: Number(form.reward_rate_percent),
          revolving_balance: Number(form.revolving_balance),
          revolving_interest_rate_pa: Number(form.revolving_interest_rate_pa),
          unused_subscription_cost_monthly: Number(form.unused_subscription_cost_monthly),
        }),
      });

      if (!response.ok) {
        throw new Error("The quick check could not be completed. Please check your inputs.");
      }

      const body = (await response.json()) as MoneyValueResult;
      setResult(body);
      trackEvent("check_completed", "money_value");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="shell">
      <p className="eyebrow">Get More From My Money</p>
      <h1>Find where money value is leaking.</h1>
      <p className="lede">
        See whether your current card usage is creating value or quietly costing you money.
      </p>

      <form className="checkForm" onSubmit={handleSubmit}>
        <label>
          Monthly card spend (₹)
          <input type="number" min="0" step="1" value={form.monthly_card_spend} onChange={updateField("monthly_card_spend")} required />
        </label>
        <label>
          Annual card fee (₹)
          <input type="number" min="0" step="1" value={form.annual_card_fee} onChange={updateField("annual_card_fee")} required />
        </label>
        <label>
          Reward rate (%)
          <input type="number" min="0" max="20" step="0.1" value={form.reward_rate_percent} onChange={updateField("reward_rate_percent")} required />
        </label>
        <label>
          Revolving balance (₹)
          <input type="number" min="0" step="1" value={form.revolving_balance} onChange={updateField("revolving_balance")} required />
        </label>
        <label>
          Revolving interest rate (annual, e.g. 0.36 = 36%)
          <input type="number" min="0" max="1" step="0.01" value={form.revolving_interest_rate_pa} onChange={updateField("revolving_interest_rate_pa")} required />
        </label>
        <label>
          Unused subscriptions per month (₹)
          <input type="number" min="0" step="1" value={form.unused_subscription_cost_monthly} onChange={updateField("unused_subscription_cost_monthly")} required />
        </label>

        <button type="submit" disabled={loading}>
          {loading ? "Checking…" : "Check my money value"}
        </button>
      </form>

      {error && <p className="errorText">{error}</p>}

      {result && (
        <section className="resultCard" aria-label="Money value result">
          <h2>Your estimated net value</h2>
          <p className="resultHeadline">₹{result.estimated_net_value.toLocaleString("en-IN")}/year</p>
          <ul>
            <li>Estimated annual rewards: ₹{result.estimated_annual_rewards.toLocaleString("en-IN")}</li>
            <li>Estimated annual interest cost: ₹{result.estimated_annual_interest_cost.toLocaleString("en-IN")}</li>
            <li>Estimated annual subscription leakage: ₹{result.estimated_annual_subscription_leakage.toLocaleString("en-IN")}</li>
          </ul>
          {result.flags.length > 0 && (
            <ul className="flags">
              {result.flags.map((flag) => (
                <li key={flag}>{flag}</li>
              ))}
            </ul>
          )}
          <p className="explanation">{result.explanation}</p>
          <p className="disclaimer">
            Indicative estimate based on user-declared inputs. Not financial advice or a product offer.
          </p>
          <a className="goDeeperCta" href="/go-deeper?journey=money_value">
            Go deeper →
          </a>
        </section>
      )}
    </main>
  );
}
