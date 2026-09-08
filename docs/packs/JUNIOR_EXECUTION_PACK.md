# Junior Execution Pack — Sutriva Alpha-50

This pack is for a junior developer, Replit-style builder, or AI coding assistant. It deliberately breaks the product into small, safe tasks. Do not invent product scope. Do not change decision logic unless a GitHub issue explicitly says so.

## 1. What we are building

Sutriva Alpha-50 is a mobile-first PWA with two doors:

1. **Get More From My Money**
2. **Borrow Better**

The app gives quick financial-intelligence insights, then asks for consent before deeper data. It is not a loan marketplace and does not send applications to lenders in Alpha.

## 2. Golden rule

Frontend displays. Backend decides.

Do not calculate affordability, eligibility, comfortable EMI, policy status or reason codes inside React components. React should call the API and display the response.

## 3. Repository map

```text
apps/pwa/                       Next.js mobile-first frontend
services/api/                   FastAPI backend
services/decision_engine/       Rule/policy evaluator
services/feature_engine/        Feature preparation placeholder
services/learning_engine/       Offline experiments, not production
docs/                           Product, architecture, governance
infra/aws/                      Deployment notes/placeholders
.github/                        CI, PR templates, issue templates
```

## 4. Local setup

### Backend

```bash
cd services/api
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Open:

```text
http://127.0.0.1:8000/health
```

Expected response:

```json
{"status":"ok","service":"sutriva-api"}
```

### Decision engine tests

```bash
cd services/decision_engine
python -m pip install -e . pytest
pytest
```

### API tests

```bash
cd services/api
pytest
```

### PWA

```bash
cd apps/pwa
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

## 5. First 10 safe tickets

### Ticket 1 — Improve home page copy

Goal: make the two-door landing page clear on mobile.

Files:

- `apps/pwa/app/page.tsx`
- `apps/pwa/app/styles.css`

Acceptance criteria:

- Shows both doors.
- No lending fulfilment wording like “Apply now”.
- Mobile layout works.
- No financial calculation in frontend.

### Ticket 2 — Add quick check form for Borrow Better

Goal: collect declared income, existing EMI, desired amount and tenure.

Files:

- `apps/pwa/app/borrow-better/page.tsx`

Acceptance criteria:

- Form fields render.
- Field names match API contract.
- Submit button calls backend or logs placeholder clearly.
- No hard-coded final decision in UI.

### Ticket 3 — Connect Borrow Better form to API

Goal: call FastAPI endpoint and display result.

Files:

- `apps/pwa/app/borrow-better/page.tsx`
- `services/api/app/routers/borrow_better.py`

Acceptance criteria:

- Frontend sends JSON request.
- Backend returns decision result.
- UI displays status, comfortable EMI/range, and reason codes.
- API errors are shown gracefully.

### Ticket 4 — Add Money Value quick check form

Goal: capture rough cards/spend/fees/subscription inputs.

Files:

- `apps/pwa/app/money-value/page.tsx`
- `services/api/app/routers/money_value.py`

Acceptance criteria:

- User can enter rough monthly spend and fee/interest assumptions.
- Backend returns simple value-leakage estimate.
- UI labels estimate as indicative.

### Ticket 5 — Add consent screen component

Goal: create a reusable consent screen before deeper data.

Files:

- `apps/pwa/components/ConsentPanel.tsx`

Acceptance criteria:

- Plain-language consent copy.
- Checkbox required.
- No pre-ticked box.
- No misleading promise of loan approval.

### Ticket 6 — Add result card component

Goal: standardize how insights are shown.

Files:

- `apps/pwa/components/ResultCard.tsx`

Acceptance criteria:

- Displays title, status, explanation and reason codes.
- Works for both doors.
- Does not invent results; uses props only.

### Ticket 7 — Add API request/response examples

Goal: document exact JSON examples.

Files:

- `docs/specs/API_SPEC.md`

Acceptance criteria:

- Includes `/health`.
- Includes Borrow Better request/response.
- Includes Money Value request/response.
- Includes error response example.

### Ticket 8 — Add audit event for decisions

Goal: every API decision writes an audit event.

Files:

- `services/api/app/services/audit.py`
- `services/api/app/routers/borrow_better.py`
- `services/api/app/routers/money_value.py`

Acceptance criteria:

- Audit contains timestamp, journey, policy version, input snapshot reference or safe summary, output and reason codes.
- No raw bank statement or sensitive account number in logs.

### Ticket 9 — Add tests for bad inputs

Goal: prevent invalid or dangerous inputs.

Files:

- `services/api/tests/test_api.py`

Acceptance criteria:

- Missing income fails.
- Negative amount fails.
- Zero tenure fails.
- Error is readable.

### Ticket 10 — Add screenshots to README later

Goal: improve operator visibility.

Files:

- `README.md`

Acceptance criteria:

- Only after UI exists.
- Screenshots use synthetic data.
- No real customer data.

## 6. Do not touch without senior approval

- Auth/OTP implementation.
- Database schema for real user data.
- AWS deployment and IAM.
- Consent wording for real customers.
- Decision-engine rule thresholds.
- Learning-engine model design.
- Any loan-offer, lender-ranking or apply flow.
- Any storage of uploaded statements.
- Any production secret or API key.

## 7. Pull request checklist

Before opening PR:

- Code runs locally.
- Tests pass.
- No secret committed.
- No real data in screenshots/tests.
- No financial decision logic in frontend.
- API contracts updated if request/response changed.
- PR explains what changed and what did not change.

## 8. How to work with AI coding tools

Allowed:

- Generate UI component drafts.
- Refactor simple components.
- Add tests.
- Improve README/docs.
- Explain errors.

Not allowed:

- Paste real financial data.
- Ask AI to invent policy thresholds.
- Ask AI to create production auth without review.
- Let AI deploy infrastructure with credentials.
- Merge AI code without reading it.

## 9. Definition of done

A ticket is done only when:

- It meets acceptance criteria.
- Tests pass or the reason for missing tests is documented.
- User-visible copy is clear.
- No hard-fail rule is violated.
- GitHub issue is updated.

## 10. Current junior answer

Do not try to build “the full product.” Pick one ticket, finish it, test it, commit it, and move to the next ticket.
