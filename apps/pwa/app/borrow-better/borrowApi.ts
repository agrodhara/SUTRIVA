import { requireApiBaseUrl } from "../../lib/api";
import type { BorrowCheckRequestBody, EmiPreviewRequestBody } from "./journeyState";

export type EmiPreviewResult = {
  illustrative_annual_rate_percent: number;
  estimated_monthly_emi: number;
  guidance_disclaimer: string;
};

export type BorrowCheckResult = {
  illustrative_annual_rate_percent: number;
  debt_ratio_before: number;
  debt_ratio_after: number;
  breathing_room_before: number;
  breathing_room_after: number;
  estimated_new_monthly_commitment: number;
  total_repayment: number;
  total_interest: number;
  main_pressure: { code: "PROPOSED_EMI_REDUCES_BREATHING_ROOM"; monthly_amount: number };
  loan_reduction_nudge: { reduction_amount: number; monthly_breathing_room_preserved: number } | null;
  reconciliation_note: "MONTH_END_FALL_SHORT" | "MONTH_END_POSITION_UNKNOWN" | null;
  emi_ending_note: "EMI_MAY_END_WITHIN_SIX_MONTHS" | null;
};

/** Carries no request data: messages are fixed strings so nothing entered can reach a log or the UI. */
export class BorrowApiError extends Error {}

const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

function isEmiPreviewResult(value: unknown): value is EmiPreviewResult {
  const body = value as EmiPreviewResult | null;
  return !!body && isNumber(body.illustrative_annual_rate_percent) && isNumber(body.estimated_monthly_emi);
}

function isBorrowCheckResult(value: unknown): value is BorrowCheckResult {
  const body = value as BorrowCheckResult | null;
  return (
    !!body &&
    isNumber(body.illustrative_annual_rate_percent) &&
    isNumber(body.debt_ratio_before) &&
    isNumber(body.debt_ratio_after) &&
    isNumber(body.breathing_room_before) &&
    isNumber(body.breathing_room_after) &&
    isNumber(body.estimated_new_monthly_commitment) &&
    isNumber(body.total_repayment) &&
    isNumber(body.total_interest) &&
    !!body.main_pressure &&
    isNumber(body.main_pressure.monthly_amount)
  );
}

async function postJson<T>(path: string, body: unknown, guard: (value: unknown) => value is T, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${requireApiBaseUrl()}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    // Let the caller recognise a deliberate cancellation; everything else becomes a fixed, data-free error.
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new BorrowApiError("request_failed");
  }
  if (!response.ok) throw new BorrowApiError(`status_${response.status}`);
  const parsed: unknown = await response.json().catch(() => null);
  if (!guard(parsed)) throw new BorrowApiError("malformed_response");
  return parsed;
}

export function fetchEmiPreview(body: EmiPreviewRequestBody, signal?: AbortSignal): Promise<EmiPreviewResult> {
  return postJson("/v1/borrowing-intelligence/emi-preview", body, isEmiPreviewResult, signal);
}

export function fetchBorrowCheck(body: BorrowCheckRequestBody): Promise<BorrowCheckResult> {
  return postJson("/v1/borrowing-intelligence/comfortable-borrowing-check", body, isBorrowCheckResult);
}

export const isAbortError = (error: unknown): boolean => error instanceof DOMException && error.name === "AbortError";
