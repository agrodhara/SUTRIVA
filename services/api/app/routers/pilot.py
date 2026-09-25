from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request, status

from app.config import track11b_enabled
from app.models.pilot import (
    PilotInterestRequest,
    PilotInterestResponse,
    PilotMobileSubmitRequest,
    PilotMobileSubmitResponse,
    PilotOtpResendRequest,
    PilotOtpVerifyRequest,
    PilotOtpVerifyResponse,
)
from app.pilot_config import get_pilot_rate_limit_settings
from app.services.anonymous_sessions import AnonymousSessionHttpError, get_cookie_name, validate_event_session, validate_request_origin
from app.services.pilot import PilotServiceError, register_interest, resend_otp, submit_mobile_and_send_otp, verify_otp
from app.services.pilot_rate_limit import FixedWindowRateLimiter, RateLimitExceededError

router = APIRouter(prefix="/v1/pilot", tags=["pilot"])

_RATE_LIMIT_WINDOW_SECONDS = 3600.0
# Module-level singletons: process-local rate limit state (see FixedWindowRateLimiter's docstring for why
# this is not shared across instances). /mobile and /mobile/resend share one limiter because both place an
# SMS send and should draw from the same per-IP budget for that cost.
_interest_limiter = FixedWindowRateLimiter(window_seconds=_RATE_LIMIT_WINDOW_SECONDS)
_mobile_limiter = FixedWindowRateLimiter(window_seconds=_RATE_LIMIT_WINDOW_SECONDS)
_verify_limiter = FixedWindowRateLimiter(window_seconds=_RATE_LIMIT_WINDOW_SECONDS)


def _require_track11b() -> None:
    # A 404, not a 403: Phase 1.1B must be indistinguishable from "this route doesn't exist" while
    # disabled, matching how the frontend flag dispatch already hides Step 6 entirely.
    if not track11b_enabled():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="feature_disabled")


def _client_key(request: Request) -> str:
    return request.client.host if request.client is not None else "unknown"


def _enforce_rate_limit(limiter: FixedWindowRateLimiter, request: Request, *, max_events: int) -> None:
    try:
        limiter.check(_client_key(request), max_events=max_events)
    except RateLimitExceededError as exc:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="rate_limited") from exc


@router.post("/interest", response_model=PilotInterestResponse)
def post_interest(payload: PilotInterestRequest, request: Request) -> PilotInterestResponse:
    _require_track11b()
    validate_request_origin(request.headers.get("origin"))
    _enforce_rate_limit(_interest_limiter, request, max_events=get_pilot_rate_limit_settings().interest_per_ip_per_hour)
    try:
        pilot_registration_id = register_interest(journey=payload.journey, journey_run_id=payload.journey_run_id)
    except PilotServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.code) from exc
    return PilotInterestResponse(pilot_registration_id=pilot_registration_id, status="interest_clicked")


@router.post("/mobile", response_model=PilotMobileSubmitResponse)
def post_mobile(payload: PilotMobileSubmitRequest, request: Request) -> PilotMobileSubmitResponse:
    _require_track11b()
    validate_request_origin(request.headers.get("origin"))
    _enforce_rate_limit(_mobile_limiter, request, max_events=get_pilot_rate_limit_settings().mobile_per_ip_per_hour)
    try:
        result = submit_mobile_and_send_otp(
            pilot_registration_id=payload.pilot_registration_id,
            phone_number=payload.phone_number,
            optional_updates_opted_in=payload.optional_updates_opted_in,
        )
    except PilotServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.code) from exc
    return PilotMobileSubmitResponse(status="otp_sent", expires_at=result.expires_at, resend_after_seconds=result.resend_after_seconds)


@router.post("/mobile/resend", response_model=PilotMobileSubmitResponse)
def post_mobile_resend(payload: PilotOtpResendRequest, request: Request) -> PilotMobileSubmitResponse:
    _require_track11b()
    validate_request_origin(request.headers.get("origin"))
    _enforce_rate_limit(_mobile_limiter, request, max_events=get_pilot_rate_limit_settings().mobile_per_ip_per_hour)
    try:
        result = resend_otp(pilot_registration_id=payload.pilot_registration_id)
    except PilotServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.code) from exc
    return PilotMobileSubmitResponse(status="otp_sent", expires_at=result.expires_at, resend_after_seconds=result.resend_after_seconds)


@router.post("/verify", response_model=PilotOtpVerifyResponse)
def post_verify(request: Request, payload: PilotOtpVerifyRequest) -> PilotOtpVerifyResponse:
    _require_track11b()
    validate_request_origin(request.headers.get("origin"))
    _enforce_rate_limit(_verify_limiter, request, max_events=get_pilot_rate_limit_settings().verify_per_ip_per_hour)

    # History linking uses only a session already validated the normal way (the same cookie every other
    # authenticated route checks) — verify_otp never trusts a session id supplied directly by the client.
    anonymous_session_uuid: str | None = None
    raw_token = request.cookies.get(get_cookie_name())
    if raw_token:
        try:
            validated = validate_event_session(raw_token)
            anonymous_session_uuid = validated.anonymous_session_uuid
        except AnonymousSessionHttpError:
            # No valid anonymous session to link is not an error for verification itself: the phone number
            # is still verified, it just won't be linked to an anonymous history this time.
            anonymous_session_uuid = None

    try:
        verify_otp(pilot_registration_id=payload.pilot_registration_id, code=payload.code, anonymous_session_uuid=anonymous_session_uuid)
    except PilotServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.code) from exc
    return PilotOtpVerifyResponse(status="verified")
