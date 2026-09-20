# Private UAT deployment (AWS Lightsail, Mumbai)

This runbook describes the approved target for a **private, access-restricted
UAT** of the Track 1.1A application. It does not add authentication,
regulated-data integrations, lender offers, applications, or any Track-2
capability, and **it does not authorize a public launch**.

**Status: nothing described in "Approved private-UAT target" has been created or
deployed.** Creating each resource, the DNS record and the first deployment each
need separate explicit approval. See
[decision_log.md](../decision_log.md) for the decision record.

## Persistence requirements

PostgreSQL is required for Phase A/B persistence. Anonymous sessions, product
events, journey runs, attribution and continuation intents are stored in
PostgreSQL. Those endpoints return `503` when the database is unavailable.

- Use **PostgreSQL 16**. Do not use PostgreSQL 14, and do not accept a
  provider's default major version: a newer default such as PostgreSQL 18 is
  not supported by this project. CI runs `postgres:16`. Lightsail offers it as
  blueprint `postgres_16`.
- Provide `DATABASE_URL` and set `DATABASE_REQUIRED=true` for any deployment
  that must persist events. The URL must use the `postgresql+psycopg://`
  scheme: the API installs psycopg 3 only, and a plain `postgresql://` URL
  selects the psycopg2 driver, which is not installed. Percent-encode the
  password when building the URL.
- Run `alembic upgrade head` from `services/api` before starting a new
  revision. See [SETUP.md](SETUP.md). At this revision the head is
  `0003_product_event_screen_name`.
- `GET /health` is liveness only. `GET /ready` checks database connectivity and
  the Alembic head revision.
- `DATABASE_REQUIRED` defaults to `false`. Do not rely on that default for UAT.

Audit events are separate. They are written as local JSONL under
`/tmp/sutriva` by default, or to `AUDIT_LOG_PATH`. `/tmp` is not durable. On the
UAT host, set `AUDIT_LOG_PATH` to a directory on persistent disk. The audit
snapshots are redacted and hold no financial values.

This document does not assert how routes other than the anonymous-session and
product-event endpoints behave without a database.

## Deployment record and verification status

Three categories are kept apart.

### Verified observations

| Observation | Date | Method |
|---|---|---|
| `sutriva.io` resolved to `3.108.189.63`. | 2026-09-20 | One `dig +short` query from a developer machine. |
| The Lightsail inventory in `ap-south-1` held exactly one instance, `sutriva-alpha` (bundle `nano_3_1`, blueprint `amazon_linux_2023`, `ap-south-1a`, running), with static IP `sutriva-alpha-ip` (`3.108.189.63`) attached. It held no other instance or static IP, and no key pair, snapshot or relational database. | 2026-09-21 | Read-only AWS CLI queries under an SSO assumed role. |
| The Lightsail instance quota was 2 and the static-IP quota was 5. A quota-increase request was already open. | 2026-09-21 | Read-only Service Quotas query. |
| Public list prices: instance `small_3_1` USD 12/month, database `micro_2_0` USD 15/month, snapshots USD 0.05 per GB-month. | 2026-09-21 | Lightsail bundle listings and the public AWS price list. |
| An unintended PostgreSQL 14 database named `sutriva-uat-db` (`small_2_0`, created 2026-09-20T19:53Z, never connected to) existed and was deleted with no final snapshot on the project owner's approval. | 2026-09-21 | Metric and inventory queries before and after deletion. |

The DNS observation shows only that the name resolved to that address. It does
not show what runs behind it.

### Declared configuration, pending operational verification

The maintainers' working notes describe the production alpha as `nginx`, the
Next.js PWA and the FastAPI backend on `sutriva-alpha`, serving
`https://sutriva.io`. Only the instance name, size, region and static-IP
attachment are verified above. The effective nginx configuration, TLS
termination, deployed revision and database are not.

The private UAT is **separate** from this host. `sutriva-alpha`,
`sutriva-alpha-ip` and `sutriva.io` are out of scope and must not be changed by
any UAT step.

### Verification still required for the UAT environment

