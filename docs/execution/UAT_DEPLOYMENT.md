# Internal Alpha UAT deployment

This runbook deploys the existing Track-1 application for temporary internal
UAT. It does not add authentication, regulated-data integrations, lender
offers, applications, or any Track-2 capability.

The backend uses an ephemeral filesystem for audit and product-event JSONL
output under `/tmp/sutriva`. Events can be lost on restart or redeploy. No
database is required for this UAT deployment.

## A. Deploy the FastAPI backend

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
8. If a deployment is rebuilt, repeat the health and journey checks because
   the temporary event filesystem is not durable.

## Environment summary

| Variable | Service | Value |
| --- | --- | --- |
| `ALLOWED_ORIGINS` | FastAPI | Exact Vercel HTTPS origin |
| `NEXT_PUBLIC_API_BASE_URL` | Vercel | Backend HTTPS base URL |

