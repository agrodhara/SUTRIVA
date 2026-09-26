from datetime import datetime
import re
from typing import Literal, Optional
from urllib.parse import urlparse

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

ProductEventType = Literal[
    "door_selected",
    "check_started",
    "check_completed",
    "journey_started",
    "step_viewed",
    "step_completed",
    "result_requested",
    "result_viewed",
    "result_failed",
    "result_action_selected",
    "illustrative_example_viewed",
    "pilot_cta_selected",
    "check_another_selected",
    "journey_completed",
    "balance_behavior_selected",
    "reward_type_selected",
    "reward_help_opened",
    "reward_help_outcome_selected",
    "reward_result_state_viewed",
    "month_end_position_selected",
    "borrow_result_state_viewed",
    "borrow_nudge_selected",
    "mobile_entry_started",
    "otp_requested",
    "otp_request_failed",
    "otp_verification_succeeded",
    "otp_verification_failed",
    "otp_expired",
    "pilot_consent_recorded",
    "marketing_consent_recorded",
    "consent_withdrawn",
    "go_deeper_selected",
    "go_deeper_declined",
    "what_if_started",
    "what_if_completed",
    "teaser_viewed",
    "teaser_cta_selected",
    "next_interest_viewed",
    "next_interest_selected",
    "next_interest_skipped",
    "decline_reason_selected",
    "result_declared",
    "connected_example_seen",
    # Phase 1.1B Step 6 funnel — the exact five events authorized by
    # docs/product/journeys/JOURNEY_FLOW_SPEC.md. No payload field on this model carries a phone number,
    # OTP value or raw authentication data, so these can never be substituted with anything value-bearing.
    "pilot_interest_clicked",
    "mobile_submitted",
    "otp_sent",
    "otp_verified",
    "optional_updates_opted_in",
    # The 1.1A situation pilot-interest email handoff (consolidated product correction — Copilot review +
    # founder decisions, 2026-09-26; see app/routers/situation_pilot_interest.py). Distinct from the
    # Phase 1.1B "pilot_interest_clicked" above: that is a Step 6A interest click with no email; this is
    # the 1.1A form's own submission. Never carries an email — see TrackEventDetails' screen_name-only
    # payload shape, which structurally cannot.
    "situation_pilot_interest_submitted",
]

STEP6_EVENT_TYPES = {
    "pilot_interest_clicked",
    "mobile_submitted",
    "otp_sent",
    "otp_verified",
    "optional_updates_opted_in",
}

ScreenNameType = Literal[
    "rewards_card_behaviour",
    "rewards_priorities_inputs",
    "rewards_check",
    "rewards_connected_example",
    "borrow_monthly_position",
    "borrow_plan",
    "borrow_check",
    "borrow_connected_example",
    # The nine narrow Phase 1.1A situation checks (see docs/execution/SITUATIONS_REDESIGN.md): each gets
    # exactly an "arrival" (question-framing), "inputs" and "result" screen. Added by migration
    # 0006_situation_screen_names, which is the single source for keeping this list and
    # SCREEN_NAME_JOURNEY below in sync with what the database actually accepts.
    "borrow_debt_arrival",
    "borrow_debt_inputs",
    "borrow_debt_result",
    "borrow_purchase_arrival",
    "borrow_purchase_inputs",
    "borrow_purchase_result",
    "borrow_offer_arrival",
    "borrow_offer_inputs",
    "borrow_offer_result",
    "borrow_rejected_arrival",
    "borrow_rejected_inputs",
    "borrow_rejected_result",
    "rewards_fee_arrival",
    "rewards_fee_inputs",
    "rewards_fee_result",
    "rewards_fit_arrival",
    "rewards_fit_inputs",
    "rewards_fit_result",
    "rewards_balance_arrival",
    "rewards_balance_inputs",
    "rewards_balance_result",
    "rewards_multi_arrival",
    "rewards_multi_inputs",
    "rewards_multi_result",
    "rewards_unused_arrival",
    "rewards_unused_inputs",
    "rewards_unused_result",
    # The optional, post-result pilot-interest email form each situation's result screen may show. Added
    # by migration 0007_situation_pilot_interest. One per situation, used by "step_viewed" (the form
    # appearing) and "situation_pilot_interest_submitted" (its submission) — never by "result_declared" or
    # "step_completed", which keep their existing, unrelated meanings for this flow.
    "borrow_debt_pilot",
    "borrow_purchase_pilot",
    "borrow_offer_pilot",
    "borrow_rejected_pilot",
    "rewards_fee_pilot",
    "rewards_fit_pilot",
    "rewards_balance_pilot",
    "rewards_multi_pilot",
    "rewards_unused_pilot",
]

