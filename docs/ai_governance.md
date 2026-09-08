# AI Governance

## Data classes

- PUBLIC: can be shared in public tools
- INTERNAL: product notes, synthetic data, public architecture
- CONFIDENTIAL: partner requirements, non-public strategy
- RESTRICTED: real bank statements, account numbers, PAN, bureau data, customer PII

## Hard fail rules

- RESTRICTED data in generic AI prompt: STOP
- Secrets in GitHub: STOP and rotate
- AI agent with production DB write access: STOP
- Financial fulfilment reachable before legal signoff: NO RELEASE
- Tests failing: NO MERGE
- Decision logic in PWA: BLOCK

## Agent roles

- Product agent writes requirements only
- Frontend agent builds UI only
- Backend agent implements API and service contracts
- Decision agent edits rules only through tests and versioning
- Security agent can block merge
- Compliance agent identifies legal risks but does not replace counsel