| Item | Evidence needed |
|---|---|
| Resources exist as specified | Lightsail CLI output showing names, region, bundles, tags, private database access and static-IP attachment. |
| PostgreSQL version | `SELECT version();` on the UAT database reports 16.x. |
| Migrations | `alembic current` reports `0003_product_event_screen_name (head)` and `/ready` returns `migration: current`. |
| Backups | Automated backups are enabled. Record the retention period and latest restorable time. The retention period is not exposed by the CLI and must be confirmed in the console or provider documentation. |
| Access control | Requests without credentials are refused, and `/docs`, `/redoc` and `/openapi.json` return 404. |
| Deployed revision | The commit SHA running for the PWA and for the API, matched to the approved revision. |
| CORS origin | `ANONYMOUS_SESSION_ALLOWED_ORIGINS` contains `https://uat.sutriva.io` as a full explicit origin, with no wildcard. `ANONYMOUS_SESSION_PRODUCTION_ORIGIN` is set to the same value. `ANONYMOUS_SESSION_ALLOW_INSECURE_LOCALHOST` is not enabled. |
| Frontend build flags | The build environment sets the two flags below, and the deployed bundle was built after they were set. |

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

## Approved private-UAT target

| Item | Value |
|---|---|
| Platform and region | AWS Lightsail, `ap-south-1` (Mumbai) |
| Public hostname | `https://uat.sutriva.io` (one DNS `A` record, added only after approval) |
| Instance | `sutriva-uat`: blueprint `amazon_linux_2023`, bundle `small_3_1` (2 GB RAM, 2 vCPU, 60 GB), IPv4 only |
| Static IP | `sutriva-uat-ip`, attached to `sutriva-uat` |
| Database | `sutriva-uat-db`: blueprint `postgres_16` (16.15), bundle `micro_2_0` (1 GB RAM, 40 GB, encrypted), **private** (no public access) |
| SSH | A dedicated key pair for UAT only, not the region default key used by production. Port 22 restricted to named administrator addresses. |
| Tags | `Project=SUTRIVA`, `Environment=uat`, `Purpose=private-uat` on every UAT resource |
| Recurring budget ceiling | **USD 32/month** |

Isolation rules:

- UAT uses its own instance, static IP, database, key pair and firewall. It
  shares nothing with production, and no step may modify `sutriva-alpha`,
  `sutriva-alpha-ip`, `sutriva.io` or the open quota request.
- Committed flags in [track11_config.json](../../shared/track11_config.json)
  remain `track11aEnabled=false` and `track11bEnabled=false`. UAT overrides them
  only through build-time environment variables.
- Phase 1.1B, mobile capture, OTP, Twilio, Step 6 and Phase 1.2 are not
  deployed and remain disabled.
- The Lightsail database is reached from the instance over the private
  network. It is never made publicly accessible.

Budget arithmetic, at list price before tax: USD 12 (instance) + USD 15
(database) = USD 27. Snapshots add USD 0.05 per GB-month: one 40 GB database
snapshot is USD 2 and one 60 GB instance snapshot is USD 3, so the maximum with
both is USD 32. Any change that exceeds the ceiling needs a new approval.

## A. Deploy on the UAT host

Use a clean checkout at the approved commit, never a working copy with local
changes. Keep the repository layout intact: the API reads
`shared/track11_config.json` relative to the repository root and imports
`services/decision_engine`. Match CI: Python 3.11 and Node 20.

1. Create `DATABASE_URL` and the other secrets on the host in a root-only file,
   for example mode `0600` under `/etc/sutriva/`. Never commit them, print them
   or pass them on a command line.
2. Install API dependencies and run the migration:

   ```bash
   cd services/api
   pip install -r requirements.txt
   alembic upgrade head
   alembic current
   ```

3. Start the API bound to loopback only:

   ```bash
   cd services/api
   PYTHONPATH=../decision_engine python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
   ```

4. Build and start the PWA. The values are baked into the bundle at build time:

   ```bash
   cd apps/pwa
   npm ci
   NEXT_PUBLIC_API_BASE_URL=https://uat.sutriva.io \
   NEXT_PUBLIC_TRACK_11A_ENABLED=true \
   NEXT_PUBLIC_TRACK_11B_ENABLED=false \
   npm run build
   npm run start -- -H 127.0.0.1 -p 3000
   ```

   `NEXT_PUBLIC_API_BASE_URL` must be the **absolute** origin. If it is empty,
   the PWA silently skips the anonymous-session bootstrap and every product
   event, so a build with an empty value would appear to work while recording
   nothing.

