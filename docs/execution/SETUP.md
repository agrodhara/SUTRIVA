# Setup

This file gives the minimum steps to run the Sutriva repository locally.

## Prerequisites

- Python 3.11+
- Node.js 20+
- Git

## Backend API

```bash
cd services/api
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Health check:

```bash
curl http://127.0.0.1:8000/health
```

Readiness check:

```bash
curl http://127.0.0.1:8000/ready
```

`/health` is process liveness and remains independent of database availability.
`/ready` checks optional/required database state, connectivity and Alembic head revision.

## PostgreSQL 16 and Alembic (Phase A foundation)

Set database environment values with placeholders only:

```bash
export DATABASE_URL='postgresql+psycopg://<user>:<password>@127.0.0.1:5432/<database>'
export DATABASE_REQUIRED=true
export DATABASE_CONNECT_TIMEOUT=3
```

Run migrations:

```bash
cd services/api
alembic upgrade head
alembic current
alembic downgrade base
alembic upgrade head
```

Phase A migration creates no business-domain tables; only Alembic migration metadata is expected.

## Decision engine

```bash
cd services/decision_engine
python -m pip install -e . pytest
pytest
```

## API tests

```bash
cd services/api
pytest
```

Database foundation tests require an explicit PostgreSQL test URL:

```bash
export PHASEA_TEST_DATABASE_URL='postgresql+psycopg://<user>:<password>@127.0.0.1:5432/sutriva_phasea_test'
export PHASEA_ALLOW_DESTRUCTIVE_DB_TESTS=1
```

Safety constraints for destructive test fixtures:

- `PHASEA_TEST_DATABASE_URL` is mandatory; `DATABASE_URL` alone is never used for destructive test setup.
- Host must be local (`127.0.0.1`, `localhost`, or `::1`).
- Database name must end with `_test` or `_ci`.
- The tests internally perform scoped mapping to `DATABASE_URL` for Alembic runtime and restore the previous value after each test.

## PWA

```bash
cd apps/pwa
cp .env.example .env.local
npm install
npm run dev
```

The PWA reads the backend URL from `NEXT_PUBLIC_API_BASE_URL` (default `http://127.0.0.1:8000`, see `apps/pwa/.env.example`).
With the API running, open the PWA home page: it calls `GET {NEXT_PUBLIC_API_BASE_URL}/health` and shows
"Backend connected" or "Backend unavailable" depending on whether the request succeeds.

The PWA calls the preferred borrowing and money-value routes only. Run
`npx tsc --noEmit` and `npm run build` for frontend validation.

## Phase A non-goals

- No customer journey behavior changes.
- No business-domain PostgreSQL tables.
- No cookie/session continuity changes.
- No OTP/identity/consent/linking implementation.
- No cloud provisioning or deployment.
- No Track 1.1A/1.1B flag changes.
- No audit-redaction or product-event contract changes.

## GitHub-first rule

Do not use local folders as the system of record. Create issues, commit small changes, open PRs and preserve decisions in `docs/decision_log.md`.
