from fastapi import APIRouter

from app.models.product_event import ProductEventRequest, ProductEventResponse
from app.services.product_events import record_product_event

router = APIRouter(prefix="/v1", tags=["events"])


@router.post("/events", response_model=ProductEventResponse)
def record_event(payload: ProductEventRequest) -> ProductEventResponse:
    event = record_product_event(
        event_type=payload.event_type,
        journey=payload.journey,
        decision_context=payload.decision_context,
    )
    return ProductEventResponse(**event)
