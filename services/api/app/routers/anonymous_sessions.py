from __future__ import annotations

from fastapi import APIRouter, Request, Response
from fastapi.responses import JSONResponse

from app.models.anonymous_session import AnonymousSessionBootstrapResponse
from app.services.anonymous_sessions import (
    AnonymousSessionHttpError,
    apply_session_cookie,
    bootstrap_anonymous_session,
    clear_session_cookie,
    get_cookie_name,
    validate_request_origin,
)


router = APIRouter(prefix="/v1/anonymous-sessions", tags=["anonymous-sessions"])


@router.post("/bootstrap", response_model=AnonymousSessionBootstrapResponse)
def bootstrap(request: Request, response: Response) -> AnonymousSessionBootstrapResponse:
    validate_request_origin(request.headers.get("origin"))
    try:
        result = bootstrap_anonymous_session(request.cookies.get(get_cookie_name()))
    except AnonymousSessionHttpError as exc:
        error_response = JSONResponse(status_code=exc.status_code, content={"detail": exc.code})
        if exc.clear_cookie:
            clear_session_cookie(error_response)
        return error_response

    if result.raw_token is not None:
        apply_session_cookie(response, result.raw_token, result.absolute_expires_at)

    return AnonymousSessionBootstrapResponse(
        session_status=result.session_status,
        absolute_expires_at=result.absolute_expires_at,
        cookie_max_age_seconds=result.cookie_max_age_seconds,
    )