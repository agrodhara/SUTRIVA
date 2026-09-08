from fastapi import APIRouter

from app.models.comfortable_borrowing import (
    ComfortableBorrowingCheckRequest,
    ComfortableBorrowingCheckResponse,
)
from app.services.comfortable_borrowing import build_comfortable_borrowing_check

router = APIRouter(
    prefix="/v1/borrowing-intelligence",
    tags=["borrowing-intelligence"],
)


@router.post(
    "/comfortable-borrowing-check",
    response_model=ComfortableBorrowingCheckResponse,
)
def comfortable_borrowing_check(
    payload: ComfortableBorrowingCheckRequest,
) -> ComfortableBorrowingCheckResponse:
    return build_comfortable_borrowing_check(payload)
