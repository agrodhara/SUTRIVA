"use client";

import { FormEvent, useState } from "react";

type ComfortResult = {
  estimated_new_monthly_commitment: number;
  total_monthly_commitment: number;
  commitment_ratio: number;
  comfort_status: string;
  reason_codes: string[];
  next_best_action: string;
  guidance_disclaimer: string;
};

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

export default function BorrowBetterPage() {
  const [result, setResult] = useState<ComfortResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submitCheck(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setResult(null);
    setLoading(true);

    const form = new FormData(event.currentTarget);
    const payload = {
      monthly_income: Number(form.get("monthly_income")),
      existing_monthly_commitments: Number(form.get("existing_monthly_commitments")),
      desired_borrowing_amount: Number(form.get("desired_borrowing_amount")),
      desired_tenure_months: Number(form.get("desired_tenure_months")),
    };

    try {
      if (!API_BASE_URL) {
        throw new Error("Backend unavailable");
      }
      const response = await fetch(
        `${API_BASE_URL.replace(/\/$/, "")}/v1/borrowing-intelligence/comfortable-borrowing-check`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (!response.ok) {
        throw new Error("Unable to complete comfort check right now");
      }
      setResult((await response.json()) as ComfortResult);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to complete comfort check right now",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="shell">
      <p className="eyebrow">Borrow Better</p>
      <h1>Comfortable Borrowing Check</h1>
      <p className="lede">
        Check whether a desired borrowing amount looks comfortable for your monthly cash flow.
      </p>

      <form className="checkForm" onSubmit={submitCheck}>
        <label>
          Monthly income
          <input name="monthly_income" type="number" min="0.01" step="0.01" required />
        </label>
        <label>
          Existing monthly commitments
          <input name="existing_monthly_commitments" type="number" min="0" step="0.01" required />
        </label>
        <label>
          Desired borrowing amount
          <input name="desired_borrowing_amount" type="number" min="0.01" step="0.01" required />
        </label>
        <label>
          Desired tenure in months
          <input name="desired_tenure_months" type="number" min="1" step="1" required />
        </label>
        <button type="submit" disabled={loading}>
          {loading ? "Checking..." : "Check comfort"}
        </button>
      </form>

      {error && <p role="alert" className="error">{error}</p>}
      {result && (
        <section className="resultCard" aria-live="polite">
          <h2>{result.comfort_status}</h2>
          <p>Estimated new monthly commitment: {result.estimated_new_monthly_commitment.toFixed(2)}</p>
          <p>Total monthly commitment: {result.total_monthly_commitment.toFixed(2)}</p>
          <p>Commitment ratio: {(result.commitment_ratio * 100).toFixed(2)}%</p>
          <p>Reason codes: {result.reason_codes.join(", ")}</p>
          <p>{result.next_best_action}</p>
          <p className="disclaimer">{result.guidance_disclaimer}</p>
        </section>
      )}
    </main>
  );
}
