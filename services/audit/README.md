# Audit Service

Records every important product decision as a versioned event.

## Alpha implementation (current)

For Alpha-50, audit persistence is a local JSONL file: `services/api/audit_events.jsonl` (path overridable via the `AUDIT_LOG_PATH` environment variable, e.g. for tests). Every call to a quick-check endpoint (implemented in `services/api/app/services/audit.py`, `record_audit_event`) appends one JSON object per line and returns the structured event to the caller.

This is local traceability for guidance outputs. It is **not** production audit infrastructure — no database, no AWS service (S3/RDS/DynamoDB/Kinesis/EventBridge), no external logging. Production audit storage will be revisited later under senior/security review.

Minimum event fields:

- `audit_event_id`
- `event_type`
- `created_at`
- `event_time_utc`
- `policy_version`
- `decision_context`
- `input_snapshot`
- `output_snapshot`

Do not log raw account numbers, PAN, Aadhaar, bureau lines, full bank-statement rows, name, phone, email, card numbers, device fingerprint, location, IP address or secrets/environment variables here.