5. Run both processes under a service manager so they restart on failure, and
   keep release directories so a previous revision can be re-selected.

## B. nginx: same origin, routing and access

nginx terminates TLS for `uat.sutriva.io` and is the only listener exposed to
the internet on ports 80 and 443. The PWA and the API are one origin, so the
`SameSite=Lax` session cookie is sent and no cross-site CORS is involved.

Routing:

| Path | Upstream |
|---|---|
| `/v1/*`, `/health`, `/ready` | FastAPI on `127.0.0.1:8000` |
| `/docs`, `/redoc`, `/openapi.json` | Not forwarded. Return `404`. |
| Everything else | Next.js on `127.0.0.1:3000` |

Access control applies to the whole server, including `/health` and `/ready`:

- **Basic Auth** on every path except the ACME challenge on port 80. Store the
  password file outside the repository and share the credential out of band.
  Rotate or remove it when the UAT ends.
- **Rate limits** with `limit_req`, returning `429`, at both server level and
  for `/v1/`.
- Do not log request bodies. Financial inputs travel in request bodies and must
  not appear in any log. Do not enable body logging.
- nginx must pass the `Origin` header to the API and must not remove
  `Set-Cookie` or override any `Access-Control-*` header.

Starting-point shape (values are illustrative and are tuned when the host is
built):

```nginx
limit_req_zone $binary_remote_addr zone=uat_general:10m rate=10r/s;
limit_req_zone $binary_remote_addr zone=uat_api:10m rate=5r/s;
limit_req_status 429;

server {
    listen 443 ssl;
    server_name uat.sutriva.io;

    auth_basic           "Sutriva private UAT";
    auth_basic_user_file /etc/nginx/sutriva-uat.htpasswd;
    client_max_body_size 64k;
    limit_req zone=uat_general burst=30 nodelay;

    location = /docs         { return 404; }
    location = /redoc        { return 404; }
    location = /openapi.json { return 404; }

    location ^~ /v1/ {
        limit_req zone=uat_api burst=20 nodelay;
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    location = /health { proxy_pass http://127.0.0.1:8000; proxy_set_header Host $host; }
    location = /ready  { proxy_pass http://127.0.0.1:8000; proxy_set_header Host $host; }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

The firewall opens port 80 (certificate challenge and redirect to HTTPS), port
443, and port 22 only to named administrator addresses.

## C. Origins and the session cookie

The API reads its origin configuration from these variables in
`services/api/app/session_config.py`. The name `ALLOWED_ORIGINS` is not read by
the application and has no effect.

| Variable | Purpose |
| --- | --- |
| `ANONYMOUS_SESSION_ALLOWED_ORIGINS` | Comma-separated list of allowed browser origins. It drives both the CORS middleware and the anonymous-session origin check, which returns `403 invalid_origin` for any other origin, including a request that carries no `Origin` header. |
| `ANONYMOUS_SESSION_PRODUCTION_ORIGIN` | The deployed frontend origin. The API refuses to start unless this value appears in `ANONYMOUS_SESSION_ALLOWED_ORIGINS`. The code defaults it to `https://app.sutriva.com`, so set it explicitly for every deployment. |
| `ANONYMOUS_SESSION_ALLOW_INSECURE_LOCALHOST` | Local development only. `true` removes the `Secure` attribute from the session cookie. Never enable it in a deployed environment. Leave it unset or `false`. |

For the private UAT, set both origin variables to `https://uat.sutriva.io`.

Rules:

- Each origin must be a full explicit origin: scheme, host and, if not the
  default, port. Include `https://`. Do not add a trailing slash or a path.
  Separate several origins with commas.
- Do not use a wildcard. The API sends credentialed CORS responses and rejects
  `*` at startup.
- If `ANONYMOUS_SESSION_ALLOWED_ORIGINS` is unset, the API falls back to the
  localhost development origins. A deployed frontend is not covered by that
  default.
