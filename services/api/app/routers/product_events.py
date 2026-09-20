from __future__ import annotations

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from app.models.product_event import ProductEventRequest, ProductEventResponse
from app.services.anonymous_sessions import AnonymousSessionHttpError, clear_session_cookie, get_cookie_name, validate_request_origin
from app.services.product_events import record_product_event

router = APIRouter(prefix="/v1", tags=["events"])


@router.post("/events", response_model=ProductEventResponse)
def record_event(request: Request, payload: ProductEventRequest):
    validate_request_origin(request.headers.get("origin"))
    try:
        body, status_code = record_product_event(
            payload=payload,
            raw_token=request.cookies.get(get_cookie_name()),
        )
    except AnonymousSessionHttpError as exc:
        response = JSONResponse(status_code=exc.status_code, content={"detail": exc.code})
        if exc.clear_cookie:
            clear_session_cookie(response)
        return response

    return JSONResponse(status_code=status_code, content=ProductEventResponse(**body).model_dump(mode="json"))
