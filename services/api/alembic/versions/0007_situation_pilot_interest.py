"""situation pilot interest

Adds the optional, post-result pilot-interest email handoff for the nine Phase 1.1A situation checks
(consolidated product correction — Copilot review + founder decisions, 2026-09-26). This is a distinct,
new capture, deliberately separate from the Phase 1.1B ``pilot_registrations``/``otp_challenges`` tables
added by migration 0004: it collects only an email address and the situation it was left for, never a
phone number, OTP or consent flag, and submitting it is never treated as consent to promotional updates
(there is no such column on this table at all — a lead cannot be silently opted in by adding one later
without a further migration and its own review).

- ``situation_pilot_interest``: one row per (email, situation_key) the visitor actually registered for.
  A second submission of the same email for the same situation is idempotent at the database level (see
  the unique index below and app/repositories/situation_pilot_interest.py's ON CONFLICT DO NOTHING) — the
  visitor sees the same success copy either way, and no duplicate row is ever created. The same email
  registering interest from a *different* situation is a distinct, legitimate row: this table's job is to
  tell the operator which situations generated interest, not just who is interested.

- Extends the existing bounded ``ck_product_events_screen_name`` allowlist (see migration 0006) with one
  new ``..._pilot`` screen name per situation, so the funnel events this form emits (its own appearance,
  and its submission) can be told apart from that situation's arrival/inputs/result screens. No column on
  ``product_events`` ever gains the ability to carry an email address — screen_name stays a bounded,
  categorical value, exactly as before.

Revision ID: 0007_situation_pilot_interest
Revises: 0006_situation_screen_names
Create Date: 2026-09-26 00:00:01
"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "0007_situation_pilot_interest"
down_revision: str | None = "0006_situation_screen_names"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

CONSTRAINT_NAME = "ck_product_events_screen_name"

# Must match SCREEN_NAME_JOURNEY / ScreenNameType in app/models/product_event.py.
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

NEW_PILOT_SCREEN_NAMES = tuple(f"{key}_pilot" for key in SITUATION_KEYS)

ALL_SCREEN_NAMES = PREVIOUS_SCREEN_NAMES + NEW_PILOT_SCREEN_NAMES

# Short frontend situation keys (apps/pwa/app/situations/situationsConfig.ts's SituationKey), distinct
# from the prefixed analytics screen_name above — see app/models/situation_pilot_interest.py's
# SituationKeyType docstring for why this table uses the short form.
BORROW_KEYS = ("debt", "purchase", "offer", "rejected")
REWARDS_KEYS = ("fee", "fit", "balance", "multi", "unused")
ALL_SITUATION_KEYS = BORROW_KEYS + REWARDS_KEYS


def _set_screen_name_constraint(names: tuple[str, ...]) -> None:
    allowed = ", ".join(f"'{name}'" for name in names)
    op.create_check_constraint(
        CONSTRAINT_NAME,
        "product_events",
        f"screen_name IS NULL OR screen_name IN ({allowed})",
    )


def upgrade() -> None:
    op.create_table(
        "situation_pilot_interest",
        sa.Column("situation_pilot_interest_uuid", sa.UUID(), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("journey", sa.Text(), nullable=False),
        sa.Column("situation_key", sa.Text(), nullable=False),
        # Normalized (stripped, lowercased) at the application layer before this ever reaches the
        # database — see app/models/situation_pilot_interest.py's validate_and_normalize_email. Never
        # included in any product_events payload, URL or log line; see app/routers/situation_pilot_interest.py.
        sa.Column("email", sa.Text(), nullable=False),
        # Best-effort link only, exactly like pilot_registrations.anonymous_session_uuid: a missing or
        # invalid session cookie must never block this submission from succeeding.
        sa.Column("anonymous_session_uuid", sa.UUID(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("situation_pilot_interest_uuid"),
        sa.ForeignKeyConstraint(["anonymous_session_uuid"], ["anonymous_sessions.anonymous_session_uuid"], ondelete="SET NULL", onupdate="CASCADE"),
        sa.CheckConstraint("journey IN ('money_value', 'comfortable_borrowing')", name="ck_situation_pilot_interest_journey"),
        sa.CheckConstraint(
            "situation_key IN (" + ", ".join(f"'{key}'" for key in ALL_SITUATION_KEYS) + ")",
            name="ck_situation_pilot_interest_situation_key",
        ),
        sa.CheckConstraint(
            "(journey = 'comfortable_borrowing' AND situation_key IN (" + ", ".join(f"'{key}'" for key in BORROW_KEYS) + "))"
            " OR (journey = 'money_value' AND situation_key IN (" + ", ".join(f"'{key}'" for key in REWARDS_KEYS) + "))",
            name="ck_situation_pilot_interest_journey_matches_situation",
        ),
        sa.CheckConstraint("email = lower(btrim(email))", name="ck_situation_pilot_interest_email_normalized"),
        sa.CheckConstraint(r"email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'", name="ck_situation_pilot_interest_email_shape"),
    )
    op.create_index("idx_situation_pilot_interest_created_at", "situation_pilot_interest", [sa.text("created_at DESC")])
    # Enforces the one-row-per-(email, situation) invariant at the database level (see
    # app/repositories/situation_pilot_interest.py's ON CONFLICT DO NOTHING, which relies on this exact
    # index existing) and doubles as the fast lookup path for it.
    op.create_index(
        "uq_situation_pilot_interest_email_situation",
        "situation_pilot_interest",
        ["email", "situation_key"],
        unique=True,
    )

    op.drop_constraint(CONSTRAINT_NAME, "product_events", type_="check")
    _set_screen_name_constraint(ALL_SCREEN_NAMES)


def downgrade() -> None:
    op.drop_constraint(CONSTRAINT_NAME, "product_events", type_="check")
    _set_screen_name_constraint(PREVIOUS_SCREEN_NAMES)

    op.drop_index("uq_situation_pilot_interest_email_situation", table_name="situation_pilot_interest")
    op.drop_index("idx_situation_pilot_interest_created_at", table_name="situation_pilot_interest")
    op.drop_table("situation_pilot_interest")
