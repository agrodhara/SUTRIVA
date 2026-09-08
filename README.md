# Sutriva Product Repository

GitHub-first starter repository for the B1.2 Personal Financial Intelligence product.

This repository is designed to avoid ad-hoc build drift. It separates product experience, intelligence services, decision rules, audit/governance and future learning/representation modules.

## Product scope

Current scope is **B1.2 Alpha**:

- Two-door PWA: `Get More From My Money` and `Borrow Better`
- No real financial data in generic AI prompts
- No lender fulfilment until legal/partner/LSP gate clears
- PWA-first; backend intelligence must not live in the React UI
- Decision/rule engine must produce versioned outputs, reason codes and audit logs
- Sequence/embedding learning modules are scaffolded but gated behind offline experiments

## Repository map

```text
apps/pwa/                  Mobile-first Next.js PWA shell
services/api/              FastAPI product API
services/decision_engine/  Versioned rules, evaluator, reason codes
services/feature_engine/   Feature extraction and financial state summaries
services/audit/            Audit event model and append-only logging stub
docs/                      Product, architecture, governance, ADRs
infra/aws/                 AWS deployment placeholders
scripts/                   Local bootstrap and checks
data/samples/              Synthetic-only sample payloads
```

## Build principle

```text
PWA -> FastAPI -> Feature Engine -> Decision Engine -> Audit Log -> Response
```

The PWA collects input and displays results. It does not calculate financial decisions.

## Local backend quick start

```bash
cd services/api
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Then open:

```text
http://127.0.0.1:8000/health
http://127.0.0.1:8000/docs
```

## Local tests

```bash
cd services/api && pytest
cd ../decision_engine && pytest
```

## Current engineering gates

- `G0`: partner/problem confirmation
- `G0.5`: senior engineer architecture/security review
- `G1`: synthetic PWA shell only
- `G2`: Alpha-50 real-data build only after security gates
- `G3`: shadow-scorecard/design-partner experiments
- `G4`: fulfilment only after legal/partner signoff

## Hard stops

- Real financial data pasted into public/generic AI tools
- Secrets committed to GitHub
- Financial decision logic inside the UI
- Lender fulfilment exposed before legal/partner gate
- Rules changed without versioning and tests

## Operator build packs

This repository is designed for a tiny founding team: Sushil + ChatGPT + Claude + optional Replit-style UI assistant. Start here:

- `docs/packs/SENIOR_OPERATOR_PACK.md` — gates, hard fails, architecture control and founder decisions.
- `docs/packs/JUNIOR_EXECUTION_PACK.md` — small executable tickets for junior/AI-assisted implementation.
- `docs/execution/SETUP.md` — local setup.
- `docs/specs/PRODUCT_REQUIREMENTS_ALPHA50.md` — Alpha-50 scope.
- `docs/specs/API_SPEC.md` — API contracts.
- `docs/specs/DATA_CONTRACTS.md` — data/audit contracts.
- `docs/execution/FIRST_10_ISSUES.md` — first GitHub issue backlog.

Rule: frontend displays, backend decides, GitHub records.
