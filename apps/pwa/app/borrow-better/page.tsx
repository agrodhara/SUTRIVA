"use client";

import { FormEvent, useState } from "react";
import { API_BASE_URL, trackEvent } from "../../lib/api";

type BorrowBetterResult = {
  policy_version: string;
  decision: string;
  estimated_emi: number;
  foir_after_new_emi: number;
  post_emi_surplus: number;
  comfortable_emi_upper_bound: number;
  comfortable_borrowing_range_low: number;
  comfortable_borrowing_range_high: number;
  reason_codes: string[];
  explanation: string;
};

const initialForm = {
  declared_monthly_income: "100000",
  existing_monthly_emi: "20000",
  requested_loan_amount: "500000",
  requested_tenor_months: "36",
  indicative_interest_rate_pa: "0.14",
  monthly_non_emi_commitments: "15000",
};

export default function BorrowBetterPage() {
  const [form, setForm] = useState(initialForm);
  const [result, setResult] = useState<BorrowBetterResult | null>(null);
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
    trackEvent("check_started", "comfortable_borrowing");

    try {
      const response = await fetch(`${API_BASE_URL}/v1/borrowing-intelligence/comfortable-borrowing-check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          declared_monthly_income: Number(form.declared_monthly_income),
          existing_monthly_emi: Number(form.existing_monthly_emi),
          requested_loan_amount: Number(form.requested_loan_amount),
          requested_tenor_months: Number(form.requested_tenor_months),
          indicative_interest_rate_pa: Number(form.indicative_interest_rate_pa),
          monthly_non_emi_commitments: Number(form.monthly_non_emi_commitments),
          income_verified: false,
        }),
      });

      if (!response.ok) {
        throw new Error("The quick check could not be completed. Please check your inputs.");
      }

      const body = (await response.json()) as BorrowBetterResult;
      setResult(body);
      trackEvent("check_completed", "comfortable_borrowing");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="shell">
      <p className="eyebrow">Borrow Better</p>
      <h1>Know what is comfortable before you borrow.</h1>
      <p className="lede">
        Check whether a desired borrowing amount looks comfortable for your monthly cash flow.
      </p>

      <form className="checkForm" onSubmit={handleSubmit}>
        <label>
          Declared monthly income (₹)
          <input type="number" min="1" step="1" value={form.declared_monthly_income} onChange={updateField("declared_monthly_income")} required />
        </label>
        <label>
          Existing monthly EMI (₹)
          <input type="number" min="0" step="1" value={form.existing_monthly_emi} onChange={updateField("existing_monthly_emi")} required />
        </label>
        <label>
          Requested loan amount (₹)
          <input type="number" min="1" step="1" value={form.requested_loan_amount} onChange={updateField("requested_loan_amount")} required />
        </label>
        <label>
          Requested tenor (months)
          <input type="number" min="1" max="360" step="1" value={form.requested_tenor_months} onChange={updateField("requested_tenor_months")} required />
        </label>
        <label>
          Indicative interest rate (annual, e.g. 0.14 = 14%)
          <input type="number" min="0" max="1" step="0.01" value={form.indicative_interest_rate_pa} onChange={updateField("indicative_interest_rate_pa")} required />
        </label>
        <label>
          Other monthly commitments (₹)
          <input type="number" min="0" step="1" value={form.monthly_non_emi_commitments} onChange={updateField("monthly_non_emi_commitments")} required />
        </label>

        <button type="submit" disabled={loading}>
          {loading ? "Checking…" : "Check borrowing comfort"}
        </button>
      </form>

      {error && <p className="errorText">{error}</p>}

      {result && (
        <section className="resultCard" aria-label="Borrow better result">
          <h2>Decision: {result.decision}</h2>
          <p className="resultHeadline">Estimated EMI: ₹{result.estimated_emi.toLocaleString("en-IN")}</p>
          <ul>
            <li>Comfortable EMI upper bound: ₹{result.comfortable_emi_upper_bound.toLocaleString("en-IN")}</li>
            <li>
              Comfortable borrowing range: ₹{result.comfortable_borrowing_range_low.toLocaleString("en-IN")} – ₹
              {result.comfortable_borrowing_range_high.toLocaleString("en-IN")}
            </li>
            <li>FOIR after new EMI: {(result.foir_after_new_emi * 100).toFixed(1)}%</li>
            <li>Post-EMI monthly surplus: ₹{result.post_emi_surplus.toLocaleString("en-IN")}</li>
          </ul>
          {result.reason_codes.length > 0 && (
            <ul className="flags">
              {result.reason_codes.map((code) => (
                <li key={code}>{code}</li>
              ))}
            </ul>
          )}
          <p className="explanation">{result.explanation}</p>
          <p className="disclaimer">
            Indicative financial-intelligence output, not a loan offer or approval. Policy version:{" "}
            {result.policy_version}.
          </p>
          <a className="goDeeperCta" href="/go-deeper?journey=comfortable_borrowing">
            Go deeper →
          </a>
        </section>
      )}
    </main>
  );
}
