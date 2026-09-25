"""otp send log (phase 1.1b step 6 — per-phone quota fix)

Adds ``otp_sends``: one append-only row per OTP actually accepted by the SMS
provider (an initial send, a resend, or a "Change number" resubmission), recording
the exact destination phone number at the moment of that send.

This exists to fix a real bug in the per-phone send quota: counting sends by
joining to ``pilot_registrations.phone_number`` (the registration's *current*
number) silently reassigns a registration's earlier sends to whatever number it
later changes to. For example, registration R submits to +91A (one send), then
uses "Change number" to submit +91B (another send) — under the old join, both
sends are attributed to +91B, and +91A's quota is left showing zero usage from R,
even though a real SMS was sent to it. ``otp_sends`` instead records each send's
destination at the time it happened, so the per-phone quota query in
``app/repositories/pilot.py``'s ``count_recent_otp_sends_for_phone`` counts real,
immutable send history rather than re-deriving it from mutable current state.

No column here may ever hold the OTP code itself — this table exists purely to
answer "how many sends went to this number recently", not to reconstruct or
verify a code.

Revision ID: 0005_otp_send_log
Revises: 0004_pilot_registration
Create Date: 2026-09-26 00:00:00
"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "0005_otp_send_log"
down_revision: str | None = "0004_pilot_registration"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "otp_sends",
        sa.Column("otp_send_uuid", sa.UUID(), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("pilot_registration_uuid", sa.UUID(), nullable=False),
        sa.Column("otp_challenge_uuid", sa.UUID(), nullable=False),
        # The destination this specific send actually went to — independent of, and never updated to
        # match, whatever pilot_registrations.phone_number becomes later.
        sa.Column("phone_number", sa.Text(), nullable=False),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("otp_send_uuid"),
        sa.ForeignKeyConstraint(["pilot_registration_uuid"], ["pilot_registrations.pilot_registration_uuid"], ondelete="CASCADE", onupdate="CASCADE"),
        sa.ForeignKeyConstraint(["otp_challenge_uuid"], ["otp_challenges.otp_challenge_uuid"], ondelete="CASCADE", onupdate="CASCADE"),
        sa.CheckConstraint("phone_number ~ '^\\+[1-9][0-9]{7,14}$'", name="ck_otp_sends_phone_e164"),
    )
    # The quota query filters on (phone_number, sent_at); this index serves it directly.
    op.create_index("idx_otp_sends_phone_number_sent_at", "otp_sends", ["phone_number", sa.text("sent_at DESC")])
    op.create_index("idx_otp_sends_pilot_registration_uuid", "otp_sends", ["pilot_registration_uuid"])


def downgrade() -> None:
    op.drop_index("idx_otp_sends_pilot_registration_uuid", table_name="otp_sends")
    op.drop_index("idx_otp_sends_phone_number_sent_at", table_name="otp_sends")
    op.drop_table("otp_sends")
