# B1 saved-check — final readiness checklist

Milestone 2 closure. One checklist, separated into the three kinds of work this feature actually needs
before it could ever go live — code verification (this session can and did do this), external setup (the
account owner must do this, outside this session), and production activation (a deliberate decision,
performed by neither of the above automatically). **Nothing in this checklist is a release approval.**
`savedCheckEnabled` stays `false` everywhere; no merge, deployment, or activation is authorized by this
document.

## A. Code verification — done, by this session

| Item | Status | Evidence |
|---|---|---|
| Save/retrieve/delete backend, flag-gated | ✅ Done | `app/routers/saved_borrow_checks.py`, 759/759 backend tests |
| Frontend save prompt (primary) + pilot-interest (secondary) | ✅ Done | `SaveCheckForm.tsx`, `SituationFlow.tsx`; visual distinction accepted, no further styling planned |
| Retrieval page, token in URL fragment only | ✅ Done | `/saved` page; 157/157 frontend tests |
| Token never in path/query; header-based API | ✅ Done | regression-tested |
| Cache-Control: no-store on sensitive responses | ✅ Done | tested |
| No browser storage, no analytics exposure | ✅ Confirmed absent | direct code search |
| notice_version → immutable registry + cross-file consistency test | ✅ Done | `app/saved_check_notice_versions.py` |
| Minimal save/retrieval measurement, real bug fixed, demonstrated with real captured output | ✅ Done | see this doc's item 6 |
| Retention purge logic | ✅ Done, tested against a real database | `purge_expired_and_deleted` |
| Systemd units for the purge scheduler | ✅ Written, validated on a real systemd (Docker) | `ops/systemd/` |
| Email-link fragment preservation under link tracking | ✅ Confirmed via code + RFC/spec research | this doc's item 7 |
| CI (lint, typecheck, tests, build) | ✅ Green on every push this round | PR #35 |

**Nothing in this column is blocked on anyone else.**

## B. External setup — requires the account owner, outside this session

| Item | Status | Exact action needed |
|---|---|---|
| AWS SES domain verification | Not started | Create domain identity, publish DKIM/SPF/DMARC DNS records (see this doc's item 1) — free, no send required |
| AWS SES IAM credential | Not started | Create a scoped IAM user/SMTP credential (`ses:SendEmail`/`ses:SendRawEmail` only) |
| Designated test inbox | Not provided | One real inbox you can read, verified as a recipient identity in SES |
| SES sending adapter code | Not built | Independent work this session can do once the provider decision above is confirmed — not blocked on the account owner for the code itself, only for testing it against a real send |
| Systemd scheduler install | Not performed | SSH access to `sutriva-alpha` (currently blocked) + the account owner's approval to install per `ops/systemd/README.md` |
| Twilio written answer | Not received | Decision on sending the prepared (not sent) follow-up, or an existing answer to provide |

**Everything in this column blocks only the specific downstream step named — it does not block the code verification column above, which is already done.**

## C. Production activation — a deliberate decision, not automatic from A or B

| Item | Status |
|---|---|
| `savedCheckEnabled` flag flip | Not proposed; requires explicit instruction |
| Real email sending to real visitors | Requires B's SES items + the adapter, then a deliberate decision to flip the flag |
| Retention scheduler actually running in production | Requires B's systemd install, a separate decision from flipping the feature flag |
| Public announcement/campaign referencing saved checks | Not proposed — see the Milestone 3 campaign pack, which explicitly does not advertise this capability yet |

**No item in this column is authorized by anything in columns A or B being complete.** Completing external
setup makes activation *possible*, not approved.
