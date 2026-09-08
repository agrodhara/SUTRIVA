# Senior Operator Pack — Sutriva Alpha-50

This pack is for the founder/operator acting as Product Owner, CTO proxy, Compliance owner, Model-risk owner and release approver. There is no rescue team. The operating system is: **Sushil + ChatGPT + Claude + optional Replit-style UI assistant + GitHub**.

## 1. Mission

Build a controlled Alpha-50 product that proves whether a mobile-first financial-intelligence journey can create user trust, generate useful decision insight, and support later partner/lender validation without prematurely becoming a regulated lending-fulfilment platform.

The product is not a loan marketplace in Alpha. It is a financial-intelligence product with two acquisition doors:

1. **Get More From My Money** — value leakage, card/reward/fee/subscription/interest insights.
2. **Borrow Better** — affordability, comfortable EMI, comfortable borrowing range, credit readiness, and safer next action.

## 2. Non-negotiable architecture

```text
PWA → FastAPI → Feature Engine → Decision Engine → Audit Log
                         ↓
                 Learning Engine offline first
```

Rules:

- No financial decision logic in React screens.
- No real customer financial data in generic AI prompts.
- No fulfilment/Apply-to-lender path until legal/partner sign-off.
- No SMS/contact/call-log scraping.
- GitHub is the system of record.
- Every decision-policy change must be versioned and logged.
- Learning engine stays offline/research until explicitly promoted.

## 3. Senior decisions you must own

| Decision | Default now | When to revisit |
|---|---|---|
| Product scope | PWA Alpha-50 only | After Alpha evidence |
| Build stack | Next.js + FastAPI + Python | Only if blocked |
| Coding system | Claude Code + Codex/ChatGPT + GitHub | Do not use ad hoc local files as source of truth |
| Hosted UI builder | Synthetic/UI only | Never with real financial data |
| Auth | Decision gate: Cognito vs lighter managed auth | Before real-user accounts |
| Database | Postgres | Before persistent user data |
| Uploads | Statement-upload placeholder first | Real parser after security review |
| AWS | Lean Alpha only | Expand after evidence |
| Lending fulfilment | OFF | Legal/partner/LSP sign-off required |
| Learning engine | Offline first | After baseline experiments and governance review |

## 4. Gate model

### Gate G0 — Strategy and partner reality

Proceed only when these are written in GitHub:

- Why this product exists.
- Alpha-50 user source.
- Whether any partner/DSA is actually available.
- Whether partner wants rule engine, insight engine, or fulfilment.
- What is explicitly out of scope.

### Gate G0.5 — Technical control

Proceed to real user data only after:

- Repository is private and version-controlled.
- Secrets are not committed.
- `.env.example` exists but real `.env` is ignored.
- API, PWA and tests run locally.
- Auth path is selected.
- Basic threat model is written.
- Audit log format is agreed.

### Gate G1 — Synthetic clickable product

Must show:

- Landing page with two doors.
- Quick-value journey for each door.
- Result page with reason codes.
- No login required before first value.
- Consent screen before deeper data.
- No real data.

### Gate G2 — Alpha-50 controlled build

Must include:

- Auth/account flow if needed.
- Consent capture.
- Input validation.
- Audit events.
- Policy versioning.
- Basic analytics.
- Manual export of results.
- Strict no-fulfilment boundary.

### Gate G3 — Evidence review

Proceed only if evidence supports it:

- Users complete the journey.
- Users understand the insight.
- Users trust enough to share deeper data.
- Decisions are explainable.
- No security/compliance hard fail.
- Partner/shadow-pilot path is clearer.

## 5. Hard fails

Stop work immediately if any of these happen:

- Real financial data is pasted into ChatGPT/Claude/Replit.
- Secrets/API keys are committed.
- Rule/decision logic is added only in frontend.
- Fulfilment button is exposed before legal sign-off.
- User data is logged in plain text unnecessarily.
- A test is changed only to pass without fixing behaviour.
- AI-generated code is merged without review.
- Uploaded financial statements are stored without encryption plan.

## 6. Weekly senior operating rhythm

### Monday — Product clarity

- Pick one user journey only.
- Confirm what changes this week.
- Write/update GitHub issues.

### Tuesday/Wednesday — Build control

- Review PRs or AI-generated diffs.
- Check no logic moved into UI.
- Check tests.

### Thursday — Evidence and governance

- Review audit logs, decision outputs, reason codes.
- Record learnings in `docs/decision_log.md`.

### Friday — Scope discipline

Classify every new idea:

- BUILD — required now.
- TEST — experiment, but isolated.
- WATCH — record, do not build.
- KILL — explicitly out.

## 7. What to ask Claude/ChatGPT to do

Use the assistants as controlled specialists, not random advisors.

### Product prompt

```text
Review the current Sutriva Alpha-50 scope and identify only scope changes that improve learning without increasing regulatory, security or engineering risk. Classify each as BUILD, TEST, WATCH or KILL.
```

### Code review prompt

```text
Review this diff as a senior engineer. Check for security risk, business logic in frontend, missing tests, audit/logging gaps, unclear data contracts, and violations of the Sutriva hard-fail rules.
```

### Architecture prompt

```text
Evaluate whether this proposed implementation preserves the architecture: PWA → FastAPI → Feature Engine → Decision Engine → Audit Log, with Learning Engine offline first. Identify violations and the smallest fix.
```

### Governance prompt

```text
Review this feature for regulatory or trust risk. Does it look like lending fulfilment, customer acquisition, underwriting, or advice? What must be disabled until legal/partner sign-off?
```

## 8. Senior backlog

1. Finalize Alpha-50 product requirement.
2. Confirm name/brand placeholder: Sutriva used internally until final clearance.
3. Choose auth path.
4. Define user-data classification.
5. Define audit schema.
6. Define consent screen language.
7. Define two-door success metrics.
8. Define rule/policy versioning discipline.
9. Define AWS lean deployment map.
10. Define first real-data gate.

## 9. Founder decision log template

```text
Date:
Decision:
Why now:
Options considered:
Chosen option:
Risks:
What this enables:
What this explicitly does not enable:
Review date:
```

## 10. Current senior answer

This repository is not a finished product. It is a controlled operating base. The objective is not to outsource thinking to a junior developer. The objective is to make every next step small, reviewable and recoverable.
