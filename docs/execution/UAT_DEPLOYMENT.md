# Private UAT deployment (AWS Lightsail, Mumbai)

This runbook describes the approved target for a **private, access-restricted
UAT** of the Track 1.1A application. It does not add authentication,
regulated-data integrations, lender offers, applications, or any Track-2
capability, and **it does not authorize a public launch**.

**Status: nothing described in "Approved private-UAT target" has been created or
deployed.** Creating each resource, the DNS record and the first deployment each
need separate explicit approval. See
[decision_log.md](../decision_log.md) for the decision record.

**Temporary exception.** Because the Lightsail instance quota is not yet
effective, a narrowly defined, access-restricted **closed production canary** on
the existing `sutriva-alpha` host is also approved. It is documented in its own
section, [Temporary closed production canary](#temporary-closed-production-canary-approved-exception),
below. It does not replace this separate UAT, which remains the preferred
longer-term environment, and it does not authorize a public launch.

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
  `0007_situation_pilot_interest` (adds the `situation_pilot_interest` table
  for the post-result pilot-interest email handoff — see
  [SITUATIONS_REDESIGN.md](SITUATIONS_REDESIGN.md) — and extends the
  `screen_name` allowlist; purely additive, no existing table or route changes
  meaning).
- `GET /health` is liveness only. `GET /ready` checks database connectivity and
  the Alembic head revision.
- `DATABASE_REQUIRED` defaults to `false`. Do not rely on that default for UAT.
- Optional: set `SITUATION_PILOT_INTEREST_ADMIN_TOKEN` (a secret, never
  committed) if the operator will retrieve the pilot-interest list via
  `GET /v1/situation-pilot-interest/admin/export`. Unset, that route 404s —
  the deployment works fully without it; the token only gates that one
  operator-only export.

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
any UAT step. The only exception is the temporary closed production canary
below, and only through its own deployment gate.

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

## Accepted dependency finding (private UAT and closed canary only)

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
CSS. The finding is therefore accepted for private UAT, and only for the one
additional case named under "Scope of the acceptance" below.

**It remains a blocker.** It must be re-evaluated, and resolved or re-accepted
in writing, before any public pilot. `npm audit` names `next@16.3.5` as the
version that clears it. No `overrides` or audit suppression is used.

**Scope of the acceptance.** It covers private UAT and, in addition, the
temporary closed production canary described below, which is authenticated and
limited to named testers. It covers nothing else. It does **not** cover any
unrestricted access or any Instagram or other public pilot.

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
  shares nothing with production, and no UAT step may modify `sutriva-alpha`,
  `sutriva-alpha-ip`, `sutriva.io` or the open quota request. The temporary
  closed production canary below is the only exception and follows its own
  gate.
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

A completed 1.1A journey produces exactly **six event records**, using **four
distinct event types**, all carrying one `journey_run_id`, in this order:

1. `step_viewed` for Step 2
2. `step_completed` for Step 2
3. `step_viewed` for Step 3
4. `step_completed` for Step 3
5. `result_declared` for Step 4
6. `connected_example_seen` for Step 5

Each record carries the `screen_name` for its step:

| Journey | Step 2 | Step 3 | Step 4 | Step 5 |
| --- | --- | --- | --- | --- |
| Rewards (`journey = money_value`) | `rewards_card_behaviour` | `rewards_priorities_inputs` | `rewards_check` | `rewards_connected_example` |
| Borrow (`journey = comfortable_borrowing`) | `borrow_monthly_position` | `borrow_plan` | `borrow_check` | `borrow_connected_example` |

A run belongs to one journey: every record in a Rewards run uses a `rewards_*`
screen name and a Borrow run uses only `borrow_*` names. The API rejects a
`screen_name` that does not match its `journey`.

`door_selected` is separate from this contract:

- It is a home-entry event, sent when a door card on the home page is clicked.
  It is not one of the six per-journey records.
- It is sent with its own fresh run identifier, so it appears in
  `journey_runs` as its own single-event run.
- It must **not** be required for the private-UAT journey pass. Its absence is
  recorded, not treated as a failure.
- It can be lost when the click triggers a full-page navigation before the
  request completes. That loss is a known defect and a **blocker to fix before
  the public pilot**, when home-entry analytics must be reliable.

No pilot, continuation, mobile, OTP or consent event is allowed in 1.1A.

9. Note the time you start the smoke run, run the Rewards and Borrow journeys
   **straight through** (Step 2 to Step 5, without using Back or re-entering a
   screen), then check each run. The query is scoped to runs started since
   `smoke_start`, groups the records by journey run, and compares each run with
   the exact six-record sequence for its journey. Runs that consist only of the
   separate `door_selected` event are left out.

   ```sql
   \set smoke_start '2026-09-21T10:00:00+00'   -- replace with your UTC start time

   WITH expected(journey, sequence) AS (
     VALUES
       ('money_value', ARRAY[
         'step_viewed:rewards_card_behaviour',
         'step_completed:rewards_card_behaviour',
         'step_viewed:rewards_priorities_inputs',
         'step_completed:rewards_priorities_inputs',
         'result_declared:rewards_check',
         'connected_example_seen:rewards_connected_example']),
       ('comfortable_borrowing', ARRAY[
         'step_viewed:borrow_monthly_position',
         'step_completed:borrow_monthly_position',
         'step_viewed:borrow_plan',
         'step_completed:borrow_plan',
         'result_declared:borrow_check',
         'connected_example_seen:borrow_connected_example'])
   ),
   per_run AS (
     SELECT r.journey_run_uuid, r.client_journey_run_id, r.journey, r.started_at,
            count(e.product_event_uuid) AS records,
            count(*) FILTER (WHERE e.journey <> r.journey) AS foreign_journey_records,
            COALESCE(
              array_agg(concat_ws(':', e.event_type, e.screen_name)
                        ORDER BY e.effective_occurred_at, e.received_at)
                FILTER (WHERE e.product_event_uuid IS NOT NULL),
              ARRAY[]::text[]) AS actual_sequence
     FROM journey_runs r
     LEFT JOIN product_events e ON e.journey_run_uuid = r.journey_run_uuid
     WHERE r.started_at >= :'smoke_start'::timestamptz
     GROUP BY r.journey_run_uuid, r.client_journey_run_id, r.journey, r.started_at
     HAVING count(*) FILTER (WHERE e.event_type IS DISTINCT FROM 'door_selected') > 0
   )
   SELECT p.client_journey_run_id, p.journey, p.records, p.foreign_journey_records,
          p.actual_sequence = x.sequence AS sequence_match,
          (SELECT array_agg(s ORDER BY s) FROM unnest(p.actual_sequence) AS s)
            IS NOT DISTINCT FROM
          (SELECT array_agg(s ORDER BY s) FROM unnest(x.sequence) AS s) AS records_match
   FROM per_run p
   JOIN expected x ON x.journey = p.journey
   ORDER BY p.started_at;
   ```

   Pass: there is one row for the Rewards run and one for the Borrow run, and
   each has `records = 6`, `foreign_journey_records = 0`, `sequence_match = true`
   and `records_match = true`. If `records_match` is true but `sequence_match`
   is false, compare `effective_occurred_at` and `received_at` by hand: two
   records that were sent within the same millisecond can arrive out of order
   and are not a failure. Any other difference is a failure.

   A run that used Back or re-entered a screen legitimately records extra
   `step_viewed` or `step_completed` rows. Do not use such a run for the
   exact-count check. Validate it only against step 10.

10. Confirm that nothing outside the contract was recorded since `smoke_start`.
    This must return **no rows**:

    ```sql
    SELECT event_type, count(*)
    FROM product_events
    WHERE received_at >= :'smoke_start'::timestamptz
      AND event_type NOT IN ('step_viewed', 'step_completed', 'result_declared',
                             'connected_example_seen', 'door_selected')
    GROUP BY event_type;
    ```

    In particular, none of these may appear, because they belong to the legacy
    continuation flow or to Phase 1.1B: `pilot_cta_selected`,
    `go_deeper_selected`, `go_deeper_declined`, `next_interest_viewed`,
    `next_interest_selected`, `next_interest_skipped`, `teaser_viewed`,
    `teaser_cta_selected`, `decline_reason_selected`, `mobile_entry_started`,
    `otp_requested`, `otp_request_failed`, `otp_verification_succeeded`,
    `otp_verification_failed`, `otp_expired`, `pilot_consent_recorded`,
    `marketing_consent_recorded` and `consent_withdrawn`. The Step 6 funnel
    events named in
    [JOURNEY_FLOW_SPEC.md](../product/journeys/JOURNEY_FLOW_SPEC.md) must not
    appear either. Any such row is a failure.
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
  which additionally requires re-evaluating the PostCSS finding above;
- starting the closed production canary's deployment gate, which needs its own
  explicit deployment authorization, and any widening of the canary beyond the
  owner and named testers.

## Temporary closed production canary (approved exception)

This section is an **approved exception**, not a replacement for the separate
private UAT above. It supersedes the "production is out of scope" rule only for
the narrowly defined canary described here. The separate Lightsail UAT stays the
preferred longer-term environment once AWS makes the instance quota effective,
and this plan is not deleted or changed by the canary.

**Status: deployed.** The canary is live at `https://sutriva.io`, currently
running PR #26's merge commit — see
[Deployed state (current)](#deployed-state-current) below for the exact
revision, migration, snapshots and verification evidence. The mutating steps
for each deployment still run only under the [deployment
gate](#future-deployment-gate-ordered), started by an explicit deployment
authorization each time.

### Deployed state (current)

| Item | Value |
|---|---|
| Deployed commit | `5eb2317f1e2bfed9da07f56df4f80f63766cf5b5` (PR #26 merge) |
| Release path | `/opt/sutriva/releases/5eb2317f1e2bfed9da07f56df4f80f63766cf5b5` |
| Rollback release | `/opt/sutriva/releases/a65808bc12c13ba950cbc2a06a7b0dfb35c75f05` (PR #25), untouched |
| Database migration | `0005_otp_send_log (head)`, applied to `sutriva-uat-db` only |
| Frontend build flags | `NEXT_PUBLIC_TRACK_11A_ENABLED=true`, `NEXT_PUBLIC_TRACK_11B_ENABLED=false` |
| Committed flags | `shared/track11_config.json` unchanged: `track11aEnabled=false`, `track11bEnabled=false` |
| Pre-deployment instance snapshot | `sutriva-alpha-pre-pr26-5eb2317-20260925T112234Z` — verified `available` |
| Pre-deployment database snapshot | `sutriva-uat-db-pre-pr26-5eb2317-20260925T112234Z` — verified `available` |

PR #26 ships the Phase 1.1B Step 6 pilot-interest code, but it is a **code
deployment only** — the flag-off rule above still applies in full. Verified
after activation:

- Every `/v1/pilot/*` route returns `404` (tested with schema-valid payloads,
  not just malformed ones, to rule out a false pass from request validation
  short-circuiting the flag check).
- No Step 6 UI, mobile-number field, OTP interface or Twilio reference appears
  in any served page or in any built JS chunk.
- `pilot_registrations`, `otp_challenges` and `otp_sends` all contain zero
  rows; no forbidden 1.1B/pilot event type exists anywhere in `product_events`.
- A full six-record Borrow event contract, posted end-to-end through a fresh
  anonymous session, matches the exact expected sequence and screen names.
- `/health`, `/ready` (`migration: current`), unauthenticated external access
  (`401`), `/docs` (`404`) and the `noindex` header all confirmed externally.
- PR #27 (a Twilio SMS adapter for the still-disabled pilot flow) was **not**
  deployed; the running release's tree contains no Twilio code. No SMS was
  sent.

**Deployment lessons from this rollout, carried forward for the next one:**

- `/tmp` on `sutriva-alpha` is RAM-backed tmpfs (about 210 MB) on a 419 MB
  total-memory instance. Staging a large build artifact there — even
  temporarily — can drop `MemAvailable` below the 60 MB abort threshold before
  any service is touched, purely from the artifact sitting in `/tmp`. Extract
  build artifacts directly to `/opt/sutriva/releases/<sha>/...` (real disk);
  never stage more than a few MB in `/tmp`.
- The deploy process must copy `shared/track11_config.json` (and its parent
  directory) into every new release. Omitting it doesn't only affect Phase
  1.1B: `app/config.py` reads that file from the release root unconditionally,
  so the core Borrow Better rate-config endpoints 500 without it too. This was
  caught by the smoke test before being called complete, not left latent.

**Separate from the deployment itself:** during post-deployment smoke testing,
an operator credential file was read to test authenticated access and was
exposed in a session transcript through a redaction error. That credential has
since been rotated on the host (old value confirmed rejected, new value
confirmed accepted) and the exposed local file has been removed. Unrelated
Twilio credentials that happened to be stored in the same file were rotated
separately by the account owner directly in the Twilio Console and were never
used by any deployment step. No credential value appears in this document or
in [decision_log.md](../decision_log.md).

### Scope

| Item | Value |
|---|---|
| Host | `sutriva-alpha` (existing static IP `sutriva-alpha-ip`) |
| Address | `https://sutriva.io` |
| Audience | The owner and named testers only, behind nginx Basic Auth |
| Application | Phase 1.1A only: `NEXT_PUBLIC_TRACK_11A_ENABLED=true`, `NEXT_PUBLIC_TRACK_11B_ENABLED=false` |
| Database | The existing private PostgreSQL 16 `sutriva-uat-db`, used as the isolated canary database. It is **not** a general production customer database. |
| Budget | The existing USD 32/month ceiling still applies |
| Duration | Temporary. It ends by owner decision or when the separate UAT replaces it. Any widening needs a new decision. |

The canary does **not** authorize any of these:

- a public launch, Instagram promotion, public advertising or unrestricted
  access;
- Phase 1.1B, mobile-number collection, OTP, Twilio, consent capture, Step 6 or
  Phase 1.2;
- any change to the legacy production release, the shared venv, or any nginx or
  systemd file before the deployment gate;
- any production modification outside the procedure in this section;
- deleting or changing the separate UAT plan.

Consequence to accept: with Basic Auth on the whole server, `sutriva.io` and
`www.sutriva.io` stop being publicly reachable while the canary is active. The
pre-1.1A application that is public today is no longer served to the public.

### Verified host state (read-only inspections on 2026-09-21)

| Item | Observation |
|---|---|
| Instance | `sutriva-alpha`, Amazon Linux 2023, `nano_3_1` |
| Memory | 419 MB measured RAM, normally about 157–196 MB available |
| Swap | 419 MB zram plus a 2 GB swapfile, swappiness 10 |
| Disk | about 16 GB free on a 20 GB root volume, about 1% of inodes used |
| OOM history | None since boot on 2026-09-14: kernel `oom_kill` 0, no cgroup OOM events, no OOM lines in the kernel log or journal |
| Legacy release | `/opt/sutriva/current` points to `/opt/sutriva/releases/7c20ba6c4e9ae384d4c7e361c2e78f00bd6e9066`, the only release |
| System runtimes | Python 3.9.25, Node 18.20.8 (with `nodejs-full-i18n`), npm 10.8.2 |
| Services | `nginx`, `sutriva-api` (uvicorn, loopback 8000) and `sutriva-pwa` (loopback 3000), all running with 0 restarts |
| Legacy app | The pre-1.1A Track 1.1 application. Its API has no anonymous-session route and no `/ready`, and its units define no database variable. |
| nginx | No Basic Auth, no rate limits and no security headers. Only `/health` and `/v1/` reach FastAPI, and access logs record no request bodies. |
| Certificate | Let's Encrypt for `sutriva.io` and `www.sutriva.io`, renewed by the certbot nginx authenticator, expires 2026-12-13 |
| Database | `sutriva-uat-db`: PostgreSQL 16.15, `micro_2_0`, private, backup-retention flag enabled (retention length not verified). Reachable from the host over TCP port 5432; no authentication was attempted. |
| Event and audit files | `/tmp/sutriva/product_events.jsonl` and `audit_events.jsonl` are on **tmpfs**, so they are lost on reboot. They held 289 and 81 lines when inspected. Copy them off the host before any restart. |
| SSH | Restricted to a single administrator `/32`. Do not broaden it. |

Estimates of the added load are not measurements. On a like-for-like emulated
comparison the new PWA process used about 23 MB more than the legacy one, and
the API on Python 3.11 with SQLAlchemy is expected to use roughly 25–45 MB more
than today. Measure both on the host during activation.

### Verified target runtime

Both runtimes were checked against the cached AL2023 repository metadata, dry-run
resolved, and exercised off-host in Amazon Linux 2023 Linux/amd64 containers
using the exact repository RPMs.

| Runtime | Verified facts |
|---|---|
| Python 3.11 | `python3.11` and `python3.11-pip` 3.11.16 from `amazonlinux`, plus dependencies: 6 packages, about 15 MB download, about 60 MB installed. It ships only `/usr/bin/python3.11` and `pip3.11`. There is no `python3` link and no alternatives entry, so system Python 3.9 is unchanged. |
| Node 22 | `nodejs22`, `nodejs22-libs` and `nodejs22-full-i18n` 22.23.2: 3 packages, about 29 MB download, about 111 MB installed. `nodejs22-full-i18n` is required: without it `Intl.NumberFormat("en-IN")` prints `1,234,567.891`, with it `12,34,567.891`. |
| Alternatives | `nodejs22` registers the `node` alternative at priority 100, the same as Node 18. In container tests with the same `alternatives` version, installing it left `/usr/bin/node` and `/usr/bin/npm` on Node 18. The runbook still requires pinning the alternative to Node 18 first. |
| Wheels | The API dependencies resolve to 24 wheels (about 12 MB) for CPython 3.11 on manylinux x86_64, with no source distributions and nothing to compile on the host. Resolve them in a Linux/amd64 environment, because `greenlet` is selected by a platform marker. |
| Frontend | On Node 22.23.2 in an AL2023 container the exact approved SHA passed all 217 tests, lint, `tsc --noEmit` and the production build. |
| Artifact | `next start` runs from an artifact of `.next` (without its cache), the package files and the complete production `node_modules` (about 466 MB raw, about 143 MB compressed). SWC and sharp were shown not to be needed at runtime, but the complete tested set is what ships. |

Runtime rules for the canary:

- System Python 3.9 and the global `node` and `npm` alternatives stay on the
  legacy versions. The legacy unit stays on Node 18.
- The new PWA unit invokes `/usr/bin/node-22` and the Next entry point directly
  (`node_modules/next/dist/bin/next start`). It does not use the global `node`
  or `npm`.
- The new release lives in its own directory with its own per-release Python
  3.11 venv, created from `/usr/bin/python3.11` and populated only from the
  tested wheelhouse. `/opt/sutriva/venv` and the existing release are never
  modified.
- All building and testing happens off-host in Linux/amd64. No `npm ci` or
  `next build` runs on the nano instance.

### Access, routing and logging requirements

These must all be active before the new application becomes reachable:

- Basic Auth on every hostname the server answers (`sutriva.io`,
  `www.sutriva.io` and the catch-all), with the credential file outside the
  repository and the password never shared in chat.
- `X-Robots-Tag: noindex, nofollow` on every response, including errors.
- nginx rate limits, at server level and for `/v1/`.
- `/v1/*`, `/health` and `/ready` routed to FastAPI, everything else to Next.js,
  and `/docs`, `/redoc` and `/openapi.json` returning `404`.
- The ACME renewal challenge path must keep working (unauthenticated on port 80
  for that path only), without weakening access to the application. Verify this
  before activation, for example with a certbot dry-run renewal.
- No request-body logging.
- Both origin variables set to `https://sutriva.io`, and `www.sutriva.io`
  redirected to the apex behind Basic Auth. `NEXT_PUBLIC_API_BASE_URL` is the
  absolute `https://sutriva.io`, `DATABASE_REQUIRED=true` and `DATABASE_URL`
  uses `postgresql+psycopg://`.
- Persistent audit storage outside `/tmp`, with restrictive permissions.

### Future deployment gate (ordered)

Not executed by this document. Each step needs the previous one to pass:

1. Confirm the SSO assumed-role identity (not root) and the exact approved SHA.
2. Confirm the current SSH firewall `/32`; do not broaden it.
3. Confirm the website and the legacy services are healthy.
4. Create the instance snapshot and verify it reaches a successful terminal
   state.
5. Create the database snapshot and verify it reaches a successful terminal
   state.
6. Copy off the host: the nginx configuration, both systemd units,
   `/tmp/sutriva/audit_events.jsonl`, `/tmp/sutriva/product_events.jsonl` and the
   current release metadata.
7. Configure persistent audit storage outside `/tmp`, with restrictive
   permissions.
8. Require at least 150 MB `MemAvailable` before each package transaction.
9. Pin Node 18's alternative without changing its current target.
10. Install Python 3.11 and Node 22 in separate transactions.
11. Verify system Python and the global `node` and `npm` still resolve to the
    legacy versions.
12. Upload the independently built artifact to a new release directory.
13. Create the per-release venv from `/usr/bin/python3.11` and install only from
    the tested wheelhouse.
14. Install the new nginx configuration with Basic Auth, `noindex, nofollow`,
    API rate limiting, `/docs`, `/redoc` and `/openapi.json` blocked, the ACME
    renewal path preserved and no request-body logging.
15. Validate nginx before reloading it.
16. Retrieve the database credentials without printing them or placing them in
    chat, shell history, logs or the repository.
17. Run `alembic upgrade head` only against `sutriva-uat-db`.
18. Start the new API first and require `/ready` to report `migration: current`.
19. Start the new PWA using `/usr/bin/node-22`.
20. Restart sequentially while monitoring memory.
21. Abort and roll back if `MemAvailable` falls below 60 MB during application
    activation, an OOM occurs, `/ready` fails, the homepage or either journey
    fails, Basic Auth, `noindex` or rate limiting is absent, or events do not
    persist.
22. Perform the authenticated closed-canary smoke test below.
23. Keep the site access-restricted after validation.

Package transactions must never be killed once the RPM transaction has begun.
The 60 MB threshold applies to application activation, not to an in-progress
package transaction. Before the RPM step the gate is the 150 MB start
requirement in step 8.

The instance snapshot is a recovery aid, not the primary rollback: restoring one
creates an instance, which the ineffective quota currently blocks. The
file-level rollback below is the rollback.

### Rollback

Rollback is a symlink reversal and a sequential service restart:

1. Point `/opt/sutriva/current` back to
   `/opt/sutriva/releases/7c20ba6c4e9ae384d4c7e361c2e78f00bd6e9066`.
2. Restore the backed-up nginx configuration and unit files, validate nginx, then
   reload it.
3. Restart the API and then the PWA, one at a time, and verify `/health` and the
   homepage.

The database is not downgraded. The legacy release and shared venv were never
modified, so this restores the previously deployed application. Restore the
copied `/tmp/sutriva/*.jsonl` files only if they were lost.

### Smoke-test contract

Run the authenticated closed-canary test after activation, using the queries in
section D, with the canary host in place of `uat.sutriva.io`:

- Unauthenticated application and API requests are refused; authenticated access
  works.
- Responses carry `noindex, nofollow`.
- `/docs`, `/redoc` and `/openapi.json` are unavailable publicly.
- `/ready` reports the current migration.
- Anonymous-session bootstrap sets the secure cookie.
- Rewards and Borrow complete Steps 2–5.
- Step 5 shows `ILLUSTRATIVE EXAMPLE — NOT YOUR DATA`.
- No Step 6, pilot call to action, "Interested", "Not now", mobile, OTP or
  consent interface appears.
- Each straight-through journey produces exactly six records using four event
  types under one `journey_run_id`.
- No forbidden Phase 1.1B or consent event type appears.
- `door_selected` is excluded from the six-record pass criterion.
- No financial input values appear in logs, URLs, browser storage or audit
  records.

### Known issues carried by the canary

- The PostCSS finding (one high and one derivative moderate) is accepted only
  for this authenticated, named-tester canary. It remains a blocker requiring
  re-evaluation before any unrestricted or Instagram pilot.
- The loss of `door_selected` on full-page navigation is not part of the
  six-record contract and does not block this canary. It remains a blocker for
  public-pilot analytics.
- Backup retention duration of `sutriva-uat-db` is unverified.

### Budget

At list price before tax, the current recurring cost is about USD 20 per month
(`nano_3_1` USD 5 plus `micro_2_0` USD 15). The two required snapshots add about
USD 3 per month while retained (20 GB and 40 GB at USD 0.05 per GB-month), about
USD 23 in total, within the USD 32 ceiling. Any change that exceeds the ceiling
needs a new approval.

## Superseded options

Earlier versions of this runbook listed AWS App Runner, Amplify, Render,
Railway and Vercel as deployment options. None of them was the deployed
topology, and none is used for the private UAT, so their instructions were
removed. [infra/aws/README.md](../../infra/aws/README.md) keeps its historical
App Runner and Amplify plan behind a notice that supersedes it for both the
private UAT and the closed canary.