JourneyType = Literal["money_value", "comfortable_borrowing"]
IntentType = Literal[
    "actual_obligations",
    "improve_readiness",
    "actual_card_value",
    "spend_understanding",
]
ReasonType = Literal[
    "not_needed_now",
    "trust_data_access",
    "current_answer_enough",
    "other",
    "statement_sharing_declined",
    "not_useful",
]


class AttributionPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    utm_source: Optional[str] = None
    utm_medium: Optional[str] = None
    utm_campaign: Optional[str] = None
    utm_content: Optional[str] = None
    utm_term: Optional[str] = None
    landing_path: str = Field(min_length=1)
    referrer: Optional[str] = None

    @field_validator("utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term")
    @classmethod
    def validate_optional_campaign_values(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        if len(value) > 120 or not re.fullmatch(r"[A-Za-z0-9._ \-]+", value):
            raise ValueError("campaign attribution fields must be <= 120 chars and use the allowlist")
        return value

    @field_validator("landing_path")
    @classmethod
    def validate_landing_path(cls, value: str) -> str:
        if len(value) > 200 or not re.fullmatch(r"/[A-Za-z0-9/_-]*", value):
            raise ValueError("landing_path is invalid")
        return value

    @field_validator("referrer")
    @classmethod
    def validate_referrer(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        if len(value) > 200 or "?" in value:
            raise ValueError("referrer is invalid")
        parsed = urlparse(value)
        if parsed.scheme not in {"http", "https"}:
            raise ValueError("referrer must use http or https")
        return value

JOURNEY_INTENTS = {
    "comfortable_borrowing": {"actual_obligations", "improve_readiness"},
    "money_value": {"actual_card_value", "spend_understanding"},
}

JOURNEY_REASONS = {
    "comfortable_borrowing": {"not_needed_now", "trust_data_access", "current_answer_enough", "other"},
    "money_value": {"current_answer_enough", "statement_sharing_declined", "not_useful", "other"},
}

# screen_name is categorical only. Each value belongs to exactly one journey and
# one screen role; the tables below are the single source for that mapping.
_SITUATION_KEYS_BY_JOURNEY = {
    "comfortable_borrowing": ("borrow_debt", "borrow_purchase", "borrow_offer", "borrow_rejected"),
    "money_value": ("rewards_fee", "rewards_fit", "rewards_balance", "rewards_multi", "rewards_unused"),
}

SCREEN_NAME_JOURNEY: dict[str, str] = {
    "rewards_card_behaviour": "money_value",
    "rewards_priorities_inputs": "money_value",
    "rewards_check": "money_value",
    "rewards_connected_example": "money_value",
    "borrow_monthly_position": "comfortable_borrowing",
    "borrow_plan": "comfortable_borrowing",
    "borrow_check": "comfortable_borrowing",
    "borrow_connected_example": "comfortable_borrowing",
    **{
        f"{key}_{suffix}": journey
        for journey, keys in _SITUATION_KEYS_BY_JOURNEY.items()
        for key in keys
        for suffix in ("arrival", "inputs", "result", "pilot")
    },
}

_SITUATION_ARRIVAL_AND_INPUTS_SCREEN_NAMES = {
    f"{key}_{suffix}" for keys in _SITUATION_KEYS_BY_JOURNEY.values() for key in keys for suffix in ("arrival", "inputs")
}
_SITUATION_RESULT_SCREEN_NAMES = {f"{key}_result" for keys in _SITUATION_KEYS_BY_JOURNEY.values() for key in keys}
_SITUATION_PILOT_SCREEN_NAMES = {f"{key}_pilot" for keys in _SITUATION_KEYS_BY_JOURNEY.values() for key in keys}

STEP_SCREEN_NAMES = {
    "rewards_card_behaviour",
    "rewards_priorities_inputs",
    "borrow_monthly_position",
    "borrow_plan",
    *_SITUATION_ARRIVAL_AND_INPUTS_SCREEN_NAMES,
    # The pilot-interest form appearing after a result is reported with "step_viewed", the same event
    # type its arrival/inputs screens use — see app/situations/PilotInterestForm.tsx.
    *_SITUATION_PILOT_SCREEN_NAMES,
}

# Event types that may carry a Step 2/3 screen_name (optional, legacy compatible).
STEP_EVENT_TYPES = {"step_viewed", "step_completed"}

# Event types that require a specific screen_name role.
REQUIRED_SCREEN_NAMES_BY_EVENT_TYPE: dict[str, set[str]] = {
    "result_declared": {"rewards_check", "borrow_check", *_SITUATION_RESULT_SCREEN_NAMES},
    "connected_example_seen": {"rewards_connected_example", "borrow_connected_example"},
    "situation_pilot_interest_submitted": _SITUATION_PILOT_SCREEN_NAMES,
}

VIEW_EVENT_TYPES = {"teaser_viewed", "teaser_cta_selected", "next_interest_viewed", "next_interest_skipped"}
NEW_INTENT_EVENT_TYPES = {"next_interest_selected", "decline_reason_selected"}
LEGACY_GO_DEEPER_EVENT_TYPES = {"go_deeper_selected", "go_deeper_declined"}


class ProductEventRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    event_id: str = Field(min_length=1)
    event_type: ProductEventType
    journey_run_id: str = Field(min_length=1)
    journey: JourneyType
    version: str = Field(min_length=1)
    timestamp: datetime
    decision_context: str = Field(default="local_demo", min_length=1, max_length=80)
    card_check_number: Optional[int] = Field(default=None, ge=1)
    first_touch_attribution: Optional[AttributionPayload] = None
    latest_touch_attribution: Optional[AttributionPayload] = None
    intent: Optional[IntentType] = None
    reason: Optional[ReasonType] = None
    screen_name: Optional[ScreenNameType] = None

    @model_validator(mode="after")
    def validate_contract(self) -> "ProductEventRequest":
        self._validate_screen_name()

        allowed_intents = JOURNEY_INTENTS[self.journey]
        allowed_reasons = JOURNEY_REASONS[self.journey]

        if self.journey != "money_value" and self.card_check_number is not None:
            raise ValueError("card_check_number is only valid for money_value")

        if self.intent is not None and self.intent not in allowed_intents:
            raise ValueError(f"intent {self.intent!r} is not valid for journey {self.journey!r}")

        if self.reason is not None and self.reason not in allowed_reasons:
            raise ValueError(f"reason {self.reason!r} is not valid for journey {self.journey!r}")

        if self.event_type in VIEW_EVENT_TYPES:
            if self.intent is not None or self.reason is not None:
                raise ValueError(f"{self.event_type} must not include intent or reason")
            return self

        if self.event_type == "next_interest_selected":
            if self.intent is None:
                raise ValueError("next_interest_selected requires intent")
            if self.reason is not None:
                raise ValueError("next_interest_selected must not include reason")
            return self

        if self.event_type == "decline_reason_selected":
            if self.intent is None:
                raise ValueError("decline_reason_selected requires intent")
            if self.reason is None:
                raise ValueError("decline_reason_selected requires reason")
            return self

        if self.event_type in LEGACY_GO_DEEPER_EVENT_TYPES:
            if self.reason is not None:
                raise ValueError(f"{self.event_type} must not include reason")
            return self

        if self.intent is not None or self.reason is not None:
            raise ValueError(f"{self.event_type} must not include intent or reason")

        return self

    def _validate_screen_name(self) -> None:
        if self.screen_name is None:
            if self.event_type in REQUIRED_SCREEN_NAMES_BY_EVENT_TYPE:
                raise ValueError(f"{self.event_type} requires screen_name")
            return

        if self.event_type in STEP_EVENT_TYPES:
            allowed = STEP_SCREEN_NAMES
        elif self.event_type in REQUIRED_SCREEN_NAMES_BY_EVENT_TYPE:
            allowed = REQUIRED_SCREEN_NAMES_BY_EVENT_TYPE[self.event_type]
        else:
            raise ValueError(f"{self.event_type} must not include screen_name")

        if self.screen_name not in allowed:
            raise ValueError(f"screen_name {self.screen_name!r} is not valid for {self.event_type}")

        if SCREEN_NAME_JOURNEY[self.screen_name] != self.journey:
            raise ValueError(f"screen_name {self.screen_name!r} is not valid for journey {self.journey!r}")


class ProductEventResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["persisted", "accepted_not_persisted"]
    event_id: str
    event_type: ProductEventType
    journey_run_id: str
    version: str
    timestamp: datetime
    received_at: datetime
    journey: JourneyType
    decision_context: str
    card_check_number: Optional[int] = None
    first_touch_attribution: Optional[AttributionPayload] = None
    latest_touch_attribution: Optional[AttributionPayload] = None
    intent: Optional[IntentType] = None
    reason: Optional[ReasonType] = None
    screen_name: Optional[ScreenNameType] = None
