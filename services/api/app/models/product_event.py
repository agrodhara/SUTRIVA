from typing import Literal, Optional

from pydantic import BaseModel, model_validator

ProductEventType = Literal[
    "door_selected",
    "check_started",
    "check_completed",
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
    event_type: ProductEventType
    journey: JourneyType
    decision_context: str = "local_demo"
    intent: Optional[IntentType] = None
    reason: Optional[ReasonType] = None

    @model_validator(mode="after")
    def validate_contract(self) -> "ProductEventRequest":
        allowed_intents = JOURNEY_INTENTS[self.journey]
        allowed_reasons = JOURNEY_REASONS[self.journey]

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
    event_id: str
    event_type: ProductEventType
    created_at: str
    journey: JourneyType
    decision_context: str
    intent: Optional[IntentType] = None
    reason: Optional[ReasonType] = None
