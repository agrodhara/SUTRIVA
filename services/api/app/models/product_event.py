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

    @model_validator(mode="after")
    def validate_contract(self) -> "ProductEventRequest":
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
