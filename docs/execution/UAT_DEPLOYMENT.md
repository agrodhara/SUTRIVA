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
| CORS origin | `ANONYMOUS_SESSION_ALLOWED_ORIGINS` contains the deployed frontend origin as a full explicit origin, with no wildcard. `ANONYMOUS_SESSION_PRODUCTION_ORIGIN` is set and is one of the allowed origins. `ANONYMOUS_SESSION_ALLOW_INSECURE_LOCALHOST` is not enabled. |
| Cookie site relationship | The PWA and API are the same origin, or sibling custom subdomains of one registrable domain. See section C. |
| Frontend build flags | The build environment sets `NEXT_PUBLIC_TRACK_11A_ENABLED` and `NEXT_PUBLIC_TRACK_11B_ENABLED` to the intended values, and the deployed bundle was built after they were set. |
| Health and rollback | `/health` and `/ready` responses, and a documented rollback step. |

## Accepted dependency finding (private UAT only)

After the frontend upgrade to `next@15.5.25`, React 19.3.0 and Vitest 4.1.11,
`npm audit` in `apps/pwa` reports no critical findings and no vulnerability in
Next.js itself. It still reports these two linked findings:

| Package | Severity | Cause |
|---|---|---|
| `postcss@8.4.31` (bundled by `next@15.5.25`) | high | `sourceMappingURL` handling: GHSA-6g55-p6wh-862q, GHSA-fxqj-rqcc-2cmp, GHSA-r28c-9q8g-f849, plus the `</style>` stringify advisory GHSA-qx2v-qp2m-jg93 |
| `next@15.5.25` | moderate | Reported only because it depends on the vulnerable `postcss` |

These advisories concern attacker-controlled CSS being processed. PostCSS runs
in the Next.js CSS build pipeline, and Sutriva builds only its own committed
first-party CSS (`app/styles.css` and the CSS modules) with no user-supplied
CSS. The finding is therefore **accepted only for private UAT**.

**It remains a blocker.** It must be re-evaluated, and resolved or re-accepted
in writing, before any public pilot. `npm audit` names `next@16.3.5` as the
version that clears it. No `overrides` or audit suppression is used.

## A. Deploy the FastAPI backend

### AWS App Runner (preferred for AWS UAT)

1. Create an App Runner service from the repository source.
2. Use repository root context so `services/api` and `services/decision_engine`
   are both available.
3. Configure the runtime command equivalent to:
   `PYTHONPATH=/app/services/api:/app/services/decision_engine python -m uvicorn app.main:app --app-dir /app/services/api --host 0.0.0.0 --port $PORT`
4. Set the origin variables described in section C:
   - `ANONYMOUS_SESSION_ALLOWED_ORIGINS=https://<frontend-origin>`
   - `ANONYMOUS_SESSION_PRODUCTION_ORIGIN=https://<frontend-origin>`
5. Deploy and verify `https://<apprunner-url>/health` returns JSON with
   `"status": "ok"`.

### Render

1. Create a Web Service from this repository.
2. Set **Root Directory** to `services/api`.
3. Set **Build Command** to `pip install -r requirements.txt`.
4. Set **Start Command** to `uvicorn app.main:app --host 0.0.0.0 --port $PORT`.
5. Add the origin variables described in section C:
   - `ANONYMOUS_SESSION_ALLOWED_ORIGINS=https://<frontend-origin>`
   - `ANONYMOUS_SESSION_PRODUCTION_ORIGIN=https://<frontend-origin>`
6. Deploy and verify `https://<backend-host>/health` returns JSON with
   `"status": "ok"`.

### Railway

1. Create a service from this repository.
2. Set the service root/directory to `services/api`.
3. Use `pip install -r requirements.txt` as the install/build command.
4. Use `uvicorn app.main:app --host 0.0.0.0 --port $PORT` as the start command.
5. Add `ANONYMOUS_SESSION_ALLOWED_ORIGINS` and
   `ANONYMOUS_SESSION_PRODUCTION_ORIGIN` as described in section C, using the
   exact frontend origin, including `https://` and excluding a trailing path.
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
   - the build-time feature flags described in section C2.
5. Deploy after backend URL is available.

### Vercel

1. Import the repository into Vercel.
2. Set **Root Directory** to `apps/pwa`.
3. Use `npm ci` for installation and `npm run build` for the build command.
4. Set the environment variables:
   - `NEXT_PUBLIC_API_BASE_URL=https://<backend-host>`
   - the build-time feature flags described in section C2.
5. Deploy after the backend URL is known. This value is embedded into the
   client bundle at build time, so redeploy after changing it.

For local development, copy `.env.example` to `.env.local` and keep the local
backend URL there. The application does not provide a production or localhost
fallback in its source code.

## C. Configure origins and credentialed CORS

The API reads its origin configuration from these variables in
`services/api/app/session_config.py`. The name `ALLOWED_ORIGINS` is not read by
the application and has no effect.

