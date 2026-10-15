import { requireApiBaseUrl } from "../../lib/api";
import type { Provenance } from "./ProvenanceBadge";
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

/** Submits the optional pilot-interest email, from either its arrival-screen or result-screen mount (see
 * PilotInterestForm.tsx) — identical request either way. Only ever sends
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

// --- Milestone 2C: save/reopen a B1 check -------------------------------------------------------
// v1 is email-only and B1-scoped (debt/purchase/offer/rejected) — see
// docs/product/journeys/B1_SAVED_CHECK_SPEC.md. Gated server-side by `savedCheckEnabled`
// (shared/track11_config.json); these calls simply 404 while that flag is off.

export type { Provenance };

export type SavedBorrowCheck = {
  situation_key: SituationKey;
  input_values: Record<string, number | string | null>;
  provenance: Provenance;
  result_title: string;
  result_headline: string;
  result_detail: string;
  result_insight: string;
  result_scenario: string;
  result_note: string;
  result_bars: SituationBar[];
  created_at: string;
};

async function parseErrorDetail(response: Response, fallback: string): Promise<string> {
  try {
    const parsed = await response.json();
    if (typeof parsed?.detail === "string") return parsed.detail;
  } catch {
    // response body wasn't JSON; keep the fallback
  }
  return fallback;
}

/** Saves a completed check and emails the visitor a private retrieval link. Sends exactly the inputs and
 * result currently on screen — nothing is recalculated server-side (see
 * app/services/saved_borrow_checks.py's docstring) — plus the one email address, and best-effort links
 * to the visitor's anonymous session cookie the same way registerPilotInterest does. */
export async function saveBorrowCheck(
  situationKey: SituationKey,
  values: Record<string, unknown>,
  provenance: Provenance,
  result: SituationResult,
  email: string,
): Promise<void> {
  const response = await fetch(`${requireApiBaseUrl()}/v1/saved-borrow-checks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      situation_key: situationKey,
      input_values: values,
      provenance,
      result_title: result.title,
      result_headline: result.headline,
      result_detail: result.detail,
      result_insight: result.insight,
      result_scenario: result.scenario,
      result_note: result.note,
      result_bars: result.bars,
      email,
    }),
  });
  if (!response.ok) {
    throw new SituationApiError(response.status, await parseErrorDetail(response, "Something went wrong. Please try again."));
  }
}

/** Retrieves a saved check by its raw retrieval token — the part of the emailed `/saved#<token>` link
 * after the `#`. Sent as a header, never a path or query parameter: a path/query value is what a
 * reverse proxy or server's *default* access log captures on every request, and this token is a bearer
 * credential (possession = access to a stored financial result) — see app/saved/page.tsx and
 * docs/execution/B1_SAVED_CHECK_LAUNCH_GAPS.md. */
export async function retrieveSavedBorrowCheck(token: string): Promise<SavedBorrowCheck> {
  const response = await fetch(`${requireApiBaseUrl()}/v1/saved-borrow-checks`, {
    credentials: "include",
    headers: { "X-Saved-Check-Token": token },
  });
  if (!response.ok) {
    throw new SituationApiError(response.status, await parseErrorDetail(response, "We couldn't find that saved check."));
  }
  return (await response.json()) as SavedBorrowCheck;
}

/** Visitor-initiated withdrawal — idempotent; the backend reports success whether or not the token still
 * matched anything (see app/services/saved_borrow_checks.py::delete_saved_borrow_check). Same
 * header-not-path treatment as retrieveSavedBorrowCheck, for the same reason. */
export async function deleteSavedBorrowCheck(token: string): Promise<void> {
  const response = await fetch(`${requireApiBaseUrl()}/v1/saved-borrow-checks`, {
    method: "DELETE",
    credentials: "include",
    headers: { "X-Saved-Check-Token": token },
  });
  if (!response.ok) {
    throw new SituationApiError(response.status, await parseErrorDetail(response, "Something went wrong. Please try again."));
  }
}
