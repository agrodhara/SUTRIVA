"""Milestone 2C: save/reopen a completed B1 (Borrow Better) check via an emailed link.

See docs/product/journeys/B1_SAVED_CHECK_SPEC.md for the full specification this implements. v1 is
email-only (Option A) — no phone number, OTP, or consent flag is ever collected here, and this router
never reads or writes anything in pilot_registrations/otp_challenges. Gated behind `savedCheckEnabled`
(shared/track11_config.json), committed `false` — nothing in this change enables it.

Three routes, all origin-validated and per-IP rate-limited the same way the existing pilot and
situation-pilot-interest routers are:
- POST   /v1/saved-borrow-checks            — save a check, email a retrieval link.
- GET    /v1/saved-borrow-checks/{token}    — retrieve a saved check by its raw token.
- DELETE /v1/saved-borrow-checks/{token}    — visitor-initiated withdrawal (soft delete).
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request, status

from app.config import saved_check_enabled
from app.models.saved_borrow_check import (
    DeleteSavedBorrowCheckResponse,
    SaveBorrowCheckRequest,
    SaveBorrowCheckResponse,
    SavedBorrowCheckOut,
)
from app.models.situations import SituationBarOut
from app.saved_borrow_check_config import get_saved_borrow_check_rate_limit_settings
from app.services.anonymous_sessions import AnonymousSessionHttpError, get_cookie_name, validate_event_session, validate_request_origin
from app.services.client_ip import resolve_client_ip
from app.services.pilot_rate_limit import FixedWindowRateLimiter, RateLimitExceededError
from app.services.saved_borrow_checks import SavedBorrowCheckError, delete_saved_borrow_check, retrieve_saved_borrow_check, save_borrow_check
from pydantic import ValidationError

router = APIRouter(prefix="/v1/saved-borrow-checks", tags=["saved-borrow-checks"])

_RATE_LIMIT_WINDOW_SECONDS = 3600.0
# Module-level singletons, independent of every other rate limiter in this codebase — same pattern as
# app/routers/pilot.py and app/routers/situation_pilot_interest.py.
_save_limiter = FixedWindowRateLimiter(window_seconds=_RATE_LIMIT_WINDOW_SECONDS)
_retrieve_limiter = FixedWindowRateLimiter(window_seconds=_RATE_LIMIT_WINDOW_SECONDS)
_delete_limiter = FixedWindowRateLimiter(window_seconds=_RATE_LIMIT_WINDOW_SECONDS)


def _require_saved_check_enabled() -> None:
    # A 404, not a 403 — this feature must be indistinguishable from "this route doesn't exist" while
    # disabled, matching the pattern every other gated feature in this codebase uses.
    if not saved_check_enabled():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="feature_disabled")


def _client_key(request: Request) -> str:
    # Trusted-proxy-aware — see app/services/client_ip.py and the identical fix already applied to
    # app/routers/pilot.py and app/routers/situation_pilot_interest.py. Applied here from the start
    # rather than found as a gap later.
    return resolve_client_ip(request)


def _enforce_rate_limit(limiter: FixedWindowRateLimiter, request: Request, *, max_events: int) -> None:
    try:
        limiter.check(_client_key(request), max_events=max_events)
    except RateLimitExceededError as exc:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="rate_limited") from exc


@router.post("", response_model=SaveBorrowCheckResponse)
def post_save_borrow_check(payload: SaveBorrowCheckRequest, request: Request) -> SaveBorrowCheckResponse:
    _require_saved_check_enabled()
    validate_request_origin(request.headers.get("origin"))
    _enforce_rate_limit(_save_limiter, request, max_events=get_saved_borrow_check_rate_limit_settings().save_per_ip_per_hour)

    try:
        validated_input_values = payload.validated_input_values()
    except ValidationError as exc:
        # The submitted input_values don't match the live calculation's own field set for this situation
        # — rejected, never silently coerced or stored as free-form JSON.
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="invalid_input_values") from exc

    # Best-effort link only, exactly like every other anonymous-session touchpoint in this codebase: a
    # missing or invalid session cookie must never block a save from succeeding.
    anonymous_session_uuid: str | None = None
    raw_token = request.cookies.get(get_cookie_name())
    if raw_token:
        try:
            validated_session = validate_event_session(raw_token)
            anonymous_session_uuid = validated_session.anonymous_session_uuid
        except AnonymousSessionHttpError:
            anonymous_session_uuid = None

    try:
        save_borrow_check(
            situation_key=payload.situation_key,
            anonymous_session_uuid=anonymous_session_uuid,
            email=payload.email,
            input_values=validated_input_values,
            provenance=payload.provenance,
            result_title=payload.result_title,
            result_headline=payload.result_headline,
            result_detail=payload.result_detail,
            result_insight=payload.result_insight,
            result_scenario=payload.result_scenario,
            result_note=payload.result_note,
            result_bars=[bar.model_dump() for bar in payload.result_bars],
        )
    except SavedBorrowCheckError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.code) from exc

    return SaveBorrowCheckResponse(status="saved")


@router.get("/{token}", response_model=SavedBorrowCheckOut)
def get_saved_borrow_check(token: str, request: Request) -> SavedBorrowCheckOut:
    _require_saved_check_enabled()
    validate_request_origin(request.headers.get("origin"))
    _enforce_rate_limit(_retrieve_limiter, request, max_events=get_saved_borrow_check_rate_limit_settings().retrieve_per_ip_per_hour)

    try:
        record = retrieve_saved_borrow_check(token=token)
    except SavedBorrowCheckError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.code) from exc

    return SavedBorrowCheckOut(
        situation_key=record.situation_key,  # type: ignore[arg-type]
        input_values=record.input_values,
        provenance=record.provenance,  # type: ignore[arg-type]
        result_title=record.result_title,
        result_headline=record.result_headline,
        result_detail=record.result_detail,
        result_insight=record.result_insight,
        result_scenario=record.result_scenario,
        result_note=record.result_note,
        result_bars=[SituationBarOut(**bar) for bar in record.result_bars],
        created_at=record.created_at,
    )


@router.delete("/{token}", response_model=DeleteSavedBorrowCheckResponse)
def delete_saved_borrow_check_route(token: str, request: Request) -> DeleteSavedBorrowCheckResponse:
    _require_saved_check_enabled()
    validate_request_origin(request.headers.get("origin"))
    _enforce_rate_limit(_delete_limiter, request, max_events=get_saved_borrow_check_rate_limit_settings().delete_per_ip_per_hour)

    try:
        delete_saved_borrow_check(token=token)
    except SavedBorrowCheckError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.code) from exc

    # Idempotent and intentionally uninformative about whether the token ever existed — a delete call
    # always reports "deleted" from the caller's point of view (see delete_saved_borrow_check's docstring).
    return DeleteSavedBorrowCheckResponse(status="deleted")
