# First 10 GitHub Issues

> Deprecated: these issue entries are historical context only. The final authoritative flow is defined by the approved PNGs in [docs/product/journeys/Sutriva_Rewards_Intelligence_Journey_v1.0_FINAL.png](../product/journeys/Sutriva_Rewards_Intelligence_Journey_v1.0_FINAL.png) and [docs/product/journeys/Sutriva_Borrow_Better_Journey_v1.0_FINAL.png](../product/journeys/Sutriva_Borrow_Better_Journey_v1.0_FINAL.png), with the binding sequence written in [docs/product/journeys/JOURNEY_FLOW_SPEC.md](../product/journeys/JOURNEY_FLOW_SPEC.md). Any issue-based assumptions that conflict with these references are superseded.

**Original Alpha seed backlog. Not the strategic roadmap.**
Sequencing and status of the programme live in `ROADMAP.md`.

**Status as of:** 2026-09-20 (`main` at `d9c1eae`).

Use these as the first issues in GitHub. Keep each issue small.

Only Issues 1, 2 and 3 have a status below. Issues 4–10 have not been
re-assessed and are listed as originally written.

## 1. Home page two-door polish

Improve mobile home page copy and layout for Get More From My Money and Borrow Better.

**Status (2026-09-20): Complete.** Delivered through
[PR #9](https://github.com/agrodhara/SUTRIVA/pull/9) (merge `d9c1eae`).

## 2. Borrow Better quick-check form

Add form fields for income, existing EMI, desired amount, tenure and indicative interest rate.

**Status (2026-09-20): Already satisfied by the merged implementation. No
separate PR will be raised.** The form collects monthly income, existing
monthly commitments, desired borrowing amount and tenure. The indicative rate is
not a user field. It comes from the configured illustrative rate recorded in
`docs/decision_log.md` (2026-09-17). Delivered across
[PR #3](https://github.com/agrodhara/SUTRIVA/pull/3),
[PR #4](https://github.com/agrodhara/SUTRIVA/pull/4) and
[PR #5](https://github.com/agrodhara/SUTRIVA/pull/5).

## 3. Borrow Better API integration

Wire frontend form to FastAPI and display response.

**Status (2026-09-20): Under independent review.** The outcome is deliberately
not stated here. Update this entry when the review concludes.

## 4. Money Value quick-check form

Add rough inputs for card spend, fees, interest and subscription leakage.

## 5. Money Value API integration

Wire Money Value frontend form to backend response.

## 6. Shared result card

Create shared UI component for status, explanation and reason codes.

## 7. Consent component

Create reusable consent panel before deeper data.

## 8. API spec completion

Confirm API request/response examples match code.

## 9. Audit event hardening

Ensure every decision call writes safe audit event.

## 10. Bad-input tests

Add tests for missing, negative and zero values.
