"use client";

import { InputHTMLAttributes, ReactNode } from "react";

export function FinancialInput({ label, optional, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; optional?: boolean }) {
  return <label className="field"><span>{label}{optional && <em>Optional</em>}</span><input {...props} /></label>;
}

export function ExampleValuesButton({ onClick }: { onClick: () => void }) {
  return <button type="button" className="secondaryButton" onClick={onClick}>Use example values</button>;
}

export function LoadingState() {
  return <p className="feedback" role="status">Preparing your quick check…</p>;
}

export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return <div className="errorState" role="alert"><p>{message}</p>{retry && <button type="button" className="secondaryButton" onClick={retry}>Try again</button>}</div>;
}

export function ResultMetric({ label, value }: { label: string; value: string }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong></div>;
}

export function InsightBlock({ title, children }: { title: string; children: ReactNode }) {
  return <section className="insightBlock"><h2>{title}</h2>{children}</section>;
}

export function GoDeeperCTA({ journey }: { journey: "money_value" | "comfortable_borrowing" }) {
  return <a className="goDeeper" href={`/go-deeper?journey=${journey}`}>Go deeper <span aria-hidden="true">→</span></a>;
}

export const currency = (value: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);
export const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
