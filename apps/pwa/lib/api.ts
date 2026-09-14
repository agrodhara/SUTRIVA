export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ?? "";

export function requireApiBaseUrl(): string {
  if (!API_BASE_URL) {
    throw new Error("NEXT_PUBLIC_API_BASE_URL is not configured.");
  }
  return API_BASE_URL;
}

export type Journey = "money_value" | "comfortable_borrowing";

export type ProductEventIntent =
  | "actual_obligations"
  | "improve_readiness"
  | "actual_card_value"
  | "spend_understanding";

export type ProductEventReason =
  | "not_needed_now"
  | "trust_data_access"
  | "current_answer_enough"
  | "other"
  | "statement_sharing_declined"
  | "not_useful";

export type ProductEventType =
  | "door_selected"
  | "check_started"
  | "check_completed"
  | "go_deeper_selected"
  | "go_deeper_declined"
  | "what_if_started"
  | "what_if_completed"
  | "teaser_viewed"
  | "teaser_cta_selected"
  | "next_interest_viewed"
  | "next_interest_selected"
  | "next_interest_skipped"
  | "decline_reason_selected";

export type TrackEventDetails = {
  intent?: ProductEventIntent;
  reason?: ProductEventReason;
};

/**
 * Minimal local product-event tracker.
 *
 * Only records event_type, journey and a decision_context label. Never send
 * name, contact details, account details or raw financial-check inputs here.
 */
export function trackEvent(eventType: ProductEventType, journey: Journey, details: TrackEventDetails = {}): void {
  if (!API_BASE_URL) return;
  fetch(`${API_BASE_URL}/v1/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      event_type: eventType,
      journey,
      decision_context: "local_demo",
      ...details,
    }),
  }).catch(() => {
    // Alpha note: event tracking is best-effort and must never block the user journey.
  });
}
