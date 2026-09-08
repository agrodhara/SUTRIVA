"use client";

import { ChangeEvent, FormEvent, useState } from "react";
import { API_BASE_URL, trackEvent } from "../../lib/api";
import { borrowingStatusLabels, currency, ErrorState, ExampleValuesButton, FinancialInput, GoDeeperCTA, InsightBlock, LoadingState, percent, reasonCodeLabels, ResultMetric } from "../../components/QuickCheckUI";

type Result = { comfort_status: string; estimated_new_monthly_commitment: number; total_monthly_commitment: number; commitment_ratio: number; reason_codes: string[]; next_best_action: string };

export default function BorrowBetterPage() {
  const [form, setForm] = useState({ monthly_income: "", existing_monthly_commitments: "", desired_borrowing_amount: "", desired_tenure_months: "" });
  const [result, setResult] = useState<Result>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const set = (key: keyof typeof form) => (event: ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: event.target.value });

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true); setError(""); trackEvent("check_started", "comfortable_borrowing");
    try {
      const response = await fetch(`${API_BASE_URL}/v1/borrowing-intelligence/comfortable-borrowing-check`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          monthly_income: Number(form.monthly_income),
          existing_monthly_commitments: Number(form.existing_monthly_commitments),
          desired_borrowing_amount: Number(form.desired_borrowing_amount),
          desired_tenure_months: Number(form.desired_tenure_months),
        }),
      });
      if (!response.ok) throw new Error("We couldn’t complete your borrowing comfort check. Please check your inputs.");
      setResult(await response.json()); trackEvent("check_completed", "comfortable_borrowing");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally { setLoading(false); }
  }

  if (result) return <main className="shell journey"><a className="backLink" href="/borrow-better">← Update details</a><p className="eyebrow">Borrow Better</p><h1>Your borrowing comfort check</h1>
    <InsightBlock title="1. What did we find?"><div className="metrics"><ResultMetric label="Estimated monthly commitment" value={currency(result.estimated_new_monthly_commitment)} /><ResultMetric label="Total monthly commitment" value={currency(result.total_monthly_commitment)} /><ResultMetric label="Commitment ratio" value={percent(result.commitment_ratio)} /></div><p className="status">{borrowingStatusLabels[result.comfort_status] ?? "Your result is ready"}</p></InsightBlock>
    <InsightBlock title="2. Why does it matter?"><p>{result.reason_codes.map((code) => reasonCodeLabels[code] ?? "Your income, commitments and requested amount affect this estimate.").join(" ")}</p></InsightBlock>
    <InsightBlock title="3. What should I do next?"><p>{result.next_best_action}</p><GoDeeperCTA journey="comfortable_borrowing" /></InsightBlock></main>;

  return <main className="shell journey"><a className="backLink" href="/">← Home</a><p className="eyebrow">Borrow Better</p><h1>Know what feels comfortable before you borrow.</h1><p className="lede">Answer a few questions for an initial estimate.</p>
    <form onSubmit={submit}><FinancialInput label="Monthly income" type="number" min="1" required value={form.monthly_income} onChange={set("monthly_income")} /><FinancialInput label="Existing monthly commitments" type="number" min="0" required value={form.existing_monthly_commitments} onChange={set("existing_monthly_commitments")} /><FinancialInput label="Desired borrowing amount" type="number" min="1" required value={form.desired_borrowing_amount} onChange={set("desired_borrowing_amount")} /><FinancialInput label="Desired tenure (months)" type="number" min="1" max="360" required value={form.desired_tenure_months} onChange={set("desired_tenure_months")} />
      <div className="formActions"><ExampleValuesButton onClick={() => setForm({ monthly_income: "100000", existing_monthly_commitments: "25000", desired_borrowing_amount: "500000", desired_tenure_months: "36" })} /><button type="submit" className="primaryButton" disabled={loading}>Check borrowing comfort</button></div>
    </form>{loading && <LoadingState />}{error && <ErrorState message={error} retry={() => setError("")} />}</main>;
}
