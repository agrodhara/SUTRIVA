"use client";

import { FormEvent, useState } from "react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

type ComfortableBorrowingCheckResponse = {
  policy_version: string;
  estimated_new_monthly_commitment: number;
  total_monthly_commitment: number;
  commitment_ratio: number;
  comfort_status: string;
  reason_codes: string[];
  next_best_action: string;
  guidance_disclaimer: string;
  audit_event_id?: string;
};

type FormState = {
  monthlyIncome: string;
  existingMonthlyCommitments: string;
  desiredBorrowingAmount: string;
  desiredTenureMonths: string;
};

const initialForm: FormState = {
  monthlyIncome: "",
  existingMonthlyCommitments: "",
  desiredBorrowingAmount: "",
  desiredTenureMonths: ""
};

export default function BorrowBetterPage() {
  const [form, setForm] = useState<FormState>(initialForm);
  const [result, setResult] = useState<ComfortableBorrowingCheckResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function updateField(field: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setResult(null);
    setIsSubmitting(true);

    try {
      const response = await fetch(`${API_BASE_URL}/v1/borrowing-intelligence/comfortable-borrowing-check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          monthly_income: Number(form.monthlyIncome),
          existing_monthly_commitments: Number(form.existingMonthlyCommitments),
          desired_borrowing_amount: Number(form.desiredBorrowingAmount),
          desired_tenure_months: Number(form.desiredTenureMonths)
        })
      });

      if (!response.ok) {
        throw new Error("Could not complete the comfortable borrowing check. Please check your inputs and try again.");
      }

      const data: ComfortableBorrowingCheckResponse = await response.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="shell">
      <p className="eyebrow">Borrow Better</p>
      <h1>Know what is comfortable before you borrow.</h1>
      <p className="lede">
        Answer a few quick questions to get an indicative Comfortable Borrowing Check. No lender fulfilment is
        exposed in Alpha.
      </p>

      <form className="checkForm" onSubmit={handleSubmit}>
        <label>
          Monthly income
          <input
            type="number"
            min="0"
            step="1"
            required
            value={form.monthlyIncome}
            onChange={(event) => updateField("monthlyIncome", event.target.value)}
          />
        </label>
        <label>
          Existing monthly commitments
          <input
            type="number"
            min="0"
            step="1"
            required
            value={form.existingMonthlyCommitments}
            onChange={(event) => updateField("existingMonthlyCommitments", event.target.value)}
          />
        </label>
        <label>
          Desired borrowing amount
          <input
            type="number"
            min="0"
            step="1"
            required
            value={form.desiredBorrowingAmount}
            onChange={(event) => updateField("desiredBorrowingAmount", event.target.value)}
          />
        </label>
        <label>
          Desired tenure (months)
          <input
            type="number"
            min="1"
            max="360"
            step="1"
            required
            value={form.desiredTenureMonths}
            onChange={(event) => updateField("desiredTenureMonths", event.target.value)}
          />
        </label>
        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Checking..." : "Check comfort range"}
        </button>
      </form>

      {error ? <p className="errorText">{error}</p> : null}

      {result ? (
        <section className="resultCard" aria-label="Comfortable borrowing check result">
          <dl>
            <dt>Comfort status</dt>
            <dd>{result.comfort_status}</dd>

            <dt>Estimated new monthly commitment</dt>
            <dd>{result.estimated_new_monthly_commitment}</dd>

            <dt>Total monthly commitment</dt>
            <dd>{result.total_monthly_commitment}</dd>

            <dt>Commitment ratio</dt>
            <dd>{result.commitment_ratio}</dd>

            <dt>Next best action</dt>
            <dd>{result.next_best_action}</dd>

            <dt>Reason codes</dt>
            <dd>{result.reason_codes.join(", ")}</dd>

            {result.audit_event_id ? (
              <>
                <dt>Audit event id</dt>
                <dd>{result.audit_event_id}</dd>
              </>
            ) : null}
          </dl>
          <p className="guardrail">{result.guidance_disclaimer}</p>
        </section>
      ) : null}
    </main>
  );
}
