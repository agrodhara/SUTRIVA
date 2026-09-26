"""situation screen names

Extends the bounded, categorical ``screen_name`` allowlist with the nine narrow Phase 1.1A "situation"
checks introduced alongside this migration (Borrow Better: rising EMIs, new purchase, loan offer,
rejected/offered less; Rewards Intelligence: annual fee, card fit, carrying a balance, several cards,
unused points). Each situation gets exactly three screen names — ``..._arrival`` (the question-framing
screen), ``..._inputs`` and ``..._result`` — replacing the old fixed four-screen-per-journey taxonomy this
redesign retires. The original eight names are kept in the allowlist so historical rows already using them
stay valid; no row is rewritten and no analytics event ever carries a raw financial value regardless of
which screen name it uses.

Revision ID: 0006_situation_screen_names
Revises: 0005_otp_send_log
Create Date: 2026-09-26 00:00:00
"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op


revision: str = "0006_situation_screen_names"
down_revision: str | None = "0005_otp_send_log"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

CONSTRAINT_NAME = "ck_product_events_screen_name"

# Must match SCREEN_NAME_JOURNEY in app/models/product_event.py.
PREVIOUS_SCREEN_NAMES = (
    "rewards_card_behaviour",
    "rewards_priorities_inputs",
    "rewards_check",
    "rewards_connected_example",
    "borrow_monthly_position",
    "borrow_plan",
    "borrow_check",
    "borrow_connected_example",
)

SITUATION_KEYS = (
    "borrow_debt",
    "borrow_purchase",
    "borrow_offer",
    "borrow_rejected",
    "rewards_fee",
    "rewards_fit",
    "rewards_balance",
    "rewards_multi",
    "rewards_unused",
)

NEW_SCREEN_NAMES = tuple(f"{key}_{suffix}" for key in SITUATION_KEYS for suffix in ("arrival", "inputs", "result"))

ALL_SCREEN_NAMES = PREVIOUS_SCREEN_NAMES + NEW_SCREEN_NAMES


def _set_constraint(names: tuple[str, ...]) -> None:
    allowed = ", ".join(f"'{name}'" for name in names)
    op.create_check_constraint(
        CONSTRAINT_NAME,
        "product_events",
        f"screen_name IS NULL OR screen_name IN ({allowed})",
    )


def upgrade() -> None:
    op.drop_constraint(CONSTRAINT_NAME, "product_events", type_="check")
    _set_constraint(ALL_SCREEN_NAMES)


def downgrade() -> None:
    op.drop_constraint(CONSTRAINT_NAME, "product_events", type_="check")
    _set_constraint(PREVIOUS_SCREEN_NAMES)
