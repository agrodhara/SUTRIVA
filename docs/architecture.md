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

## Phase B anonymous continuity boundary

Phase B adds the minimum anonymous continuity foundation only:

- server-issued anonymous session cookie
- fixed 90-day absolute anonymous-session expiry with no sliding extension
- PostgreSQL-backed anonymous session, token, journey, product-event,
  attribution, and continuation-intent persistence
- exact-origin credentialed CORS for cookie-authenticated endpoints
- origin validation for state-changing cookie-authenticated routes
- bounded-batch anonymous-retention purge service
- internal-only token rotation primitive for future server-controlled
  compromise handling

Phase B does not expose any browser-accessible anonymous-session rotation
endpoint. Routine bootstrap and event ingestion do not invoke rotation.

Anonymous-session token rotation remains dormant in Phase B. Invocation after
OTP verification and history linking is deferred to Track 1.1B. Rotation must
not extend the session's original absolute-expiry boundary.

Phase B still does not add identity or enrolment features:

- no OTP flows
- no contact capture
- no consent or pilot-enrolment persistence
- no fingerprint-based recovery or cross-device reattachment
- no AWS scheduling or deployment changes
- no feature-flag enablement

## Controlled alpha database notes

- PostgreSQL is the durable foundation for later phases.
- RDS Proxy is not used for controlled alpha.
- App Runner VPC egress/NAT (or approved alternative) and current AWS cost must be validated in PR D planning before provisioning.