- Even on a same-origin deployment, browsers send an `Origin` header on the
  `POST` requests, so the allowed-origin check must match.

The anonymous-session cookie is `HttpOnly`, `Secure` and `SameSite=Lax`, and it
is set without a `Domain` attribute, so it belongs to the host that set it. On
`uat.sutriva.io` it is a host-only cookie: it is not shared with `sutriva.io`,
and production cookies are not sent to UAT. Browsers do not send a
`SameSite=Lax` cookie on cross-site fetch requests, so the PWA and the API must
be the same origin (the approved topology) or sibling custom subdomains of one
registrable domain.

## C2. Frontend feature flags are build-time values

The PWA reads these flags from the build environment:

```text
NEXT_PUBLIC_TRACK_11A_ENABLED=true
NEXT_PUBLIC_TRACK_11B_ENABLED=false
```

- Next.js inlines `NEXT_PUBLIC_*` values into the client bundle when it builds.
  Changing either variable on an already built deployment has no effect.
- Changing either flag requires a rebuild and a redeployment.
- Only the exact strings `true` and `false` are honoured. Any other value, or an
  unset variable, falls back to the committed `shared/track11_config.json`.
- Do not edit `shared/track11_config.json` to change a deployment.
- With `NEXT_PUBLIC_TRACK_11A_ENABLED=true`, `/money-value` and `/borrow-better`
  render only the final 1.1A journeys (Steps 2 to 5). The legacy Reveal, Intent,
  Closure and terminal flow is reachable only when that flag is `false`, so it
  is **not** part of the private UAT and must not be exercised or tested there.
  `NEXT_PUBLIC_TRACK_11B_ENABLED` does not expose anything beyond Step 5.

The illustrative borrowing rate is policy-controlled. The API reads it from
`shared/track11_config.json` at runtime and the PWA reads the same file at build
time, so build and run both from the same commit. A change to the file needs an
API restart and a PWA rebuild. See [decision_log.md](../decision_log.md).

## D. End-to-end verification (smoke test)

Run these on the deployed UAT host and record the evidence. Do not paste
passwords, cookies or tokens into any record.

**Access and platform**

1. A request without credentials is refused. `/docs`, `/redoc` and
   `/openapi.json` return `404`, with or without credentials.
2. Send more requests than the rate limit allows (use a credentials file, not a
   password on the command line) and confirm some return `429`.
3. `GET /health` returns `"status": "ok"`. `GET /ready` returns
   `migration: current` and `database: reachable`.
4. `SELECT version();` reports PostgreSQL 16.x and `alembic current` reports
   `0003_product_event_screen_name (head)`.
5. `POST /v1/anonymous-sessions/bootstrap` with `Origin: https://uat.sutriva.io`
   returns `200` with a `Set-Cookie` that carries `Secure`, `HttpOnly` and
   `SameSite=Lax` and no `Domain`. The same request with any other `Origin`
   returns `403 invalid_origin`.

**Rewards journey (`/money-value`) and Borrow journey (`/borrow-better`)**

6. Open the home page over HTTPS and confirm it shows **Backend connected**.
7. Complete each journey through Steps 2 to 4, including the what-if or EMI
   updates, and confirm results render. On Borrow, the illustrative rate shown
   is the API-configured 14% and there is no control to change it.
8. Reach **Step 5 of 5** in each journey and confirm it:
   - shows the banner `ILLUSTRATIVE EXAMPLE — NOT YOUR DATA`;
   - contains **no** "Interested" or "Not now" controls;
   - contains **no** pilot call to action;
   - contains **no** mobile-number or OTP input;
   - exposes **no** Step 6 or later screen;
   - offers only navigation back or home.

**Events**

9. After the run, query the UAT database:

   ```sql
   SELECT journey, event_type, screen_name, count(*)
   FROM product_events
   GROUP BY 1, 2, 3
   ORDER BY 1, 2, 3;
   ```

   Only these 1.1A event types may appear: `door_selected` (no `screen_name`),
   `step_viewed`, `step_completed`, `result_declared` and
   `connected_example_seen`. Every non-null `screen_name` must be one of
   `rewards_card_behaviour`, `rewards_priorities_inputs`, `rewards_check`,
   `rewards_connected_example`, `borrow_monthly_position`, `borrow_plan`,
   `borrow_check` and `borrow_connected_example`. Event tracking is best-effort
   in the client, so a missing `door_selected` row is recorded, not treated as a
   Step 5 failure.
