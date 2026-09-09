from typing import Literal, Optional

from pydantic import BaseModel

ProductEventType = Literal[
    "door_selected",
    "check_started",
    "check_completed",
    "go_deeper_selected",
    "go_deeper_declined",
    "what_if_started",
    "what_if_completed",
]

JourneyType = Literal["money_value", "comfortable_borrowing"]


class ProductEventRequest(BaseModel):
    event_type: ProductEventType
    journey: JourneyType
    decision_context: str = "local_demo"


class ProductEventResponse(BaseModel):
    event_id: str
    event_type: ProductEventType
    created_at: str
    journey: JourneyType
    decision_context: str
