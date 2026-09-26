"""The nine narrow Phase 1.1A situation checks (Borrow Better: rising EMIs, new purchase, loan offer,
rejected/offered less; Rewards Intelligence: annual fee, card fit, carrying a balance, several cards,
unused points).

Kept as its own router, separate from the existing borrowing-intelligence and money-value routers, so the
existing comprehensive check endpoints those already expose are untouched and still covered by their own
tests — this redesign adds a new, narrower front door for each situation rather than changing what those
endpoints do. See app/services/situations.py for the actual calculations; every endpoint here does no more
than validate the request and translate the pure-function result into the shared response shape.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from app.models.situations import (
    AnnualFeeRequest,
    CardFitRequest,
    CarryingBalanceRequest,
    LoanOfferRequest,
    MultiCardRequest,
    NewPurchaseRequest,
    RejectedShortfallRequest,
    RisingEmisRequest,
    SituationResultOut,
    UnusedPointsRequest,
    situation_result_to_response,
)
from app.services.situations import (
    SituationValidationError,
    calculate_annual_fee,
    calculate_card_fit,
    calculate_carrying_balance,
    calculate_loan_offer,
    calculate_multi_card,
    calculate_new_purchase,
    calculate_rejected_shortfall,
    calculate_rising_emis,
    calculate_unused_points,
    validate_annual_fee,
    validate_card_fit,
    validate_carrying_balance,
    validate_loan_offer,
    validate_multi_card,
    validate_new_purchase,
    validate_rejected_shortfall,
    validate_rising_emis,
    validate_unused_points,
)

borrow_router = APIRouter(prefix="/v1/borrowing-intelligence", tags=["borrowing-intelligence"])
rewards_router = APIRouter(prefix="/v1/money-value", tags=["money-value"])


def _bad_request(exc: SituationValidationError) -> HTTPException:
    return HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))


@borrow_router.post("/rising-emis-check", response_model=SituationResultOut)
def rising_emis_check(payload: RisingEmisRequest) -> SituationResultOut:
    try:
        validate_rising_emis(payload.income, payload.essentials, payload.emis)
    except SituationValidationError as exc:
        raise _bad_request(exc) from exc
    return situation_result_to_response(calculate_rising_emis(income=payload.income, essentials=payload.essentials, emis=payload.emis, overdue=payload.overdue))


@borrow_router.post("/new-purchase-check", response_model=SituationResultOut)
def new_purchase_check(payload: NewPurchaseRequest) -> SituationResultOut:
    try:
        validate_new_purchase(payload.price, payload.down, payload.emi, payload.months, payload.income, payload.costs)
    except SituationValidationError as exc:
        raise _bad_request(exc) from exc
    return situation_result_to_response(
        calculate_new_purchase(price=payload.price, down=payload.down, emi=payload.emi, months=payload.months, income=payload.income, costs=payload.costs)
    )


@borrow_router.post("/loan-offer-check", response_model=SituationResultOut)
def loan_offer_check(payload: LoanOfferRequest) -> SituationResultOut:
    try:
        validate_loan_offer(payload.principal, payload.emi, payload.months, payload.income, payload.costs)
    except SituationValidationError as exc:
        raise _bad_request(exc) from exc
    return situation_result_to_response(
        calculate_loan_offer(principal=payload.principal, emi=payload.emi, months=payload.months, income=payload.income, costs=payload.costs)
    )


@borrow_router.post("/rejected-shortfall-check", response_model=SituationResultOut)
def rejected_shortfall_check(payload: RejectedShortfallRequest) -> SituationResultOut:
    try:
        validate_rejected_shortfall(payload.emi, payload.income, payload.costs)
    except SituationValidationError as exc:
        raise _bad_request(exc) from exc
    return situation_result_to_response(calculate_rejected_shortfall(emi=payload.emi, income=payload.income, costs=payload.costs))


@rewards_router.post("/annual-fee-check", response_model=SituationResultOut)
def annual_fee_check(payload: AnnualFeeRequest) -> SituationResultOut:
    try:
        validate_annual_fee(payload.redeemed, payload.fee, payload.interest)
    except SituationValidationError as exc:
        raise _bad_request(exc) from exc
    return situation_result_to_response(calculate_annual_fee(redeemed=payload.redeemed, fee=payload.fee, interest=payload.interest))


@rewards_router.post("/card-fit-check", response_model=SituationResultOut)
def card_fit_check(payload: CardFitRequest) -> SituationResultOut:
    try:
        validate_card_fit(payload.spend)
    except SituationValidationError as exc:
        raise _bad_request(exc) from exc
    return situation_result_to_response(calculate_card_fit(category=payload.category, spend=payload.spend))


@rewards_router.post("/carrying-balance-check", response_model=SituationResultOut)
def carrying_balance_check(payload: CarryingBalanceRequest) -> SituationResultOut:
    try:
        validate_carrying_balance(payload.known, payload.interest, payload.rewards)
    except SituationValidationError as exc:
        raise _bad_request(exc) from exc
    return situation_result_to_response(calculate_carrying_balance(known=payload.known, interest=payload.interest, rewards=payload.rewards))


@rewards_router.post("/multi-card-check", response_model=SituationResultOut)
def multi_card_check(payload: MultiCardRequest) -> SituationResultOut:
    try:
        validate_multi_card(payload.fee1, payload.reward1, payload.fee2, payload.reward2)
    except SituationValidationError as exc:
        raise _bad_request(exc) from exc
    return situation_result_to_response(calculate_multi_card(fee1=payload.fee1, reward1=payload.reward1, fee2=payload.fee2, reward2=payload.reward2))


@rewards_router.post("/unused-points-check", response_model=SituationResultOut)
def unused_points_check(payload: UnusedPointsRequest) -> SituationResultOut:
    try:
        validate_unused_points(payload.points, payload.value, payload.fee)
    except SituationValidationError as exc:
        raise _bad_request(exc) from exc
    return situation_result_to_response(calculate_unused_points(points=payload.points, value=payload.value, fee=payload.fee))
