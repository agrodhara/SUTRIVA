import { requireApiBaseUrl } from "../../lib/api";
import type { SituationKey } from "./situationsConfig";

export class SituationApiError extends Error {
  constructor(public status: number, public detail: string) {
    super(detail);
  }
}

export type SituationBar = { label: string; value: number | null; tone: string };

export type SituationResult = {
  title: string;
  headline: string;
  detail: string;
  insight: string;
  scenario: string;
  note: string;
  bars: SituationBar[];
};

const ENDPOINTS: Record<SituationKey, string> = {
  debt: "/v1/borrowing-intelligence/rising-emis-check",
  purchase: "/v1/borrowing-intelligence/new-purchase-check",
  offer: "/v1/borrowing-intelligence/loan-offer-check",
  rejected: "/v1/borrowing-intelligence/rejected-shortfall-check",
  fee: "/v1/money-value/annual-fee-check",
  fit: "/v1/money-value/card-fit-check",
  balance: "/v1/money-value/carrying-balance-check",
  multi: "/v1/money-value/multi-card-check",
  unused: "/v1/money-value/unused-points-check",
};

/** Posts the situation's own figures — nothing else — to its calculation endpoint. Never sent as query
 * parameters (this is a plain JSON POST body only, never appended to any URL). */
export async function checkSituation(key: SituationKey, values: Record<string, unknown>): Promise<SituationResult> {
  const response = await fetch(`${requireApiBaseUrl()}${ENDPOINTS[key]}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(values),
  });
  if (!response.ok) {
    let detail = "We couldn't calculate this result. Check the figures and try again.";
    try {
      const parsed = await response.json();
      if (typeof parsed?.detail === "string") detail = parsed.detail;
    } catch {
      // response body wasn't JSON; keep the generic message
    }
    throw new SituationApiError(response.status, detail);
  }
  return (await response.json()) as SituationResult;
}

export type PilotInterestStatus = "registered" | "already_registered";

/** Submits the optional post-result pilot-interest email (see PilotInterestForm.tsx). Only ever sends
 * `situation_key` and `email` — never the situation's entered figures, never in a URL or query string.
 * `credentials: "include"` lets the backend best-effort-link the submission to an existing anonymous
 * session cookie if one is present; a missing or invalid cookie never blocks the submission. */
export async function registerPilotInterest(situationKey: SituationKey, email: string): Promise<PilotInterestStatus> {
  const response = await fetch(`${requireApiBaseUrl()}/v1/situation-pilot-interest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ situation_key: situationKey, email }),
  });
  if (!response.ok) {
    let detail = "Something went wrong. Please try again.";
    try {
      const parsed = await response.json();
      if (typeof parsed?.detail === "string") detail = parsed.detail;
    } catch {
      // response body wasn't JSON; keep the generic message
    }
    throw new SituationApiError(response.status, detail);
  }
  const parsed = (await response.json()) as { status: PilotInterestStatus };
  return parsed.status;
}
