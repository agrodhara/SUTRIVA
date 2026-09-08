"use client";

import { FormEvent, useState } from "react";

interface MoneyValueCheckResult {
  policy_version: string;
  annual_spend: number;
  estimated_annual_rewards: number;
  annual_card_fee: number;
  estimated_annual_interest_cost: number;
  estimated_net_annual_value: number;
  value_status: string;
  reason_codes: string[];
  next_best_action: string;
  guidance_disclaimer: string;
  audit_event_id?: string;
}

const INITIAL_FORM = {
  monthly_card_spend: "",
  annual_card_fee: "",
  estimated_reward_rate_percent: "",
  revolving_balance: "0",
  annual_interest_rate_percent: "0"
};

export default function MoneyValuePage() {
  const [form, setForm] = useState(INITIAL_FORM);
  const [result, setResult] = useState<MoneyValueCheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function updateField(field: keyof typeof INITIAL_FORM, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";
      const response = await fetch(`${apiBaseUrl}/v1/financial-intelligence/money-value-check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          monthly_card_spend: Number(form.monthly_card_spend),
          annual_card_fee: Number(form.annual_card_fee),
          estimated_reward_rate_percent: Number(form.estimated_reward_rate_percent),
          revolving_balance: Number(form.revolving_balance || 0),
          annual_interest_rate_percent: Number(form.annual_interest_rate_percent || 0)
        })
      });
      if (!response.ok) {
        throw new Error("The money value check could not be completed. Please review your inputs and try again.");
      }
      setResult((await response.json()) as MoneyValueCheckResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="shell">
      <p className="eyebrow">Get More From My Money</p>
      <h1>Money Value Check</h1>
      <p className="lede">See whether your card is creating value or quietly costing you money.</p>

      <form className="form" onSubmit={handleSubmit}>
        <label className="field">
          <span>Monthly card spend</span>
          <input
            type="number"
            min="0"
            step="any"
            required
            value={form.monthly_card_spend}
            onChange={(event) => updateField("monthly_card_spend", event.target.value)}
          />
        </label>
        <label className="field">
          <span>Annual card fee</span>
          <input
            type="number"
            min="0"
            step="any"
            required
            value={form.annual_card_fee}
            onChange={(event) => updateField("annual_card_fee", event.target.value)}
          />
        </label>
        <label className="field">
          <span>Estimated reward rate %</span>
          <input
            type="number"
            min="0"
            step="any"
            required
            value={form.estimated_reward_rate_percent}
            onChange={(event) => updateField("estimated_reward_rate_percent", event.target.value)}
          />
        </label>
        <label className="field">
          <span>Revolving balance</span>
          <input
            type="number"
            min="0"
            step="any"
            value={form.revolving_balance}
            onChange={(event) => updateField("revolving_balance", event.target.value)}
          />
        </label>
        <label className="field">
          <span>Annual interest rate %</span>
          <input
            type="number"
            min="0"
            step="any"
            value={form.annual_interest_rate_percent}
            onChange={(event) => updateField("annual_interest_rate_percent", event.target.value)}
          />
        </label>
        <button className="primaryButton" type="submit" disabled={loading}>
          {loading ? "Checking…" : "Check money value"}
        </button>
      </form>

      {error ? <p className="errorText">{error}</p> : null}

      {result ? (
        <section className="resultCard" aria-label="Money value result">
          <p className="eyebrow">Result · {result.policy_version}</p>
          <dl className="resultGrid">
            <div>
              <dt>Annual spend</dt>
              <dd>{result.annual_spend}</dd>
            </div>
            <div>
              <dt>Estimated annual rewards</dt>
              <dd>{result.estimated_annual_rewards}</dd>
            </div>
            <div>
              <dt>Annual card fee</dt>
              <dd>{result.annual_card_fee}</dd>
            </div>
            <div>
              <dt>Estimated annual interest cost</dt>
              <dd>{result.estimated_annual_interest_cost}</dd>
            </div>
            <div>
              <dt>Estimated net annual value</dt>
              <dd>{result.estimated_net_annual_value}</dd>
            </div>
            <div>
              <dt>Value status</dt>
              <dd>{result.value_status}</dd>
            </div>
          </dl>
          <div>
            <h2>Reason codes</h2>
            <ul>
              {result.reason_codes.map((code) => (
                <li key={code}>{code}</li>
              ))}
            </ul>
          </div>
          <p>{result.next_best_action}</p>
          <p className="guardrail">{result.guidance_disclaimer}</p>
          {result.audit_event_id ? <p className="guardrail">Audit event: {result.audit_event_id}</p> : null}
        </section>
      ) : null}
    </main>
  );
}
