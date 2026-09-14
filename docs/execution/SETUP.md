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

## GitHub-first rule

Do not use local folders as the system of record. Create issues, commit small changes, open PRs and preserve decisions in `docs/decision_log.md`.
