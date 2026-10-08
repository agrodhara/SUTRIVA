"""group landing screen_name

Adds one new ``screen_name`` per situation group (``borrow_group_landing``, ``rewards_group_landing``) to
the existing bounded allowlist on ``product_events``, reported with the existing ``step_viewed`` event
type — the same event type and mechanism every other screen in this product already uses, not a new event.

This closes a real measurement gap found auditing the 2026-10-01–03 paid campaign: both campaign
destination URLs opened the group chooser page at ``/borrow-better``/``/money-value`` (no ``?situation=``),
and that page previously emitted no event of its own — only the two existing events below it (a specific
situation's own ``_arrival`` ``step_viewed``, or the home page's unrelated ``door_selected``) ever fired.
A visitor who landed on the chooser and left before picking a situation was recorded only as an anonymous
session row, indistinguishable from a bot or a dropped request. See
``apps/pwa/app/situations/SituationsApp.tsx`` for where this is now emitted, and
``docs/execution/SITUATIONS_REDESIGN.md`` for why it is scoped to exactly this one screen.

Purely additive: no existing screen_name, event type, or table changes meaning. ``door_selected`` and every
situation's own screen names keep their existing semantics unchanged.

Revision ID: 0008_group_landing_screen_name
Revises: 0007_situation_pilot_interest
Create Date: 2026-10-08 00:00:01
"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "0008_group_landing_screen_name"
down_revision: str | None = "0007_situation_pilot_interest"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

CONSTRAINT_NAME = "ck_product_events_screen_name"

# Must match ScreenNameType in app/models/product_event.py.
PREVIOUS_SCREEN_NAMES = (
    "rewards_card_behaviour",
    "rewards_priorities_inputs",
    "rewards_check",
    "rewards_connected_example",
    "borrow_monthly_position",
    "borrow_plan",
    "borrow_check",
    "borrow_connected_example",
    "borrow_debt_arrival",
    "borrow_debt_inputs",
    "borrow_debt_result",
    "borrow_purchase_arrival",
    "borrow_purchase_inputs",
    "borrow_purchase_result",
    "borrow_offer_arrival",
    "borrow_offer_inputs",
    "borrow_offer_result",
    "borrow_rejected_arrival",
    "borrow_rejected_inputs",
    "borrow_rejected_result",
    "rewards_fee_arrival",
    "rewards_fee_inputs",
    "rewards_fee_result",
    "rewards_fit_arrival",
    "rewards_fit_inputs",
    "rewards_fit_result",
    "rewards_balance_arrival",
    "rewards_balance_inputs",
    "rewards_balance_result",
    "rewards_multi_arrival",
    "rewards_multi_inputs",
    "rewards_multi_result",
    "rewards_unused_arrival",
    "rewards_unused_inputs",
    "rewards_unused_result",
    "borrow_debt_pilot",
    "borrow_purchase_pilot",
    "borrow_offer_pilot",
    "borrow_rejected_pilot",
    "rewards_fee_pilot",
    "rewards_fit_pilot",
    "rewards_balance_pilot",
    "rewards_multi_pilot",
    "rewards_unused_pilot",
)

NEW_GROUP_LANDING_SCREEN_NAMES = (
    "borrow_group_landing",
    "rewards_group_landing",
)

ALL_SCREEN_NAMES = PREVIOUS_SCREEN_NAMES + NEW_GROUP_LANDING_SCREEN_NAMES


def _set_screen_name_constraint(names: tuple[str, ...]) -> None:
    allowed = ", ".join(f"'{name}'" for name in names)
    op.create_check_constraint(
        CONSTRAINT_NAME,
        "product_events",
        f"screen_name IS NULL OR screen_name IN ({allowed})",
    )


def upgrade() -> None:
    op.drop_constraint(CONSTRAINT_NAME, "product_events", type_="check")
    _set_screen_name_constraint(ALL_SCREEN_NAMES)


def downgrade() -> None:
    op.drop_constraint(CONSTRAINT_NAME, "product_events", type_="check")
    _set_screen_name_constraint(PREVIOUS_SCREEN_NAMES)
