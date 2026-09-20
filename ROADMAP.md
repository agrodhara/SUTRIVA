# Build Roadmap

**Strategic source of truth for sequencing and status.**
Last reconciled: 2026-09-20 against `main` at `d9c1eae` (PR #9).

This document says what is done, what is current, what is next and what is
deferred. It does not restate specifications or decisions; it points to them.

## Binding product references

The final approved product flow is defined by the following artifacts, and they take precedence where they conflict with prior issue lists, handovers, and legacy product documentation:

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
| 2 | [docs/product/journeys/JOURNEY_FLOW_SPEC.md](docs/product/journeys/JOURNEY_FLOW_SPEC.md) | Final approved journey sequence and phase boundaries |
| 3 | `ROADMAP.md` (this file) | What is complete, current, next and deferred |
| 4 | `docs/decision_log.md` | Dated decisions and their rationale |
| 5 | `docs/architecture.md`, `docs/specs/*` | Architecture boundaries and API/data contracts |
| 6 | `docs/execution/DELIVERY_GATE.md`, `ACCEPTANCE_CRITERIA.md`, `SECURITY_DO_NOT_TOUCH.md` | Pre-merge and release controls |
| 7 | `docs/execution/FIRST_10_ISSUES.md`, `docs/handovers/*` | Historical seed backlog and task handovers. Not strategic. |

Code on `main` is the record of what exists. A document that contradicts it is
stale until corrected.

## Implementation sequence

| Phase | Scope | Status |
|---|---|---|
| 1.1A | Steps 1-5: anonymous declared-data check and synthetic illustrative example for Rewards | Substantially implemented; exact screen separation, copy and phase-boundary alignment still required |
| 1.1A | Steps 1-5: anonymous declared-data check and synthetic illustrative example for Borrow Better | Substantially implemented; exact values, screen separation and phase-boundary alignment still required |
| 1.1B | Anonymous pilot-interest click, mobile submission, OTP issuance and successful verification, anonymous-history linking only after successful OTP verification, and a separate optional-updates choice with optional updates unchecked by default (`optional_updates_opted_in`) | Deferred until both 1.1A journeys pass |
| 1.2 | Steps 7-8: future purpose-specific statement/account/transaction/bureau permissions and connected-data results | Future-only; not in current scope |

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
| [#10](https://github.com/agrodhara/SUTRIVA/pull/10) | 2026-09-20 | Reconciled the roadmap, decision log and delivery governance. |
| [#11](https://github.com/agrodhara/SUTRIVA/pull/11) | 2026-09-20 | Added the frontend-quality CI job for the PWA. |
| [#12](https://github.com/agrodhara/SUTRIVA/pull/12) | 2026-09-20 | Recorded the frontend CI enforcement in the delivery gate. |

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
- Final journey authority is established by the two PNGs and `docs/product/journeys/JOURNEY_FLOW_SPEC.md`; earlier issue and handover assumptions are superseded where they conflict.
- The remaining work is exact screen separation, copy, values, illustrative labels and phase-boundary alignment within the approved anonymous 1.1A flow. This is not a full rebuild of the journeys from zero.

## Next

1. Verify the declared alpha topology and record the evidence.
2. Re-assess seed backlog Issues 4–10 against `main` and update their status.
3. Deployment and database provisioning planning. `docs/architecture.md`
   requires App Runner VPC egress/NAT (or an approved alternative) and current
   AWS cost to be validated before anything is provisioned.
4. Complete the final 1.1A alignment work for Rewards and Borrow Better against the controlling PNG and journey spec.

## Deferred

| Item | Why deferred |
|---|---|
| 1.1B step 6 only: anonymous interest click, mobile submission, OTP verification and post-verification history linking | Identity and permission capture are outside the closed anonymous journey scope. |
| Purpose-specific 1.2 permissions for statement, account, transaction and bureau access | These are future-only data-access choices and belong to connected-data results, not the 1.1B pilot-interest step. |
| Server-side token rotation after OTP verification and history linking | Deferred to Track 1.1B. Rotation must not extend the session's original absolute expiry. No browser-accessible rotation endpoint is planned. |
| Fulfilment and any Track 2 capability | Gated until the legal/partner gate. |
| Authentication provider choice (Cognito versus a lighter managed option) | Decision gate. Listed in `SECURITY_DO_NOT_TOUCH.md`. |
| Encrypted append-only audit storage | Audit events currently go to a local JSONL file under the OS temp directory and are not durable. |
| Future data-contract, event-taxonomy and Privacy Notice dependencies | Deferred until the separate governance gates are approved. |
| Real customer data | Not permitted before the G0.5 engineer/security review is approved. |

## Standing constraints

- GitHub is the source of truth. Changes land through pull requests.
- Next.js PWA plus FastAPI. Decision logic stays behind API boundaries.
- Lean alpha infrastructure first.
- No fulfilment before the legal/partner gate.
- No real financial or identity data in any AI tool or repository.
