import { getAttributionTouches, syncAttributionTouches, type AttributionPayload } from "./attribution";
import {
  createEventId,
  createJourneyRunId,
  eventTimestamp,
  getMoneyCardCheckNumber,
  track11Version,
} from "./journeySession";

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
  | "journey_started"
  | "step_viewed"
  | "step_completed"
  | "result_requested"
  | "result_viewed"
  | "result_failed"
  | "result_action_selected"
  | "illustrative_example_viewed"
  | "pilot_cta_selected"
  | "check_another_selected"
  | "journey_completed"
  | "balance_behavior_selected"
  | "reward_type_selected"
  | "reward_help_opened"
  | "reward_help_outcome_selected"
  | "reward_result_state_viewed"
  | "month_end_position_selected"
  | "borrow_result_state_viewed"
  | "borrow_nudge_selected"
  | "mobile_entry_started"
  | "otp_requested"
  | "otp_request_failed"
  | "otp_verification_succeeded"
  | "otp_verification_failed"
  | "otp_expired"
  | "pilot_consent_recorded"
  | "marketing_consent_recorded"
  | "consent_withdrawn"
  | "go_deeper_selected"
  | "go_deeper_declined"
  | "what_if_started"
  | "what_if_completed"
  | "teaser_viewed"
  | "teaser_cta_selected"
  | "next_interest_viewed"
  | "next_interest_selected"
  | "next_interest_skipped"
  | "decline_reason_selected"
  | "result_declared"
  | "connected_example_seen"
  // Phase 1.1B Step 6 funnel — the exact five events authorized by
  // docs/product/journeys/JOURNEY_FLOW_SPEC.md. Never pass a phone number, OTP value or any other
  // free-form/value-bearing field in `details` alongside these — see TrackEventDetails below.
  | "pilot_interest_clicked"
  | "mobile_submitted"
  | "otp_sent"
  | "otp_verified"
  | "optional_updates_opted_in"
  // The 1.1A situation pilot-interest email handoff (see app/situations/PilotInterestForm.tsx). Distinct
  // from "pilot_interest_clicked" above, which is the unrelated Phase 1.1B Step 6A event. Never carries an
  // email — see TrackEventDetails below, whose screenName-only shape structurally cannot hold one.
  | "situation_pilot_interest_submitted";

/**
 * Bounded, categorical screen identifier for final 1.1A journey events. Mirrors the API allowlist;
 * never put values, rates, balances, PII or free text here.
 */
export type ScreenName =
  | "rewards_card_behaviour"
  | "rewards_priorities_inputs"
  | "rewards_check"
  | "rewards_connected_example"
  | "borrow_monthly_position"
  | "borrow_plan"
  | "borrow_check"
  | "borrow_connected_example"
  // The nine narrow Phase 1.1A situation checks — see apps/pwa/app/situations/situationsConfig.ts and
  // migration 0006_situation_screen_names, the single source every one of these must match exactly.
  | "borrow_debt_arrival"
  | "borrow_debt_inputs"
  | "borrow_debt_result"
  | "borrow_purchase_arrival"
  | "borrow_purchase_inputs"
  | "borrow_purchase_result"
  | "borrow_offer_arrival"
  | "borrow_offer_inputs"
  | "borrow_offer_result"
  | "borrow_rejected_arrival"
  | "borrow_rejected_inputs"
  | "borrow_rejected_result"
  | "rewards_fee_arrival"
  | "rewards_fee_inputs"
  | "rewards_fee_result"
  | "rewards_fit_arrival"
  | "rewards_fit_inputs"
  | "rewards_fit_result"
  | "rewards_balance_arrival"
  | "rewards_balance_inputs"
  | "rewards_balance_result"
  | "rewards_multi_arrival"
  | "rewards_multi_inputs"
  | "rewards_multi_result"
  | "rewards_unused_arrival"
  | "rewards_unused_inputs"
  | "rewards_unused_result"
  // The optional, post-result pilot-interest email form (see ../app/situations/PilotInterestForm.tsx and
  // migration 0007_situation_pilot_interest, the single source every one of these must match exactly).
  | "borrow_debt_pilot"
  | "borrow_purchase_pilot"
  | "borrow_offer_pilot"
  | "borrow_rejected_pilot"
  | "rewards_fee_pilot"
  | "rewards_fit_pilot"
  | "rewards_balance_pilot"
  | "rewards_multi_pilot"
  | "rewards_unused_pilot";

export type TrackEventDetails = {
  cardCheckNumber?: number;
  firstTouchAttribution?: AttributionPayload | null;
  intent?: ProductEventIntent;
  journeyRunId?: string;
  latestTouchAttribution?: AttributionPayload | null;
  reason?: ProductEventReason;
  screenName?: ScreenName;
};

let bootstrapPromise: Promise<void> | null = null;

async function bootstrapAnonymousSession(): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/v1/anonymous-sessions/bootstrap`, {
    method: "POST",
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("anonymous session bootstrap failed");
  }
}

export function ensureAnonymousSession(): Promise<void> {
  if (!API_BASE_URL) {
    return Promise.resolve();
  }

  if (!bootstrapPromise) {
    bootstrapPromise = bootstrapAnonymousSession().finally(() => {
      bootstrapPromise = null;
    });
  }

  return bootstrapPromise;
}

async function postEvent(body: Record<string, unknown>, allowRetry: boolean): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/v1/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });

  if (response.status === 401 && allowRetry) {
    await ensureAnonymousSession();
    await postEvent(body, false);
  }
}

/**
 * Minimal local product-event tracker.
 *
 * Only records event_type, journey and a decision_context label. Never send
 * name, contact details, account details or raw financial-check inputs here.
 */
export function trackEvent(eventType: ProductEventType, journey: Journey, details: TrackEventDetails = {}): void {
  if (!API_BASE_URL) return;

  const touchedAttribution = syncAttributionTouches();
  const storedAttribution = getAttributionTouches();
  const firstTouchAttribution = details.firstTouchAttribution ?? touchedAttribution.firstTouch ?? storedAttribution.firstTouch;
  const latestTouchAttribution = details.latestTouchAttribution ?? touchedAttribution.latestTouch ?? storedAttribution.latestTouch;

  const body = {
    event_id: createEventId(),
    event_type: eventType,
    journey_run_id: details.journeyRunId ?? createJourneyRunId(),
    journey,
    version: track11Version(),
    timestamp: eventTimestamp(),
    decision_context: "local_demo",
    card_check_number: journey === "money_value" ? details.cardCheckNumber ?? getMoneyCardCheckNumber() : undefined,
    first_touch_attribution: firstTouchAttribution,
    latest_touch_attribution: latestTouchAttribution,
    intent: details.intent,
    reason: details.reason,
    screen_name: details.screenName,
  };

  void (
    ensureAnonymousSession()
      .then(() => postEvent(body, true))
      .catch(() => {
        // Alpha note: event tracking is best-effort and must never block the user journey.
      })
  );
}
