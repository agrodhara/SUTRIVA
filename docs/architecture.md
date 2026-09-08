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
