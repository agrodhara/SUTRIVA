"""saved check notice version (request evidence)

Milestone 2, round 2 (Part D correction): the first version of this feature recorded a save request with
no evidence of what notice text the visitor actually saw when they asked for it. This is not a consent
record — saving your own calculation and asking for an emailed link to it is a requested service action,
not something requiring marketing-style consent (see docs/execution/PERMISSION_RECORDS_ASSESSMENT.md,
corrected this round to withdraw an earlier, overly categorical "no consent flow needed" statement). But a
requested service action still deserves evidence of *what was requested and under what stated terms* —
if the notice copy on SaveCheckForm.tsx is ever revised, there should be a way to know which wording a
given saved row's request actually happened under, rather than silently reinterpreting every past row
under today's wording.

``notice_version`` is a short, bounded identifier for the exact notice text shown at save time (see
``app/services/saved_borrow_checks.py``'s ``SAVE_CHECK_NOTICE_VERSION``), not the notice text itself —
the text lives in the frontend and this project's own docs, not duplicated into every row.
``created_at`` (already on this table) is the timestamp of that same request; no second timestamp column
is needed.

Revision ID: 0009_saved_check_notice_version
Revises: 0008_saved_borrow_checks
Create Date: 2026-10-15 00:00:00
"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "0009_saved_check_notice_version"
down_revision: str | None = "0008_saved_borrow_checks"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Matches app/services/saved_borrow_checks.py's SAVE_CHECK_NOTICE_VERSION at the time this migration was
# written — used only as a safety-net default for a row that somehow bypassed the application layer; the
# application always passes its own current value explicitly, never relying on this default to be current.
_INITIAL_NOTICE_VERSION = "save-check-notice-v1-2026-10-15"


def upgrade() -> None:
    op.add_column(
        "saved_borrow_checks",
        sa.Column("notice_version", sa.Text(), nullable=False, server_default=_INITIAL_NOTICE_VERSION),
    )


def downgrade() -> None:
    op.drop_column("saved_borrow_checks", "notice_version")
