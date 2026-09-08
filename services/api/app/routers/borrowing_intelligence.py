from fastapi import APIRouter

from app.models.borrow_better import BorrowBetterQuickCheckRequest, BorrowBetterQuickCheckResponse
from app.routers.borrow_better import quick_check as borrow_better_quick_check

router = APIRouter(prefix="/v1/borrowing-intelligence", tags=["borrowing-intelligence"])


@router.post("/comfortable-borrowing-check", response_model=BorrowBetterQuickCheckResponse)
def comfortable_borrowing_check(payload: BorrowBetterQuickCheckRequest) -> BorrowBetterQuickCheckResponse:
    """Preferred public route. Delegates to the existing borrow-better logic; no duplicated logic."""
    return borrow_better_quick_check(payload)
