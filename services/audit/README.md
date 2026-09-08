# Audit Service

Records every important product decision as a versioned event.

Minimum event fields:

- event time
- journey
- policy version
- input snapshot
- output snapshot
- reason codes
- experiment flag
- user/session reference

Do not log raw account numbers, PAN, bureau lines or full bank-statement rows.
