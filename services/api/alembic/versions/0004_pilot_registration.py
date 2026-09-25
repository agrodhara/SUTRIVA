"""pilot registration (phase 1.1b step 6)

Adds the two tables the Step 6 pilot-interest handoff needs:

- ``pilot_registrations``: one row per Step 6A interest click. A phone number and
  optional-updates choice are added at Step 6B. ``anonymous_session_uuid`` stays
  NULL until a successful OTP verification links it — never before.
- ``otp_challenges``: one row per OTP send (including resends). Only a salted hash
  of the code is stored, never the code itself. Attempt count and expiry are
  enforced in the database, not just in application code.

No column on either table may ever hold the OTP code itself or any raw
authentication material — see ``ck_otp_challenges_code_hash_length``, which forces
the hash to be exactly a SHA-256 digest's length, not a plaintext code.

Revision ID: 0004_pilot_registration
Revises: 0003_product_event_screen_name
Create Date: 2026-09-25 00:00:01
"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "0004_pilot_registration"
down_revision: str | None = "0003_product_event_screen_name"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "pilot_registrations",
        sa.Column("pilot_registration_uuid", sa.UUID(), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("journey", sa.Text(), nullable=False),
        sa.Column("journey_run_uuid", sa.UUID(), nullable=True),
        # NULL until a successful OTP verification links it (see history-linking rule in
        # docs/product/journeys/JOURNEY_FLOW_SPEC.md). Step 6A never populates this.
        sa.Column("anonymous_session_uuid", sa.UUID(), nullable=True),
        sa.Column("status", sa.Text(), nullable=False, server_default=sa.text("'interest_clicked'")),
        # E.164 phone number. Present only from Step 6B onward (status >= mobile_submitted).
        # Never included in any product_events payload — see app/models/pilot.py.
        sa.Column("phone_number", sa.Text(), nullable=True),
        sa.Column("phone_verified_at", sa.DateTime(timezone=True), nullable=True),
        # A separate, unchecked-by-default signal from pilot registration itself.
        sa.Column("optional_updates_opted_in", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("pilot_registration_uuid"),
        sa.ForeignKeyConstraint(["journey_run_uuid"], ["journey_runs.journey_run_uuid"], ondelete="SET NULL", onupdate="CASCADE"),
        sa.ForeignKeyConstraint(["anonymous_session_uuid"], ["anonymous_sessions.anonymous_session_uuid"], ondelete="SET NULL", onupdate="CASCADE"),
        sa.CheckConstraint("journey IN ('money_value', 'comfortable_borrowing')", name="ck_pilot_registrations_journey"),
        sa.CheckConstraint(
            "status IN ('interest_clicked', 'mobile_submitted', 'otp_sent', 'verified')",
            name="ck_pilot_registrations_status",
        ),
        sa.CheckConstraint("phone_number IS NULL OR phone_number ~ '^\\+[1-9][0-9]{7,14}$'", name="ck_pilot_registrations_phone_e164"),
        # The one hard privacy invariant of this table: a link can only exist alongside a verification, but
        # a verification does not require a link (no valid anonymous session cookie was presented at verify
        # time is a normal, allowed outcome — the phone is still verified, it just isn't linked to a
        # history). One-directional on purpose: linked => verified, not verified => linked.
        sa.CheckConstraint(
            "anonymous_session_uuid IS NULL OR phone_verified_at IS NOT NULL",
            name="ck_pilot_registrations_link_requires_verification",
        ),
        sa.CheckConstraint(
            "status <> 'verified' OR (phone_verified_at IS NOT NULL AND phone_number IS NOT NULL)",
            name="ck_pilot_registrations_verified_requires_phone",
        ),
    )
    op.create_index("idx_pilot_registrations_created_at", "pilot_registrations", [sa.text("created_at DESC")])
    op.create_index(
        "idx_pilot_registrations_phone_number",
        "pilot_registrations",
        ["phone_number"],
        postgresql_where=sa.text("phone_number IS NOT NULL"),
    )

    op.create_table(
        "otp_challenges",
        sa.Column("otp_challenge_uuid", sa.UUID(), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("pilot_registration_uuid", sa.UUID(), nullable=False),
        sa.Column("code_hash", sa.LargeBinary(), nullable=False),
        sa.Column("attempt_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("max_attempts", sa.Integer(), nullable=False, server_default=sa.text("5")),
        sa.Column("send_count", sa.Integer(), nullable=False, server_default=sa.text("1")),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_sent_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("otp_challenge_uuid"),
        sa.ForeignKeyConstraint(["pilot_registration_uuid"], ["pilot_registrations.pilot_registration_uuid"], ondelete="CASCADE", onupdate="CASCADE"),
        sa.CheckConstraint("octet_length(code_hash) = 32", name="ck_otp_challenges_code_hash_length"),
        sa.CheckConstraint("attempt_count >= 0 AND attempt_count <= max_attempts", name="ck_otp_challenges_attempt_count"),
        sa.CheckConstraint("send_count >= 1", name="ck_otp_challenges_send_count"),
        sa.CheckConstraint("expires_at > created_at", name="ck_otp_challenges_expires_after_create"),
    )
    op.create_index(
        "uq_otp_challenges_one_active_per_registration",
        "otp_challenges",
        ["pilot_registration_uuid"],
        unique=True,
        postgresql_where=sa.text("consumed_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_otp_challenges_one_active_per_registration", table_name="otp_challenges")
    op.drop_table("otp_challenges")
    op.drop_index("idx_pilot_registrations_phone_number", table_name="pilot_registrations")
    op.drop_index("idx_pilot_registrations_created_at", table_name="pilot_registrations")
    op.drop_table("pilot_registrations")
