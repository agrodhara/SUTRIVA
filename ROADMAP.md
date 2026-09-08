# Build Roadmap

## Current cut: Repo v0.1

This is not the final product. It is the controlled starting point.

## Next 10 issues to create in GitHub

1. Create GitHub organization and private repository
2. Commit this scaffold as `v0.1-product-skeleton`
3. Add branch protection and PR template
4. Assign G0.5 senior engineer review
5. Wire PWA forms to FastAPI quick-check endpoints
6. Replace local audit JSONL with encrypted append-only storage design
7. Add product analytics events with no PII
8. Add rule-policy simulation notebook for Borrow Better
9. Add Berka baseline experiment notebook under Learning Engine
10. Add security checklist before any real data enters the system

## Rev2 playbook alignment

- GitHub-first, not ad hoc
- Claude Code + Codex + GitHub frozen
- Next.js + FastAPI frozen
- Senior engineer scope expected around 55–80 hours through Alpha-50
- Cognito versus lighter managed auth remains a decision gate
- Lean Alpha infrastructure first
- No fulfilment until legal/partner gate


## Immediate execution mode

There is no external team assumed. Execution is by Sushil with AI assistants and optional UI builder support. Therefore the next phase is not broad product development; it is controlled thread-picking from the first 10 issues.

### Phase 0.1 — Make the repo operable

- Read `docs/packs/SENIOR_OPERATOR_PACK.md`.
- Read `docs/packs/JUNIOR_EXECUTION_PACK.md`.
- Confirm setup works.
- Create GitHub private repo.
- Create the first 10 GitHub issues from `docs/execution/FIRST_10_ISSUES.md`.

### Phase 0.2 — Build synthetic clickable Alpha

- Home page two-door polish.
- Borrow Better quick-check form.
- Money Value quick-check form.
- API integration.
- Result cards with reason codes.
- Consent component.

### Phase 0.3 — Control gate before real users

- Auth decision.
- Audit event hardening.
- Data contracts.
- Consent wording.
- Security review.
- No real data before gate approval.
