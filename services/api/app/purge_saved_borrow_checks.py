from __future__ import annotations

import json

from app.services.saved_borrow_checks import purge_expired_and_deleted


def main() -> None:
    """CLI entry point — mirrors app/purge_anonymous_data.py's exact shape and contract: one bounded
    batch per invocation, meant to be called repeatedly by an external scheduler (cron or similar), not a
    one-shot unbounded sweep.

    **Not wired to any scheduler by this change.** Checked directly: `app/purge_anonymous_data.py` — the
    identical kind of entry point for the existing anonymous-session/event purge — has no documented cron
    entry anywhere in `docs/execution/UAT_DEPLOYMENT.md` either. This is a pre-existing, site-wide gap
    this feature inherits rather than introduces; it is reported here rather than silently assumed solved
    by this module merely existing. See docs/execution/B1_SAVED_CHECK_LAUNCH_GAPS.md.
    """
    removed = purge_expired_and_deleted()
    print(json.dumps({"saved_borrow_checks_deleted": removed}))


if __name__ == "__main__":
    main()
