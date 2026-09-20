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
- `ANONYMOUS_SESSION_ALLOWED_ORIGINS=https://<frontend-origin>`
- `ANONYMOUS_SESSION_PRODUCTION_ORIGIN=https://<frontend-origin>`
- `ANONYMOUS_SESSION_ALLOW_INSECURE_LOCALHOST` must stay unset or `false`.

Frontend (Amplify), set in the build environment:
- `NEXT_PUBLIC_API_BASE_URL=https://<apprunner-service-url>`
- `NEXT_PUBLIC_TRACK_11A_ENABLED=true`
- `NEXT_PUBLIC_TRACK_11B_ENABLED=false`

Use full, explicit HTTPS origins only, and include the deployed frontend origin.
Do not use wildcard origins: the API sends credentialed responses and rejects
`*` at startup. The anonymous-session cookie is `SameSite=Lax`, so the PWA and
the API must be the same origin or sibling custom subdomains of one registrable
domain. An App Runner default domain paired with an Amplify default domain is
cross-site. The `NEXT_PUBLIC_*` values are build-time: changing any of them
requires a rebuild and redeployment. The committed
`shared/track11_config.json` is not edited for a deployment. See
[UAT_DEPLOYMENT.md](../../docs/execution/UAT_DEPLOYMENT.md) sections C and C2.

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
- CORS rollback: revert `ANONYMOUS_SESSION_ALLOWED_ORIGINS` and
	`ANONYMOUS_SESSION_PRODUCTION_ORIGIN` to the last-known-good frontend origin.

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
