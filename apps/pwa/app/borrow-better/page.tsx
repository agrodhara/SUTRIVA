"use client";

import { ChangeEvent, FormEvent, useState } from "react";
import { requireApiBaseUrl, trackEvent } from "../../lib/api";
import { borrowingStatusLabels, currency, ErrorState, ExampleValuesButton, FinancialInput, FutureInterestCapture, InsightBlock, LoadingState, percent, reasonCodeLabels, ResultMetric } from "../../components/QuickCheckUI";

type Result = { comfort_status: string; estimated_new_monthly_commitment: number; total_monthly_commitment: number; commitment_ratio: number; reason_codes: string[]; next_best_action: string };

export default function BorrowBetterPage() {
  const [form, setForm] = useState({ monthly_income: "", existing_monthly_commitments: "", desired_borrowing_amount: "", desired_tenure_months: "" });
  const [result, setResult] = useState<Result>();
  const [whatIf, setWhatIf] = useState({ desired_borrowing_amount: "", desired_tenure_months: "" });
  const [exampleMode, setExampleMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const set = (key: keyof typeof form) => (event: ChangeEvent<HTMLInputElement>) => { setExampleMode(false); setForm({ ...form, [key]: event.target.value }); };

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true); setError(""); trackEvent("check_started", "comfortable_borrowing");
    try {
      const response = await fetch(`${requireApiBaseUrl()}/v1/borrowing-intelligence/comfortable-borrowing-check`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          monthly_income: Number(form.monthly_income),
          existing_monthly_commitments: Number(form.existing_monthly_commitments),
          desired_borrowing_amount: Number(form.desired_borrowing_amount),
          desired_tenure_months: Number(form.desired_tenure_months),
        }),
      });
      if (!response.ok) throw new Error("We couldn’t complete your borrowing comfort check. Please check your inputs.");
      const body = await response.json(); setResult(body); setWhatIf({ desired_borrowing_amount: form.desired_borrowing_amount, desired_tenure_months: form.desired_tenure_months }); trackEvent("check_completed", "comfortable_borrowing");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally { setLoading(false); }
  }

  async function runWhatIf(event: FormEvent) {
    event.preventDefault(); setLoading(true); setError("");
    trackEvent("what_if_started", "comfortable_borrowing");
    try {
      const response = await fetch(`${requireApiBaseUrl()}/v1/borrowing-intelligence/comfortable-borrowing-check`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, desired_borrowing_amount: Number(whatIf.desired_borrowing_amount), desired_tenure_months: Number(whatIf.desired_tenure_months) }) });
      if (!response.ok) throw new Error("We couldn’t update this what-if estimate.");
      setResult(await response.json()); trackEvent("what_if_completed", "comfortable_borrowing");
    } catch (err) { setError(err instanceof Error ? err.message : "Something went wrong."); } finally { setLoading(false); }
  }
  if (result) return <main className="shell journey"><a className="backLink" href="/borrow-better">← Update details</a><p className="eyebrow">Borrow Better</p><h1>Your borrowing comfort check</h1><p className="estimateLabel">{exampleMode ? "Example preview" : "Your estimate"}</p>
    <InsightBlock title="1. What did we find?"><div className="metrics"><ResultMetric label="Estimated monthly commitment" value={currency(result.estimated_new_monthly_commitment)} /><ResultMetric label="Total monthly commitment" value={currency(result.total_monthly_commitment)} /><ResultMetric label="Commitment ratio" value={percent(result.commitment_ratio)} /></div><p className="status">{borrowingStatusLabels[result.comfort_status] ?? "Your result is ready"}</p></InsightBlock>
    <InsightBlock title="2. Why does it matter?"><p>{result.reason_codes.map((code) => reasonCodeLabels[code] ?? "Your income, commitments and requested amount affect this estimate.").join(" ")}</p></InsightBlock>
    <InsightBlock title="3. What should I do next?"><p>{result.next_best_action}</p></InsightBlock>
    <section className="whatIfCard"><h2>Want to improve this?</h2><p>Try another amount or tenure using the information you already entered.</p><form onSubmit={runWhatIf}><FinancialInput label="Desired borrowing amount" type="number" min="1" required value={whatIf.desired_borrowing_amount} onChange={(e) => setWhatIf({ ...whatIf, desired_borrowing_amount: e.target.value })} /><FinancialInput label="Desired tenure (months)" type="number" min="1" max="360" required value={whatIf.desired_tenure_months} onChange={(e) => setWhatIf({ ...whatIf, desired_tenure_months: e.target.value })} /><button className="primaryButton" disabled={loading}>Update estimate</button></form></section>
    {error && <ErrorState message={error} />}<FutureInterestCapture journey="comfortable_borrowing" /></main>;

  return <main className="shell journey"><a className="backLink" href="/">← Home</a><p className="eyebrow">Borrow Better</p><h1>Know what feels comfortable before you borrow.</h1><p className="lede">Answer a few questions for an initial estimate.</p>
    <form onSubmit={submit}><FinancialInput label="Monthly income" type="number" min="1" required value={form.monthly_income} onChange={set("monthly_income")} /><FinancialInput label="Existing monthly commitments" type="number" min="0" required value={form.existing_monthly_commitments} onChange={set("existing_monthly_commitments")} /><FinancialInput label="Desired borrowing amount" type="number" min="1" required value={form.desired_borrowing_amount} onChange={set("desired_borrowing_amount")} /><FinancialInput label="Desired tenure (months)" type="number" min="1" max="360" required value={form.desired_tenure_months} onChange={set("desired_tenure_months")} />
      <div className="formActions"><ExampleValuesButton onClick={() => { setExampleMode(true); setForm({ monthly_income: "100000", existing_monthly_commitments: "25000", desired_borrowing_amount: "500000", desired_tenure_months: "36" }); }} /><button type="submit" className="primaryButton" disabled={loading}>Check borrowing comfort</button></div>
    </form>{loading && <LoadingState />}{error && <ErrorState message={error} retry={() => setError("")} />}</main>;
}
