# Decision Log

| Date | Decision | Rationale | Status |
|---|---|---|---|
| 2026-09-07 | GitHub-first product repository | Avoid ad-hoc build drift and make AI-assisted build controllable | Accepted |
| 2026-09-07 | PWA-first | Avoid native app-store complexity in Alpha-50 | Accepted |
| 2026-09-07 | Next.js + FastAPI | Portable frontend/backend split | Accepted |
| 2026-09-07 | Rules versioned in config, not buried in UI | Auditability and governance | Accepted |
| 2026-09-07 | Fulfilment gated | Legal/LSP/DLA risk | Accepted |
| 2026-09-08 | Two-door Alpha journey wired end-to-end with a "Go deeper" consent boundary | Quick value must earn the right to ask for more; no registration/sensitive data before first result | Accepted |
| 2026-09-08 | Added local-only `POST /v1/events` product-event logger (door_selected, check_started, check_completed, go_deeper_selected, go_deeper_declined) | Enable minimal product learning without third-party analytics; kept separate from audit events which carry policy/decision data | Accepted |
| 2026-09-08 | `/go-deeper` records interest only, not consent to data access | Avoid implying legal consent for real financial-data collection before that gate is cleared | Accepted |
