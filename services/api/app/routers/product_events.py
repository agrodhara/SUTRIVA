from fastapi import APIRouter

from app.models.product_event import ProductEventRequest, ProductEventResponse
from app.services.product_events import record_product_event

router = APIRouter(prefix="/v1", tags=["events"])


@router.post("/events", response_model=ProductEventResponse)
def record_event(payload: ProductEventRequest) -> ProductEventResponse:
    event = record_product_event(
        event_id=payload.event_id,
        event_type=payload.event_type,
        anonymous_session_id=payload.anonymous_session_id,
        journey_run_id=payload.journey_run_id,
        journey=payload.journey,
        version=payload.version,
        timestamp=payload.timestamp,
        decision_context=payload.decision_context,
        card_check_number=payload.card_check_number,
        first_touch_attribution=payload.first_touch_attribution.model_dump() if payload.first_touch_attribution else None,
        latest_touch_attribution=payload.latest_touch_attribution.model_dump() if payload.latest_touch_attribution else None,
        intent=payload.intent,
        reason=payload.reason,
    )
    return ProductEventResponse(**event)
