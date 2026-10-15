"""saved borrow checks

Milestone 2C: lets a visitor save a completed B1 (Borrow Better) check result and reopen it later via an
emailed link. See docs/product/journeys/B1_SAVED_CHECK_SPEC.md for the full specification and the
reasoning behind every choice below — this migration implements that spec's "Data stored" section
exactly, not a new design.

Deliberately a new table, not an extension of an existing one — two existing tables were checked and
rejected for specific, structural reasons (see the spec's "Why a new table" section): ``
situation_pilot_interest`` has a unique(email, situation_key) index that would forbid saving more than one
check per email per situation, and its own migration (0007) states its purpose is interest-signalling,
not storing input/result data; ``pilot_registrations`` is scoped to phone/OTP identity, unrelated to
calculation snapshots.

Numbering note: this branch's base commit predates migration 0008_group_landing_screen_name.py, which
exists on PR #33's unmerged branch (task/campaign-tracking-fixes). Both branches are at revision 0007
today. Whichever of the two PRs merges second will need its migration renumbered and its down_revision
updated at merge/rebase time — a normal consequence of two unmerged PRs each adding a migration off the
same base, not something resolved here, and not silently left unflagged.

v1 scope only: email-retrieval (Option A from the spec). ``pilot_registration_uuid`` exists so an
OTP-retrieval option (Option B, explicitly not recommended for v1) could be added later without a second
migration, but nothing in this release populates or reads it.

Revision ID: 0008_saved_borrow_checks
Revises: 0007_situation_pilot_interest
Create Date: 2026-10-14 00:00:00
"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "0008_saved_borrow_checks"
down_revision: str | None = "0007_situation_pilot_interest"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# B1-only for v1, per the spec's explicit scope — widen this (and rename the table, per the spec's own
# note) if/when R1 reuses this mechanism, rather than assuming that decision here.
SITUATION_KEYS = ("debt", "purchase", "offer", "rejected")


def upgrade() -> None:
    op.create_table(
        "saved_borrow_checks",
        sa.Column("saved_borrow_check_uuid", sa.UUID(), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "situation_key", sa.Text(), nullable=False,
        ),
        # Best-effort link only, same pattern as situation_pilot_interest.anonymous_session_uuid: a
        # missing or invalid session cookie must never block a save from succeeding.
        sa.Column("anonymous_session_uuid", sa.UUID(), nullable=True),
        # Populated only under the email-retrieval option (v1). Normalized (stripped, lowercased) at the
        # application layer before this ever reaches the database, same discipline as
        # situation_pilot_interest.email — see app/models/saved_borrow_check.py.
        sa.Column("access_email", sa.Text(), nullable=True),
        # Reserved for a possible future OTP-retrieval option (spec's Option B) — never populated or read
        # by any code this migration ships with.
        sa.Column("pilot_registration_uuid", sa.UUID(), nullable=True),
        # The situation's own field values as submitted, validated server-side against the same field set
        # the live calculation already validates — never accepted as free-form at the database layer.
        sa.Column("input_values", sa.JSON(), nullable=False),
        sa.Column("provenance", sa.Text(), nullable=False),
        # The exact SituationResult fields, stored as returned — never recalculated on save or retrieval.
        sa.Column("result_title", sa.Text(), nullable=False),
        sa.Column("result_headline", sa.Text(), nullable=False),
        sa.Column("result_detail", sa.Text(), nullable=False),
        sa.Column("result_insight", sa.Text(), nullable=False),
        sa.Column("result_scenario", sa.Text(), nullable=False),
        sa.Column("result_note", sa.Text(), nullable=False),
        sa.Column("result_bars", sa.JSON(), nullable=False),
        # SHA-256 of the raw retrieval token — the raw token is never stored. Unlike the OTP code hash
        # (app/services/pilot.py), this is a single, unkeyed hash rather than an HMAC with a rotatable
        # server-side key: the retrieval token is a high-entropy random value (32 bytes, see
        # app/services/saved_borrow_checks.py), not a brute-forceable 6-digit code, so a keyed secret adds
        # no practical protection an attacker with the hash couldn't already be defeated by the token's own
        # entropy. Stated here so the asymmetry with the OTP design is a deliberate choice, not an
        # inconsistency.
        sa.Column("retrieval_token_hash", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("saved_borrow_check_uuid"),
        sa.ForeignKeyConstraint(
            ["anonymous_session_uuid"], ["anonymous_sessions.anonymous_session_uuid"],
            ondelete="SET NULL", onupdate="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["pilot_registration_uuid"], ["pilot_registrations.pilot_registration_uuid"],
            ondelete="SET NULL", onupdate="CASCADE",
        ),
        sa.CheckConstraint(
            "situation_key IN (" + ", ".join(f"'{key}'" for key in SITUATION_KEYS) + ")",
            name="ck_saved_borrow_checks_situation_key",
        ),
        sa.CheckConstraint("provenance IN ('example', 'mixed', 'own')", name="ck_saved_borrow_checks_provenance"),
        sa.CheckConstraint(
            "access_email IS NULL OR access_email = lower(btrim(access_email))",
            name="ck_saved_borrow_checks_email_normalized",
        ),
        sa.CheckConstraint(
            r"access_email IS NULL OR access_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'",
            name="ck_saved_borrow_checks_email_shape",
        ),
        # v1 is email-only, but the column exists for a possible future OTP option — require that whichever
        # one is used, exactly one identity path is actually present, never neither (an unretrievable save
        # would be silently useless) and never both (an ambiguous ownership story).
        sa.CheckConstraint(
            "(access_email IS NOT NULL)::int + (pilot_registration_uuid IS NOT NULL)::int = 1",
            name="ck_saved_borrow_checks_exactly_one_identity",
        ),
        sa.CheckConstraint("expires_at > created_at", name="ck_saved_borrow_checks_expiry_after_creation"),
    )
    # Fast lookup path for the retrieval endpoint — looked up by hash, never by the raw token.
    op.create_index("idx_saved_borrow_checks_retrieval_token_hash", "saved_borrow_checks", ["retrieval_token_hash"], unique=True)
    # Drives the retention-purge job's sweep (rows past expires_at, or soft-deleted past a grace window).
    op.create_index("idx_saved_borrow_checks_expires_at", "saved_borrow_checks", ["expires_at"])


def downgrade() -> None:
    op.drop_index("idx_saved_borrow_checks_expires_at", table_name="saved_borrow_checks")
    op.drop_index("idx_saved_borrow_checks_retrieval_token_hash", table_name="saved_borrow_checks")
    op.drop_table("saved_borrow_checks")
