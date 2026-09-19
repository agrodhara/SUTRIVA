# Architecture

## Frozen build system

- Claude Code + Codex + GitHub as controlled build system
- GitHub is the source of truth
- Hosted vibe builders are allowed only for UI exploration with synthetic data

## Runtime architecture

```text
Mobile PWA
  -> FastAPI product API
  -> Feature Engine
  -> Decision Engine
  -> Audit Service
  -> PostgreSQL/S3 later
```

## Intelligence must sit behind API boundaries

Bad:

```text
React component calculates comfortable loan amount
```

Good:

```text
React component calls /v1/borrow-better/quick-check
FastAPI calls feature engine and decision engine
Decision is audited and returned with reason codes
```

## Alpha-50 infrastructure stance

Mandatory:

- MFA/IAM discipline
- HTTPS
- encrypted storage
- secrets management
- no PII in logs
- separate local/dev/prod config
- append-only audit events
- backup plan

Deferred unless engineer says needed:

- WAF
- multi-account topology
- complex staging
- enterprise observability
- advanced pen-test program

## Phase A database foundation boundary

Phase A introduces database infrastructure only:

- API database dependencies
- database environment configuration
- explicit database connect-timeout control
- SQLAlchemy engine and session lifecycle helpers
- Alembic scaffolding and an empty baseline migration
- liveness/readiness separation
- PostgreSQL-backed CI and tests

Phase A does not introduce business-domain persistence or product behavior changes:

- no anonymous-session continuity tables
- no event/attribution/continuation business tables
- no OTP/identity/consent/linking flows
- no cookie/CORS/CSRF behavior changes
- no calculation changes
- no audit-redaction changes
- no feature flag changes

Track 1.1A and Track 1.1B defaults remain false.

## Controlled alpha database notes

- PostgreSQL is the durable foundation for later phases.
- RDS Proxy is not used for controlled alpha.
- App Runner VPC egress/NAT (or approved alternative) and current AWS cost must be validated in PR D planning before provisioning.
