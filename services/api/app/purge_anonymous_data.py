from __future__ import annotations

import json

from app.services.anonymous_retention import purge_anonymous_data_batch


def main() -> None:
    result = purge_anonymous_data_batch()
    print(json.dumps({
        "continuation_intents_deleted": result.continuation_intents_deleted,
        "campaign_attribution_deleted": result.campaign_attribution_deleted,
        "product_events_deleted": result.product_events_deleted,
        "journey_runs_deleted": result.journey_runs_deleted,
        "anonymous_session_tokens_deleted": result.anonymous_session_tokens_deleted,
        "anonymous_sessions_deleted": result.anonymous_sessions_deleted,
        "total_deleted": result.total_deleted,
    }))


if __name__ == "__main__":
    main()