| Variable | Purpose |
| --- | --- |
| `ANONYMOUS_SESSION_ALLOWED_ORIGINS` | Comma-separated list of allowed browser origins. It drives both the CORS middleware and the anonymous-session origin check, which returns `403 invalid_origin` for any other origin. |
| `ANONYMOUS_SESSION_PRODUCTION_ORIGIN` | The deployed frontend origin. The API refuses to start unless this value appears in `ANONYMOUS_SESSION_ALLOWED_ORIGINS`. The code defaults it to `https://app.sutriva.com`, so set it explicitly for every deployment. |
| `ANONYMOUS_SESSION_ALLOW_INSECURE_LOCALHOST` | Local development only. `true` removes the `Secure` attribute from the session cookie. Never enable it in a deployed environment. Leave it unset or `false`. |

Example shape, with placeholders only:

```text
ANONYMOUS_SESSION_ALLOWED_ORIGINS=https://<frontend-origin>
ANONYMOUS_SESSION_PRODUCTION_ORIGIN=https://<frontend-origin>
```

Rules:

- Each origin must be a full explicit origin: scheme, host and, if not the
  default, port. Include `https://`. Do not add a trailing slash or a path.
  Separate several origins with commas.
- The deployed frontend origin must be in the list. If it is missing, the
  browser's credentialed requests fail the CORS or origin check.
- Do not use a wildcard. The API sends credentialed CORS responses and rejects
  `*` at startup. A wildcard cannot be combined with credentialed
  anonymous-session requests.
- If `ANONYMOUS_SESSION_ALLOWED_ORIGINS` is unset, the API falls back to the
  localhost development origins (`http://localhost:3000`, `:3001` and the
  `127.0.0.1` equivalents). A deployed frontend is not covered by that default.

### Custom subdomains and the session cookie

The anonymous-session cookie is `HttpOnly`, `Secure` and `SameSite=Lax`, and it
is set without a `Domain` attribute, so it belongs to the API host. Browsers
do not send a `SameSite=Lax` cookie on cross-site fetch requests. The PWA and
the API therefore need to be the same origin, or sibling custom subdomains of
one registrable domain, for example `https://<pwa-subdomain>.<your-domain>` and
`https://<api-subdomain>.<your-domain>`. A pair of unrelated provider default
domains is cross-site.

For a PWA and API on separate custom subdomains:

- `ANONYMOUS_SESSION_ALLOWED_ORIGINS` and `ANONYMOUS_SESSION_PRODUCTION_ORIGIN`
  hold the **PWA** origin, not the API origin.
- `NEXT_PUBLIC_API_BASE_URL` holds the **API** origin. The PWA sends its
  requests with `credentials: "include"`.
- The API must answer with `Access-Control-Allow-Origin` set to the exact PWA
  origin and `Access-Control-Allow-Credentials: true`. The application's CORS
  middleware does this for listed origins. Any proxy or CDN in front of the API
  must not remove or override those headers.
- Both hosts must serve HTTPS, because the cookie is `Secure`.

## C2. Frontend feature flags are build-time values

The PWA reads these flags from the build environment:

```text
NEXT_PUBLIC_TRACK_11A_ENABLED=true
NEXT_PUBLIC_TRACK_11B_ENABLED=false
```

Those are the intended values for a build that should expose Track 1.1A without
Track 1.1B.

- Next.js inlines `NEXT_PUBLIC_*` values into the client bundle when it builds.
  Changing either variable on an already built deployment has no effect.
- Changing either flag requires a rebuild and a redeployment.
- Only the exact strings `true` and `false` are honoured. Any other value, or an
  unset variable, falls back to the committed `shared/track11_config.json`.
- Do not edit `shared/track11_config.json` to change a deployment. The committed
  file stays at `track11aEnabled=false` and `track11bEnabled=false`. Deployments
  override it through the build environment variables above.

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
| `ANONYMOUS_SESSION_ALLOWED_ORIGINS` | FastAPI | Comma-separated full HTTPS frontend origin or origins. No wildcard. |
| `ANONYMOUS_SESSION_PRODUCTION_ORIGIN` | FastAPI | The deployed frontend origin. Must be in the allowed list. |
| `ANONYMOUS_SESSION_ALLOW_INSECURE_LOCALHOST` | FastAPI | Unset or `false` in every deployed environment |
| `NEXT_PUBLIC_API_BASE_URL` | Amplify or Vercel (build time) | Backend HTTPS base URL |
| `NEXT_PUBLIC_TRACK_11A_ENABLED` | Amplify or Vercel (build time) | `true` for a Track 1.1A build. Rebuild to change. |
| `NEXT_PUBLIC_TRACK_11B_ENABLED` | Amplify or Vercel (build time) | `false`. Rebuild to change. |
| `DATABASE_URL` | FastAPI | PostgreSQL connection URL. Never commit real values. |
| `DATABASE_REQUIRED` | FastAPI | `true` for any deployment that persists events |

