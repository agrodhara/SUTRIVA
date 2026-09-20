# Build Roadmap

**Strategic source of truth for sequencing and status.**
Last reconciled: 2026-09-20 against `main` at `d9c1eae` (PR #9).

This document says what is done, what is current, what is next and what is
deferred. It does not restate specifications or decisions; it points to them.

## Binding product references

The final approved product flow is defined by the following artifacts and replaces earlier issue lists, handovers, and legacy product documentation where they conflict:

- [docs/product/journeys/Sutriva_Rewards_Intelligence_Journey_v1.0_FINAL.png](docs/product/journeys/Sutriva_Rewards_Intelligence_Journey_v1.0_FINAL.png)
- [docs/product/journeys/Sutriva_Borrow_Better_Journey_v1.0_FINAL.png](docs/product/journeys/Sutriva_Borrow_Better_Journey_v1.0_FINAL.png)
- [docs/product/journeys/JOURNEY_FLOW_SPEC.md](docs/product/journeys/JOURNEY_FLOW_SPEC.md)

Implementation and review must align to these references before any feature work proceeds.

## Document hierarchy

When documents disagree, the higher entry is authoritative for its own subject
and the lower entry must be corrected.

| Rank | Document | Authoritative for |
|---|---|---|
| 1 | `docs/product_constitution.md` | Product intent and the two acquisition doors |
| 2 | `docs/product/journeys/JOURNEY_FLOW_SPEC.md` | Final approved journey sequence and phase boundaries |
| 3 | `ROADMAP.md` (this file) | What is complete, current, next and deferred |
| 4 | `docs/decision_log.md` | Dated decisions and their rationale |
| 5 | `docs/architecture.md`, `docs/specs/*` | Architecture boundaries and API/data contracts |
| 6 | `docs/execution/DELIVERY_GATE.md`, `ACCEPTANCE_CRITERIA.md`, `SECURITY_DO_NOT_TOUCH.md` | Pre-merge and release controls |
| 7 | `docs/execution/FIRST_10_ISSUES.md`, `docs/handovers/*` | Historical seed backlog and task handovers. Not strategic. |

Code on `main` is the record of what exists. A document that contradicts it is
stale until corrected.

## Completed

| PR | Merged | Outcome |
|---|---|---|
| [#3](https://github.com/agrodhara/SUTRIVA/pull/3) | 2026-09-20 | Alpha-50 reconciliation promoted into `main`. This brought in the stacked integration-branch PRs #4–#7 below. |
| [#4](https://github.com/agrodhara/SUTRIVA/pull/4) | 2026-09-14 | Track 1.1: personalised reveal, intent and closure flow. |
| [#5](https://github.com/agrodhara/SUTRIVA/pull/5) | 2026-09-18 | Track 1.1A: credit wellness journeys, configurable illustrative borrowing rate, rewards annualization. |
| [#6](https://github.com/agrodhara/SUTRIVA/pull/6) | 2026-09-18 | Audit redaction: audit events store redacted, schema-versioned snapshots. |
| [#7](https://github.com/agrodhara/SUTRIVA/pull/7) | 2026-09-19 | Phase A: PostgreSQL 16, SQLAlchemy and Alembic foundation, liveness/readiness split. |
| [#8](https://github.com/agrodhara/SUTRIVA/pull/8) | 2026-09-20 | Phase B: anonymous session continuity, PostgreSQL-backed product events, exact-origin CORS, retention purge. |
| [#9](https://github.com/agrodhara/SUTRIVA/pull/9) | 2026-09-20 | Seed backlog Issue 1: home page two-door polish. |

Draft PRs #1 (health indicator) and #2 (Comfortable Borrowing Check) were closed
as superseded on 2026-09-20. Their content exists on `main` in evolved form.

Feature flags `track11aEnabled` and `track11bEnabled` are `false` in
`shared/track11_config.json`.

## Current

- Governance reconciliation: this roadmap, the decision log, the delivery gate,
  seed-backlog status and the UAT runbook correction.
- Seed backlog Issue 3 is under independent review. Its outcome is not
  asserted here.
- Operational verification of the declared alpha topology. See
  `docs/execution/UAT_DEPLOYMENT.md` for what is verified and what is not.

## Next

1. Frontend CI (lint, typecheck, unit tests, production build) as a separate
   implementation PR, opened only after the governance PR is reviewed.
   `DELIVERY_GATE.md` marks the frontend controls as not yet enforced until this
   exists.
2. Verify the declared alpha topology and record the evidence.
3. Re-assess seed backlog Issues 4–10 against `main` and update their status.
4. Deployment and database provisioning planning. `docs/architecture.md`
   requires App Runner VPC egress/NAT (or an approved alternative) and current
   AWS cost to be validated before anything is provisioned.

## Deferred

| Item | Why deferred |
|---|---|
| Track 1.1B: OTP verification, consent, anonymous-history linking | Identity and consent are outside Phase B. Flags stay `false`. |
| Server-side token rotation after OTP verification and history linking | Deferred to Track 1.1B. Rotation must not extend the session's original absolute expiry. No browser-accessible rotation endpoint is planned. |
| Fulfilment and any Track 2 capability | Gated until the legal/partner gate. |
| Authentication provider choice (Cognito versus a lighter managed option) | Decision gate. Listed in `SECURITY_DO_NOT_TOUCH.md`. |
| Encrypted append-only audit storage | Audit events currently go to a local JSONL file under the OS temp directory and are not durable. |
| Real customer data | Not permitted before the G0.5 engineer/security review is approved. |

## Standing constraints

- GitHub is the source of truth. Changes land through pull requests.
- Next.js PWA plus FastAPI. Decision logic stays behind API boundaries.
- Lean alpha infrastructure first.
- No fulfilment before the legal/partner gate.
- No real financial or identity data in any AI tool or repository.
