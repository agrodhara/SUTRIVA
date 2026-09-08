"use client";

import { ChangeEvent, FormEvent, useState } from "react";
import { currency, ErrorState, ExampleValuesButton, FinancialInput, GoDeeperCTA, InsightBlock, LoadingState, percent, ResultMetric } from "../../components/QuickCheckUI";

type Result = { decision: string; estimated_emi: number; foir_after_new_emi: number; reason_codes: string[]; explanation: string };
const API = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";
const reasonCopy: Record<string, string> = {
  COMMITMENT_RATIO_CAUTION: "Your monthly commitments would use a meaningful share of your income.",
  INCOME_UNVERIFIED: "This estimate currently uses self-declared income."
};
const statusCopy: Record<string, string> = { OK: "Looks comfortable", CAUTION: "Proceed carefully", REDUCE: "Consider reducing the amount", DECLINE: "Not comfortable right now" };

export default function BorrowBetterPage() {
  const [form, setForm] = useState({ income: "", commitments: "", amount: "", tenure: "" });
  const [result, setResult] = useState<Result>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const set = (key: keyof typeof form) => (event: ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: event.target.value });
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setLoading(true); setError("");
    try {
      const response = await fetch(`${API}/v1/borrow-better/quick-check`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        declared_monthly_income: Number(form.income), existing_monthly_emi: Number(form.commitments),
        requested_loan_amount: Number(form.amount), requested_tenor_months: Number(form.tenure)
      }) });
      if (!response.ok) throw new Error();
      setResult(await response.json());
    } catch { setError("We couldn’t complete your borrowing comfort check. Please try again or return home."); }
    finally { setLoading(false); }
  };
  if (result) return <main className="shell journey"><a className="backLink" href="/borrow-better">← Update details</a><p className="eyebrow">Borrow Better</p><h1>Your borrowing comfort check</h1>
    <InsightBlock title="1. What did we find?"><div className="metrics"><ResultMetric label="Estimated new monthly commitment" value={currency(result.estimated_emi)} /><ResultMetric label="Total monthly commitment" value={currency(Number(form.commitments) + result.estimated_emi)} /><ResultMetric label="Commitment ratio" value={percent(result.foir_after_new_emi)} /></div><p className="status caution">{statusCopy[result.decision] ?? "Your result is ready"}</p></InsightBlock>
    <InsightBlock title="2. Why does it matter?"><p>{result.explanation}</p>{result.reason_codes.length > 0 && <ul>{result.reason_codes.map(reason => <li key={reason}>{reasonCopy[reason] ?? "Your income, current commitments and requested borrowing amount affect this estimate."}</li>)}</ul>}</InsightBlock>
    <InsightBlock title="3. What should I do next?"><p>{result.explanation}</p><GoDeeperCTA /></InsightBlock></main>;
  return <main className="shell journey"><a className="backLink" href="/">← Home</a><p className="eyebrow">Borrow Better</p><h1>Know what feels comfortable before you borrow.</h1><p className="lede">Answer a few questions for an initial estimate.</p>
    <form onSubmit={submit}><FinancialInput label="Monthly income" type="number" min="1" required value={form.income} onChange={set("income")} /><FinancialInput label="Existing monthly commitments" type="number" min="0" required value={form.commitments} onChange={set("commitments")} /><FinancialInput label="Desired borrowing amount" type="number" min="1" required value={form.amount} onChange={set("amount")} /><FinancialInput label="Desired tenure (months)" type="number" min="1" max="360" required value={form.tenure} onChange={set("tenure")} />
      <div className="formActions"><ExampleValuesButton onClick={() => setForm({ income: "100000", commitments: "25000", amount: "1000000", tenure: "60" })} /><button type="submit" className="primaryButton" disabled={loading}>Check borrowing comfort</button></div>
    </form>{loading && <LoadingState />}{error && <ErrorState message={error} retry={() => setError("")} />}</main>;
}
  return (
    <main className="shell">
      <p className="eyebrow">Borrow Better</p>
      <h1>Know what is comfortable before you borrow.</h1>
      <p className="lede">This page will call the FastAPI quick-check endpoint. No lender fulfilment is exposed in Alpha.</p>
    </main>
  );
}
