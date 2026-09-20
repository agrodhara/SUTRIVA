# Final Journey Flow Specification

This document is the authoritative source of truth for the product journey sequence. It is binding for implementation, QA, and future design changes unless a later governance-approved update explicitly replaces it.

## Authoritative references

- Rewards Intelligence final PNG: `docs/product/journeys/Sutriva_Rewards_Intelligence_Journey_v1.0_FINAL.png`
- Borrow Better final PNG: `docs/product/journeys/Sutriva_Borrow_Better_Journey_v1.0_FINAL.png`
- Product intent and door structure: `docs/product_constitution.md`

The PNGs above govern the exact sequence, wording, and phase boundaries. Any historical issue list, red-team note, or earlier handover is non-binding when it conflicts with these artifacts.

## Core product rule

Anonymous users must receive the declared result and an illustrative connected-insight example before pilot registration or any data permission request.

This rule applies to both Rewards Intelligence and Borrow Better. The consent, pilot registration, and data-permission steps are not the first user experience; they come after the anonymous value check is already delivered.

## Phase model

### Phase 1.1A: anonymous check and value delivery

Steps 1-5 are the public, anonymous quick-check journey in both product doors.

- Step 1: landing / door selection
- Step 2: collect the quick-check inputs
- Step 3: calculate and render the declared result
- Step 4: show the illustrative connected-insight example
- Step 5: offer the next non-committal closure or continuation within the same journey

The user should understand the immediate result before any pilot or permission flow is offered.

### Phase 1.1B: pilot interest, mobile and OTP

Step 6 is the pilot-interest flow and is divided into two sub-steps: 6A and 6B.

- 6A: anonymous interest click, mobile number capture, and submit to send OTP
- 6B: OTP send / verify / resend / expiry / failure handling, then verified pilot interest and history linking

The step must only appear after the anonymous result and illustrative example are shown. It is not a generic acknowledgement gate.

### Phase 1.2: future connected journey

Steps 7-8 are future-only and outside the current anonymous implementation scope.

- Step 7: connected-data or deeper-journey continuation
- Step 8: full connected insight and follow-up

These steps are not the current implementation target and must not be treated as a release blocker for the anonymous quick-check flow.

## Binding sequence per product

### Rewards Intelligence

1. Door selection / start
2. Input collection
3. Result summary
4. Illustrative connected-insight example
5. Anonymous closure or continuation
6A. Anonymous pilot-interest click
6B. Mobile submission, OTP send, verify, resend, expiry, failure handling, verified pilot interest, post-OTP history linking
7. Connected journey continuation
8. Connected insight outcome

### Borrow Better

1. Door selection / start
2. Monthly position input and affordability snapshot
3. Borrowing plan and comfort result
4. Results framing and illustrative connected-insight example
5. Anonymous closure or continuation
6A. Anonymous pilot-interest click
6B. Mobile submission, OTP send, verify, resend, expiry, failure handling, verified pilot interest, post-OTP history linking
7. Connected journey continuation
8. Connected insight outcome

## Exact permission and privacy rules

- Anonymous users are shown the result and illustrative example before any pilot registration or data-permission request.
- Separate optional updates permission is distinct from the pilot-interest signal and must remain unchecked by default.
- Rewards statement permission is separate and is not the same as Borrow transaction/account permission.
- Borrow transaction/account permission is separate from bureau permission. They are distinct consent categories and must not be conflated.
- There is no fixed retention period. Retention is configured and read-only unless a future governance update defines a different policy.
- Any future data-contract, event-taxonomy and Privacy Notice dependency is deferred until a separate approval gate is passed.

## Exact borrowing calculation rule

Borrow Better uses the configured, read-only 14% rate.

- Rate: 14% p.a. effective baseline
- Mathematical rule: monthly capacity is calculated using the configured 14% rate and the declared borrower inputs
- The rate must not be user-editable in the product flow
- The value is treated as a prototype baseline and not as a loan offer or financial advice

## Funnel events

The journey collects five funnel events as the minimum product event set in the order below:

1. `journey_started`
2. `result_declared`
3. `connected_example_seen`
4. `pilot_interest_clicked`
5. `otp_verified`

After `otp_verified`, the system links the verified interest back to the anonymous journey history and records the associated product event metadata without storing raw PII or financial values.

## History linking and post-OTP rule

After OTP success:

- the anonymous session history is linked to the verified pilot interest
- the user is marked as a verified pilot-interested user
- no mobile or OTP step is shown before the declared result and illustrative example
- the optional updates permission remains separate, unchecked by default, and not required to complete pilot interest

## Implementation constraints

- Do not introduce a generic deeper-journey acknowledgement gate before the declared result is shown.
- Do not ask for data permission before the anonymous result and illustrative example are delivered.
- Keep the current implementation focused on 1.1A and completion of anonymous result delivery.
- Defer 1.2 until the connected journey is formally approved.
- Maintain the two-door product structure and route-specific naming for Rewards Intelligence and Borrow Better.

## Governance note

This file takes precedence over earlier issue lists, handovers, and legacy specifications for journey ordering and user-flow requirements. When implementation or policy detail is in doubt, the final PNGs and this text are the controlling authority.
