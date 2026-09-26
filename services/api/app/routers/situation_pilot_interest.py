"""The optional, post-result pilot-interest email handoff for the nine Phase 1.1A situation checks
(consolidated product correction — Copilot review + founder decisions, 2026-09-26).

Two routes:
- POST /v1/situation-pilot-interest — public, called from PilotInterestForm.tsx after a result is shown.
  Origin-validated and rate-limited the same way app/routers/pilot.py's Step 6 endpoints are, but this is
  a wholly separate feature: no phone number, OTP or consent flag is ever collected here, and this router
  never reads or writes anything in pilot_registrations/otp_challenges.
- GET  /v1/situation-pilot-interest/admin/export — the operator's only way to retrieve the interest list.
  Not linked from the frontend, excluded from the OpenAPI schema, and gated behind a secret bearer token
  that must be configured out of band (SITUATION_PILOT_INTEREST_ADMIN_TOKEN) — see
  app/situations_pilot_interest_config.py's get_situation_pilot_interest_admin_token, which fails closed
  (this route 404s, not 401s, when unset) exactly like an unconfigured SMS provider does elsewhere.
"""
from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, HTTPException, Query, Request, status

from app.config import track11a_enabled
from app.models.situation_pilot_interest import (
    PilotInterestAdminExportResponse,
    PilotInterestAdminRow,
    PilotInterestEmailRequest,
    PilotInterestEmailResponse,
)
from app.services.anonymous_sessions import AnonymousSessionHttpError, get_cookie_name, validate_event_session, validate_request_origin
from app.services.pilot_rate_limit import FixedWindowRateLimiter, RateLimitExceededError
from app.services.situation_pilot_interest import SituationPilotInterestError, list_pilot_interest_for_admin, register_pilot_interest
from app.situations_pilot_interest_config import get_situation_pilot_interest_admin_token, get_situation_pilot_interest_rate_limit_settings

router = APIRouter(prefix="/v1/situation-pilot-interest", tags=["situation-pilot-interest"])

_RATE_LIMIT_WINDOW_SECONDS = 3600.0
# Module-level singletons — see app/services/pilot_rate_limit.py's FixedWindowRateLimiter docstring for
# why this is process-local, and app/routers/pilot.py for the identical pattern this mirrors.
_submit_limiter = FixedWindowRateLimiter(window_seconds=_RATE_LIMIT_WINDOW_SECONDS)
_admin_export_limiter = FixedWindowRateLimiter(window_seconds=_RATE_LIMIT_WINDOW_SECONDS)


def _require_track11a() -> None:
    # A 404, not a 403: this feature must be indistinguishable from "this route doesn't exist" while
    # Phase 1.1A is disabled, matching the pattern app/routers/pilot.py uses for Phase 1.1B.
    if not track11a_enabled():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="feature_disabled")


def _client_key(request: Request) -> str:
    return request.client.host if request.client is not None else "unknown"


def _enforce_rate_limit(limiter: FixedWindowRateLimiter, request: Request, *, max_events: int) -> None:
    try:
        limiter.check(_client_key(request), max_events=max_events)
    except RateLimitExceededError as exc:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="rate_limited") from exc


@router.post("", response_model=PilotInterestEmailResponse)
def post_situation_pilot_interest(payload: PilotInterestEmailRequest, request: Request) -> PilotInterestEmailResponse:
    _require_track11a()
    validate_request_origin(request.headers.get("origin"))
    _enforce_rate_limit(_submit_limiter, request, max_events=get_situation_pilot_interest_rate_limit_settings().submit_per_ip_per_hour)

    # Best-effort link only, exactly like app/routers/pilot.py's post_verify: a missing or invalid
    # anonymous session cookie must never block this submission from succeeding.
    anonymous_session_uuid: str | None = None
    raw_token = request.cookies.get(get_cookie_name())
    if raw_token:
        try:
            validated = validate_event_session(raw_token)
            anonymous_session_uuid = validated.anonymous_session_uuid
        except AnonymousSessionHttpError:
            anonymous_session_uuid = None

    try:
        result = register_pilot_interest(situation_key=payload.situation_key, email=payload.email, anonymous_session_uuid=anonymous_session_uuid)
    except SituationPilotInterestError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.code) from exc
    return PilotInterestEmailResponse(status=result)


@router.get("/admin/export", response_model=PilotInterestAdminExportResponse, include_in_schema=False)
def get_situation_pilot_interest_admin_export(
    request: Request,
    limit: int = Query(default=200, ge=1, le=1000),
    before: datetime | None = Query(default=None),
) -> PilotInterestAdminExportResponse:
    configured_token = get_situation_pilot_interest_admin_token()
    if not configured_token:
        # Fail closed and indistinguishable from a route that does not exist — an operator who has not
        # set the token yet gets the same 404 a visitor would, not a hint that a protected route is here.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="feature_disabled")

    _enforce_rate_limit(_admin_export_limiter, request, max_events=get_situation_pilot_interest_rate_limit_settings().admin_export_per_ip_per_hour)

    presented_token = request.headers.get("x-admin-token")
    if not presented_token or presented_token != configured_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_admin_token")

    try:
        records = list_pilot_interest_for_admin(limit=limit, before=before)
    except SituationPilotInterestError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.code) from exc

    return PilotInterestAdminExportResponse(
        rows=[
            PilotInterestAdminRow(
                situation_pilot_interest_uuid=r.situation_pilot_interest_uuid,
                journey=r.journey,  # type: ignore[arg-type]
                situation_key=r.situation_key,  # type: ignore[arg-type]
                email=r.email,
                created_at=r.created_at,
            )
            for r in records
        ]
    )
