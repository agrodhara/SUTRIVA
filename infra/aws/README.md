# AWS UAT Deployment Plan

This plan prepares the current Alpha-50 application for internal UAT on AWS.
It does not deploy production infrastructure and does not introduce real-data
integrations.

## Target architecture

- Frontend: AWS Amplify Hosting (Next.js app in `apps/pwa`).
- Backend: AWS App Runner (FastAPI service from `services/api`).
- Logs: Amazon CloudWatch Logs for App Runner service logs.
- Secrets and config: App Runner environment variables (no secrets in repo).
- Temporary event storage: local `/tmp/sutriva` JSONL files inside container
	(ephemeral by design for this phase).

## Container and runtime plan

- Build backend image from repository root using the existing runtime command
	pattern from [railway.toml](../../railway.toml).
- Expose backend on App Runner HTTPS endpoint.
- Keep frontend static/runtime API calls pointed to backend HTTPS base URL via
	`NEXT_PUBLIC_API_BASE_URL`.

## Required environment variables

Backend (App Runner):
- `ALLOWED_ORIGINS=https://<frontend-domain>`

Frontend (Amplify):
- `NEXT_PUBLIC_API_BASE_URL=https://<apprunner-service-url>`

Use exact HTTPS origins only. Do not include wildcard CORS origins.

## Health and smoke checks

Backend:
- `GET /health` returns `{"status":"ok"...}`.
- `POST /v1/borrowing-intelligence/comfortable-borrowing-check` returns 200.
- `POST /v1/financial-intelligence/money-value-check` returns 200 for both
	known and unknown reward-value payloads.
- `POST /v1/events` accepts allowed Track 1.1 events and rejects invalid
	payload combinations.

Frontend:
- Home page renders backend connected state.
- Borrow Better and Money Value quick-check journeys load and submit.
- Continuation opens only after explicit user action and no stale result.

## Observability and rollback

Observability:
- Enable App Runner service logs to CloudWatch Logs.
- Track non-2xx response spikes for `/v1/*` endpoints.
- Keep event payloads PII-safe; product events must not include financial
	values.

Rollback:
- Backend rollback: redeploy previous App Runner image revision.
- Frontend rollback: redeploy previous Amplify build.
- CORS rollback: revert `ALLOWED_ORIGINS` to last-known-good frontend origin.

## Cost assumptions for internal UAT

Low-traffic UAT assumptions:
- App Runner: one small instance, scale-to-low baseline.
- Amplify Hosting: low static/SSR request volume.
- CloudWatch Logs: minimal ingestion for test usage.

Expect low double-digit USD monthly range under light internal traffic; final
cost depends on request volume and uptime policy.

## Approval checkpoint before provisioning

Before creating any chargeable AWS resource or public DNS endpoint, confirm:
- AWS account and region for UAT.
- Frontend public domain choice.
- Maximum monthly UAT budget.
- Named owner for operational rollback decisions.
