export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

export type Journey = "money_value" | "comfortable_borrowing";

export type ProductEventType =
  | "door_selected"
  | "check_started"
  | "check_completed"
  | "go_deeper_selected"
  | "go_deeper_declined"
  | "what_if_started"
  | "what_if_completed";

/**
 * Minimal local product-event tracker.
 *
 * Only records event_type, journey and a decision_context label. Never send
 * name, contact details, account details or raw financial-check inputs here.
 */
export function trackEvent(eventType: ProductEventType, journey: Journey): void {
  fetch(`${API_BASE_URL}/v1/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      event_type: eventType,
      journey,
      decision_context: "local_demo",
    }),
  }).catch(() => {
    // Alpha note: event tracking is best-effort and must never block the user journey.
  });
}
