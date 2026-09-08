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

export const borrowingStatusLabels: Record<string, string> = {
  OK: "Looks comfortable",
  CAUTION: "Proceed carefully",
  REDUCE: "Consider reducing the amount",
  DECLINE: "Not comfortable right now",
};

export const moneyValueStatusLabels: Record<string, string> = {
  POSITIVE: "Your card appears to create value",
  NEUTRAL: "Your card value appears roughly balanced",
  VALUE_LEAKAGE: "Your card may be costing more than it returns",
};

export const reasonCodeLabels: Record<string, string> = {
  COMMITMENT_RATIO_CAUTION: "Your monthly commitments would use a meaningful share of your income.",
  INCOME_UNVERIFIED: "This estimate uses self-declared income.",
  FOIR_HIGH: "Your monthly commitments may be too high after the requested borrowing.",
  BUFFER_LOW: "The remaining monthly buffer may be lower than comfortable.",
  NEGATIVE_SURPLUS: "The proposed borrowing may exceed your available monthly surplus.",
  NET_VALUE_POSITIVE: "Rewards appear to exceed the estimated costs.",
  NET_VALUE_NEUTRAL: "Estimated rewards and costs are broadly balanced.",
  NET_VALUE_NEGATIVE: "Estimated costs exceed the rewards captured.",
  ANNUAL_FEE_DRAG: "The annual fee may be reducing the value you receive.",
  REVOLVING_INTEREST_DRAG: "Revolving interest may be reducing the value you receive.",
  LOW_REWARD_CAPTURE: "The estimated reward rate is relatively low.",
};

export const currency = (value: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);
export const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
