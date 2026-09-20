# Internal Alpha UAT deployment

This runbook deploys the existing Track-1 application for temporary internal
UAT. It does not add authentication, regulated-data integrations, lender
offers, applications, or any Track-2 capability.

## Persistence requirements

PostgreSQL is required for Phase A/B persistence. Anonymous sessions, product
events, journey runs, attribution and continuation intents are stored in
PostgreSQL. Those endpoints return `503` when the database is unavailable.

- Provide `DATABASE_URL` and set `DATABASE_REQUIRED=true` for any deployment
  that must persist events.
- Run `alembic upgrade head` from `services/api` before starting a new
  revision. See `docs/execution/SETUP.md`.
- `GET /health` is liveness only. `GET /ready` checks database connectivity and
  the Alembic head revision.
- `DATABASE_REQUIRED` defaults to `false`. Do not rely on that default for UAT.

Audit events are separate. They are still written as local JSONL under
`/tmp/sutriva` (or `AUDIT_LOG_PATH`) on an ephemeral filesystem and can be lost
on restart or redeploy.

This document does not assert how routes other than the anonymous-session and
product-event endpoints behave without a database.

## Deployment record and verification status

Three categories are kept apart. Only the first is verified.

### Verified observation

| Observation | Date | Method |
|---|---|---|
| `sutriva.io` resolved to `3.108.189.63`. | 2026-09-20 | One `dig +short` query from a developer machine. |

This shows only that the name resolved to that address. It does not show what
runs behind it.

### Declared configuration, pending operational verification

The maintainers' working notes describe a deployment with these properties.
None of them has been independently verified.

- Host: an AWS Lightsail instance named `sutriva-alpha` with static IP
  `3.108.189.63`.
- Stack: `nginx`, the Next.js PWA and the FastAPI backend.
- Public endpoint: `https://sutriva.io`.

The provider sections below (App Runner, Render, Railway, Amplify, Vercel) are
implementation alternatives for UAT. They must not be read as the deployed
topology.

### Verification still required

| Item | Evidence needed |
|---|---|
| Instance identity | Provider console or CLI output showing the instance name, region and static IP attachment. |
| nginx configuration | The effective configuration, including upstreams and headers. |
| HTTPS termination | Certificate chain and where TLS terminates, from a client and from the host. |
| Deployed revision | The commit SHA running for the PWA and for the API, matched to `main`. |
| Database | Which PostgreSQL instance serves the API, and that `alembic current` is at head. |
| CORS origin | `ALLOWED_ORIGINS` equals exactly the deployed frontend origin. |
| Health and rollback | `/health` and `/ready` responses, and a documented rollback step. |

## A. Deploy the FastAPI backend

### AWS App Runner (preferred for AWS UAT)

1. Create an App Runner service from the repository source.
2. Use repository root context so `services/api` and `services/decision_engine`
   are both available.
3. Configure the runtime command equivalent to:
   `PYTHONPATH=/app/services/api:/app/services/decision_engine python -m uvicorn app.main:app --app-dir /app/services/api --host 0.0.0.0 --port $PORT`
4. Set:
   - `ALLOWED_ORIGINS=https://<your-amplify-domain>`
5. Deploy and verify `https://<apprunner-url>/health` returns JSON with
   `"status": "ok"`.

### Render

1. Create a Web Service from this repository.
2. Set **Root Directory** to `services/api`.
3. Set **Build Command** to `pip install -r requirements.txt`.
4. Set **Start Command** to `uvicorn app.main:app --host 0.0.0.0 --port $PORT`.
5. Add:
   - `ALLOWED_ORIGINS=https://<your-vercel-project>.vercel.app`
6. Deploy and verify `https://<backend-host>/health` returns JSON with
   `"status": "ok"`.

### Railway

1. Create a service from this repository.
2. Set the service root/directory to `services/api`.
3. Use `pip install -r requirements.txt` as the install/build command.
4. Use `uvicorn app.main:app --host 0.0.0.0 --port $PORT` as the start command.
5. Add `ALLOWED_ORIGINS` with the exact Vercel origin, including `https://`
   and excluding a trailing path.
6. Generate a public HTTPS domain and verify `/health`.

The local command remains:

```bash
cd services/api
uvicorn app.main:app --reload --port 8000
```

## B. Deploy the PWA to Vercel

### AWS Amplify Hosting (preferred for AWS UAT)

1. Create an Amplify app from this repository.
2. Set the app root to `apps/pwa`.
3. Use build settings with install `npm ci` and build `npm run build`.
4. Set:
   - `NEXT_PUBLIC_API_BASE_URL=https://<apprunner-url>`
5. Deploy after backend URL is available.

### Vercel

1. Import the repository into Vercel.
2. Set **Root Directory** to `apps/pwa`.
3. Use `npm ci` for installation and `npm run build` for the build command.
4. Set the environment variable:
   - `NEXT_PUBLIC_API_BASE_URL=https://<backend-host>`
5. Deploy after the backend URL is known. This value is embedded into the
   client bundle at build time, so redeploy after changing it.

For local development, copy `.env.example` to `.env.local` and keep the local
backend URL there. The application does not provide a production or localhost
fallback in its source code.

## C. Restrict CORS

Set the backend `ALLOWED_ORIGINS` to exactly the deployed frontend origin:

```text
ALLOWED_ORIGINS=https://<your-vercel-project>.vercel.app
```

Do not use `*` for UAT. Without `ALLOWED_ORIGINS`, local development defaults
to `http://localhost:3000` and `http://localhost:3001`.

## D. End-to-end verification

1. Open the Vercel HTTPS URL in a browser.
2. Confirm the home page shows **Backend connected**.
3. Complete **Get More From My Money** and verify the result.
4. Change fee, reward rate, or revolving balance in the what-if card and
   verify the updated result.
5. Complete **Borrow Better** and verify the result.
6. Change amount or tenure in the what-if card and verify the updated result.
7. Select **I'm interested** and **Not now** in each journey; confirm the
   inline confirmation appears and no additional data is requested.
8. If a deployment is rebuilt, repeat the health, readiness and journey checks.
   Audit events on the temporary filesystem are not durable.

## Environment summary

| Variable | Service | Value |
| --- | --- | --- |
| `ALLOWED_ORIGINS` | FastAPI | Exact Amplify or Vercel HTTPS origin |
| `NEXT_PUBLIC_API_BASE_URL` | Amplify or Vercel | Backend HTTPS base URL |
| `DATABASE_URL` | FastAPI | PostgreSQL connection URL. Never commit real values. |
| `DATABASE_REQUIRED` | FastAPI | `true` for any deployment that persists events |

