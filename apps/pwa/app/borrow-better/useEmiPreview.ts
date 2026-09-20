import { useEffect, useRef, useState } from "react";
import { fetchEmiPreview, isAbortError } from "./borrowApi";
import { buildEmiPreviewBody, type BorrowJourneyForm } from "./journeyState";

export const EMI_PREVIEW_DEBOUNCE_MS = 400;

export type EmiPreviewState =
  | { status: "idle" }
  /** Inputs are valid and a request is scheduled or in flight. */
  | { status: "loading" }
  | { status: "ready"; emi: number; ratePercent: number }
  | { status: "error" };

/**
 * Backend-computed EMI for the current amount and tenure. No request is sent until both are valid; edits
 * are debounced, an in-flight request is cancelled when inputs change or the step unmounts, and a stale
 * response can never replace a newer one. Failure leaves the form untouched and offers a retry.
 */
export function useEmiPreview(plan: Pick<BorrowJourneyForm, "loanAmount" | "tenureMonths">) {
  const [state, setState] = useState<EmiPreviewState>({ status: "idle" });
  const [retryNonce, setRetryNonce] = useState(0);
  const skipDebounce = useRef(false);
  const { loanAmount, tenureMonths } = plan;

  useEffect(() => {
    const body = buildEmiPreviewBody({ loanAmount, tenureMonths });
    if (!body) {
      setState({ status: "idle" });
      return;
    }

    setState({ status: "loading" });
    const controller = new AbortController();
    const delay = skipDebounce.current ? 0 : EMI_PREVIEW_DEBOUNCE_MS;
    skipDebounce.current = false;

    const timer = setTimeout(() => {
      fetchEmiPreview(body, controller.signal)
        .then((result) => {
          if (controller.signal.aborted) return;
          setState({ status: "ready", emi: result.estimated_monthly_emi, ratePercent: result.illustrative_annual_rate_percent });
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted || isAbortError(error)) return;
          setState({ status: "error" });
        });
    }, delay);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [loanAmount, tenureMonths, retryNonce]);

  const retry = () => {
    skipDebounce.current = true;
    setRetryNonce((value) => value + 1);
  };

  return { state, retry };
}
