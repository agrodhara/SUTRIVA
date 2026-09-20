"""phase b anonymous continuity

Revision ID: 0002_phase_b_anon_continuity
Revises: 0001_phase_a_baseline
Create Date: 2026-09-19 00:00:01
"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "0002_phase_b_anon_continuity"
down_revision: str | None = "0001_phase_a_baseline"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")
    op.execute(
        """
        CREATE FUNCTION set_row_updated_at()
        RETURNS trigger
        LANGUAGE plpgsql
        AS $$
        BEGIN
            NEW.updated_at = now();
            RETURN NEW;
        END;
        $$
        """
    )

    op.create_table(
        "anonymous_sessions",
        sa.Column("anonymous_session_uuid", sa.UUID(), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("first_seen_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("absolute_expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.Text(), nullable=False, server_default=sa.text("'active'")),
        sa.Column("expired_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revocation_reason", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("anonymous_session_uuid"),
        sa.CheckConstraint("absolute_expires_at > created_at", name="ck_anonymous_sessions_absolute_expires_after_create"),
        sa.CheckConstraint(
            "((status = 'active' AND expired_at IS NULL AND revoked_at IS NULL) OR (status = 'expired' AND expired_at IS NOT NULL AND revoked_at IS NULL) OR (status = 'revoked' AND revoked_at IS NOT NULL AND expired_at IS NULL))",
            name="ck_anonymous_sessions_status_timestamps",
        ),
        sa.CheckConstraint(
            "revocation_reason IS NULL OR revocation_reason IN ('logout', 'compromised', 'server_forced')",
            name="ck_anonymous_sessions_revocation_reason",
        ),
    )
    op.create_index("idx_anonymous_sessions_absolute_expires_at", "anonymous_sessions", ["absolute_expires_at"])
    op.create_index("idx_anonymous_sessions_last_seen_at", "anonymous_sessions", [sa.text("last_seen_at DESC")])

    op.create_table(
        "anonymous_session_tokens",
        sa.Column("anonymous_session_token_uuid", sa.UUID(), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("anonymous_session_uuid", sa.UUID(), nullable=False),
        sa.Column("token_digest", sa.LargeBinary(), nullable=False),
        sa.Column("issued_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("original_absolute_expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rotation_reason", sa.Text(), nullable=False, server_default=sa.text("'issued'")),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("grace_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("predecessor_token_uuid", sa.UUID(), nullable=True),
        sa.PrimaryKeyConstraint("anonymous_session_token_uuid"),
        sa.ForeignKeyConstraint(["anonymous_session_uuid"], ["anonymous_sessions.anonymous_session_uuid"], ondelete="CASCADE", onupdate="CASCADE"),
        sa.ForeignKeyConstraint(["predecessor_token_uuid"], ["anonymous_session_tokens.anonymous_session_token_uuid"], ondelete="SET NULL", onupdate="CASCADE"),
        sa.CheckConstraint("octet_length(token_digest) = 32", name="ck_anonymous_session_tokens_digest_length"),
        sa.CheckConstraint(
            "rotation_reason IN ('issued', 'bootstrap_rotation', 'grace_rotation', 'logout', 'compromised', 'expired', 'superseded')",
            name="ck_anonymous_session_tokens_rotation_reason",
        ),
        sa.CheckConstraint("original_absolute_expires_at >= issued_at", name="ck_anonymous_session_tokens_absolute_expires_at"),
        sa.CheckConstraint(
            "grace_expires_at IS NULL OR (grace_expires_at >= issued_at AND grace_expires_at <= original_absolute_expires_at)",
            name="ck_anonymous_session_tokens_grace_window",
        ),
        sa.CheckConstraint("revoked_at IS NULL OR revoked_at >= issued_at", name="ck_anonymous_session_tokens_revoked_after_issue"),
        sa.CheckConstraint("NOT (revoked_at IS NOT NULL AND is_active)", name="ck_anonymous_session_tokens_inactive_if_revoked"),
        sa.UniqueConstraint("token_digest", name="uq_anonymous_session_tokens_token_digest"),
    )
    op.create_index(
        "uq_session_one_primary_token",
        "anonymous_session_tokens",
        ["anonymous_session_uuid"],
        unique=True,
        postgresql_where=sa.text("is_active AND grace_expires_at IS NULL"),
    )
    op.create_index(
        "uq_session_one_grace_token",
        "anonymous_session_tokens",
        ["anonymous_session_uuid"],
        unique=True,
        postgresql_where=sa.text("is_active AND grace_expires_at IS NOT NULL"),
    )
    op.create_index("idx_anonymous_session_tokens_session_issued_at", "anonymous_session_tokens", ["anonymous_session_uuid", sa.text("issued_at DESC")])

    op.create_table(
        "journey_runs",
        sa.Column("journey_run_uuid", sa.UUID(), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("anonymous_session_uuid", sa.UUID(), nullable=False),
        sa.Column("client_journey_run_id", sa.Text(), nullable=False),
        sa.Column("journey", sa.Text(), nullable=False),
        sa.Column("version", sa.Text(), nullable=False),
        sa.Column("decision_context", sa.Text(), nullable=False, server_default=sa.text("'local_demo'")),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_event_received_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("journey_run_uuid"),
        sa.ForeignKeyConstraint(["anonymous_session_uuid"], ["anonymous_sessions.anonymous_session_uuid"], ondelete="CASCADE", onupdate="CASCADE"),
        sa.UniqueConstraint("anonymous_session_uuid", "client_journey_run_id", name="uq_journey_runs_session_client_run"),
        sa.CheckConstraint("journey IN ('money_value', 'comfortable_borrowing')", name="ck_journey_runs_journey"),
        sa.CheckConstraint("char_length(client_journey_run_id) BETWEEN 1 AND 128", name="ck_journey_runs_client_run_len"),
        sa.CheckConstraint("char_length(version) BETWEEN 1 AND 80", name="ck_journey_runs_version_len"),
        sa.CheckConstraint("completed_at IS NULL OR completed_at >= started_at", name="ck_journey_runs_completed_after_started"),
    )
    op.create_index("idx_journey_runs_session_created_at", "journey_runs", ["anonymous_session_uuid", sa.text("created_at DESC")])
    op.create_index("idx_journey_runs_session_journey_started", "journey_runs", ["anonymous_session_uuid", "journey", sa.text("started_at DESC")])

    op.create_table(
        "product_events",
        sa.Column("product_event_uuid", sa.UUID(), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("anonymous_session_uuid", sa.UUID(), nullable=False),
        sa.Column("journey_run_uuid", sa.UUID(), nullable=False),
        sa.Column("event_id", sa.Text(), nullable=False),
        sa.Column("event_type", sa.Text(), nullable=False),
        sa.Column("journey", sa.Text(), nullable=False),
        sa.Column("version", sa.Text(), nullable=False),
        sa.Column("decision_context", sa.Text(), nullable=False, server_default=sa.text("'local_demo'")),
        sa.Column("card_check_number", sa.Integer(), nullable=True),
        sa.Column("client_occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("effective_occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("client_clock_skew_seconds", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("client_clock_skew_status", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("product_event_uuid"),
        sa.ForeignKeyConstraint(["anonymous_session_uuid"], ["anonymous_sessions.anonymous_session_uuid"], ondelete="CASCADE", onupdate="CASCADE"),
        sa.ForeignKeyConstraint(["journey_run_uuid"], ["journey_runs.journey_run_uuid"], ondelete="CASCADE", onupdate="CASCADE"),
        sa.UniqueConstraint("anonymous_session_uuid", "event_id", name="uq_product_events_session_event_id"),
        sa.CheckConstraint("journey IN ('money_value', 'comfortable_borrowing')", name="ck_product_events_journey"),
        sa.CheckConstraint("char_length(event_id) BETWEEN 1 AND 128", name="ck_product_events_event_id_len"),
        sa.CheckConstraint("char_length(event_type) BETWEEN 1 AND 80", name="ck_product_events_event_type_len"),
        sa.CheckConstraint("char_length(version) BETWEEN 1 AND 80", name="ck_product_events_version_len"),
        sa.CheckConstraint("card_check_number IS NULL OR (journey = 'money_value' AND card_check_number >= 1)", name="ck_product_events_card_check_number"),
        sa.CheckConstraint("client_clock_skew_status IN ('trusted', 'clamped_past', 'clamped_future')", name="ck_product_events_clock_skew_status"),
    )
    op.create_index("idx_product_events_journey_run_received_at", "product_events", ["journey_run_uuid", sa.text("received_at ASC")])
    op.create_index("idx_product_events_session_received_at", "product_events", ["anonymous_session_uuid", sa.text("received_at DESC")])
    op.create_index("idx_product_events_event_type_received_at", "product_events", ["event_type", sa.text("received_at DESC")])

    op.create_table(
        "campaign_attribution",
        sa.Column("campaign_attribution_uuid", sa.UUID(), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("anonymous_session_uuid", sa.UUID(), nullable=False),
        sa.Column("journey_run_uuid", sa.UUID(), nullable=True),
        sa.Column("touch_kind", sa.Text(), nullable=False),
        sa.Column("utm_source", sa.String(length=120), nullable=True),
        sa.Column("utm_medium", sa.String(length=120), nullable=True),
        sa.Column("utm_campaign", sa.String(length=120), nullable=True),
        sa.Column("utm_content", sa.String(length=120), nullable=True),
        sa.Column("utm_term", sa.String(length=120), nullable=True),
        sa.Column("landing_path", sa.String(length=200), nullable=False),
        sa.Column("referrer", sa.String(length=200), nullable=True),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("campaign_attribution_uuid"),
        sa.ForeignKeyConstraint(["anonymous_session_uuid"], ["anonymous_sessions.anonymous_session_uuid"], ondelete="CASCADE", onupdate="CASCADE"),
        sa.ForeignKeyConstraint(["journey_run_uuid"], ["journey_runs.journey_run_uuid"], ondelete="SET NULL", onupdate="CASCADE"),
        sa.UniqueConstraint("anonymous_session_uuid", "touch_kind", name="uq_campaign_attribution_session_touch_kind"),
        sa.CheckConstraint("touch_kind IN ('first_touch', 'latest_touch')", name="ck_campaign_attribution_touch_kind"),
        sa.CheckConstraint("landing_path ~ '^/[A-Za-z0-9/_-]*$'", name="ck_campaign_attribution_landing_path"),
        sa.CheckConstraint("referrer IS NULL OR position('?' in referrer) = 0", name="ck_campaign_attribution_referrer"),
    )
    op.create_index("idx_campaign_attribution_journey_run_uuid", "campaign_attribution", ["journey_run_uuid"])

    op.create_table(
        "continuation_intents",
        sa.Column("continuation_intent_uuid", sa.UUID(), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("anonymous_session_uuid", sa.UUID(), nullable=False),
        sa.Column("journey_run_uuid", sa.UUID(), nullable=False),
        sa.Column("product_event_uuid", sa.UUID(), nullable=False),
        sa.Column("journey", sa.Text(), nullable=False),
        sa.Column("source_event_type", sa.Text(), nullable=False),
        sa.Column("intent", sa.Text(), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("continuation_intent_uuid"),
        sa.ForeignKeyConstraint(["anonymous_session_uuid"], ["anonymous_sessions.anonymous_session_uuid"], ondelete="CASCADE", onupdate="CASCADE"),
        sa.ForeignKeyConstraint(["journey_run_uuid"], ["journey_runs.journey_run_uuid"], ondelete="CASCADE", onupdate="CASCADE"),
        sa.ForeignKeyConstraint(["product_event_uuid"], ["product_events.product_event_uuid"], ondelete="CASCADE", onupdate="CASCADE"),
        sa.UniqueConstraint("product_event_uuid", name="uq_continuation_intents_product_event_uuid"),
        sa.CheckConstraint("journey IN ('money_value', 'comfortable_borrowing')", name="ck_continuation_intents_journey"),
        sa.CheckConstraint(
            "source_event_type IN ('next_interest_selected', 'go_deeper_selected', 'go_deeper_declined', 'decline_reason_selected')",
            name="ck_continuation_intents_source_event_type",
        ),
        sa.CheckConstraint(
            "((journey = 'comfortable_borrowing' AND intent IN ('actual_obligations', 'improve_readiness')) OR (journey = 'money_value' AND intent IN ('actual_card_value', 'spend_understanding')))",
            name="ck_continuation_intents_intent_by_journey",
        ),
        sa.CheckConstraint(
            "((source_event_type = 'decline_reason_selected' AND reason IS NOT NULL) OR (source_event_type <> 'decline_reason_selected' AND reason IS NULL))",
            name="ck_continuation_intents_reason_required",
        ),
    )
    op.create_index(
        "uq_continuation_intents_session_run_event_intent_reason",
        "continuation_intents",
        [
            "anonymous_session_uuid",
            "journey_run_uuid",
            "source_event_type",
            "intent",
            sa.text("coalesce(reason, '')"),
        ],
        unique=True,
    )
    op.create_index("idx_continuation_intents_session_created_at", "continuation_intents", ["anonymous_session_uuid", sa.text("created_at DESC")])

    for table_name in (
        "anonymous_sessions",
        "journey_runs",
        "product_events",
        "campaign_attribution",
        "continuation_intents",
    ):
        op.execute(
            f"""
            CREATE TRIGGER trg_{table_name}_updated_at
            BEFORE UPDATE ON {table_name}
            FOR EACH ROW
            EXECUTE FUNCTION set_row_updated_at()
            """
        )


def downgrade() -> None:
    for table_name in (
        "continuation_intents",
        "campaign_attribution",
        "product_events",
        "journey_runs",
        "anonymous_sessions",
    ):
        op.execute(f"DROP TRIGGER IF EXISTS trg_{table_name}_updated_at ON {table_name}")

    op.drop_index("idx_continuation_intents_session_created_at", table_name="continuation_intents")
    op.drop_index("uq_continuation_intents_session_run_event_intent_reason", table_name="continuation_intents")
    op.drop_table("continuation_intents")

    op.drop_index("idx_campaign_attribution_journey_run_uuid", table_name="campaign_attribution")
    op.drop_table("campaign_attribution")

    op.drop_index("idx_product_events_event_type_received_at", table_name="product_events")
    op.drop_index("idx_product_events_session_received_at", table_name="product_events")
    op.drop_index("idx_product_events_journey_run_received_at", table_name="product_events")
    op.drop_table("product_events")

    op.drop_index("idx_journey_runs_session_journey_started", table_name="journey_runs")
    op.drop_index("idx_journey_runs_session_created_at", table_name="journey_runs")
    op.drop_table("journey_runs")

    op.drop_index("idx_anonymous_session_tokens_session_issued_at", table_name="anonymous_session_tokens")
    op.drop_index("uq_session_one_grace_token", table_name="anonymous_session_tokens")
    op.drop_index("uq_session_one_primary_token", table_name="anonymous_session_tokens")
    op.drop_table("anonymous_session_tokens")

    op.drop_index("idx_anonymous_sessions_last_seen_at", table_name="anonymous_sessions")
    op.drop_index("idx_anonymous_sessions_absolute_expires_at", table_name="anonymous_sessions")
    op.drop_table("anonymous_sessions")

    op.execute("DROP FUNCTION IF EXISTS set_row_updated_at()")