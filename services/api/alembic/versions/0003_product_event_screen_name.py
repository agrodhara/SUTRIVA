"""product event screen_name

Adds the bounded, categorical ``screen_name`` column to ``product_events``.

Revision ID: 0003_product_event_screen_name
Revises: 0002_phase_b_anon_continuity
Create Date: 2026-09-20 00:00:01
"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "0003_product_event_screen_name"
down_revision: str | None = "0002_phase_b_anon_continuity"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

CONSTRAINT_NAME = "ck_product_events_screen_name"

# Must match SCREEN_NAME_JOURNEY in app/models/product_event.py. Kept literal
# here so the migration stays reproducible if application code changes.
SCREEN_NAMES = (
    "rewards_card_behaviour",
    "rewards_priorities_inputs",
    "rewards_check",
    "rewards_connected_example",
    "borrow_monthly_position",
    "borrow_plan",
    "borrow_check",
    "borrow_connected_example",
)


def upgrade() -> None:
    op.add_column("product_events", sa.Column("screen_name", sa.String(length=32), nullable=True))
    allowed = ", ".join(f"'{name}'" for name in SCREEN_NAMES)
    op.create_check_constraint(
        CONSTRAINT_NAME,
        "product_events",
        f"screen_name IS NULL OR screen_name IN ({allowed})",
    )


def downgrade() -> None:
    op.drop_constraint(CONSTRAINT_NAME, "product_events", type_="check")
    op.drop_column("product_events", "screen_name")