10. **None** of these event types may appear, because they belong to the legacy
    continuation flow or to Phase 1.1B: `pilot_cta_selected`,
    `go_deeper_selected`, `go_deeper_declined`, `next_interest_viewed`,
    `next_interest_selected`, `next_interest_skipped`, `teaser_viewed`,
    `teaser_cta_selected`, `decline_reason_selected`, `mobile_entry_started`,
    `otp_requested`, `otp_request_failed`, `otp_verification_succeeded`,
    `otp_verification_failed`, `otp_expired`, `pilot_consent_recorded`,
    `marketing_consent_recorded` and `consent_withdrawn`. Any row for these is
    a failure. The Step 6 funnel events named in
    [JOURNEY_FLOW_SPEC.md](../product/journeys/JOURNEY_FLOW_SPEC.md) must not
    appear either.
11. Financial inputs must not appear in nginx, uvicorn or audit logs.

If a deployment is rebuilt, repeat all steps.

## Rollback

- Application: re-select the previous release directory and restart both
  services. A PWA rollback needs the previous build.
- Configuration: restore the last known good origin variables and rebuild only if
  a build-time value changed.
- Database: take a manual database snapshot immediately before the first
  migration. The UAT database is disposable, so the preferred rollback is to
  restore that snapshot or delete and recreate the database and re-run
  `alembic upgrade head`. Do not run a downgrade against data that matters.
- Teardown: remove the DNS record, then delete `sutriva-uat`, `sutriva-uat-ip`
  and `sutriva-uat-db`. Production resources are not part of any rollback.

## Environment summary

| Variable | Service | Value |
| --- | --- | --- |
| `DATABASE_URL` | FastAPI | `postgresql+psycopg://` URL for the UAT database. Never commit real values. |
| `DATABASE_REQUIRED` | FastAPI | `true` |
| `ANONYMOUS_SESSION_ALLOWED_ORIGINS` | FastAPI | `https://uat.sutriva.io`. No wildcard. |
| `ANONYMOUS_SESSION_PRODUCTION_ORIGIN` | FastAPI | `https://uat.sutriva.io`. Must be in the allowed list. |
| `ANONYMOUS_SESSION_ALLOW_INSECURE_LOCALHOST` | FastAPI | Unset or `false` |
| `AUDIT_LOG_PATH` | FastAPI | A path on persistent disk |
| `DATABASE_POOL_SIZE`, `DATABASE_MAX_OVERFLOW`, `DATABASE_POOL_TIMEOUT`, `DATABASE_POOL_RECYCLE`, `DATABASE_CONNECT_TIMEOUT` | FastAPI | Optional. Defaults apply when unset. |
| `NEXT_PUBLIC_API_BASE_URL` | PWA (build time) | `https://uat.sutriva.io`, absolute and never empty |
| `NEXT_PUBLIC_TRACK_11A_ENABLED` | PWA (build time) | `true`. Rebuild to change. |
| `NEXT_PUBLIC_TRACK_11B_ENABLED` | PWA (build time) | `false`. Rebuild to change. |

## Approval checkpoints

Each of these needs explicit approval before it happens. This document approves
none of them:

- creating the UAT database, instance, static IP and key pair;
- adding the `uat.sutriva.io` DNS record and issuing its certificate (the
  hostname becomes visible in public certificate-transparency logs);
- the first deployment and the first migration;
- any spend above the USD 32/month ceiling;
- exposing UAT to anyone other than the named testers, or any public pilot,
  which additionally requires re-evaluating the PostCSS finding above.

## Superseded options

Earlier versions of this runbook listed AWS App Runner, Amplify, Render,
Railway and Vercel as deployment options. None of them was the deployed
topology, and none is used for the private UAT, so their instructions were
removed. [infra/aws/README.md](../../infra/aws/README.md) still describes an
earlier App Runner and Amplify plan. It is superseded for the private UAT and
needs a separate correction.
