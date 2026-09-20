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

### Phase 1.1A: anonymous declared-data check and synthetic illustrative example

Step 1 chooses the journey door. Steps 2–3 collect anonymous declared inputs. Step 4 presents the declared-data result (“Your Rewards Check” or “Your Borrow Better check”). Step 5 presents the synthetic illustrative example (“What your real data could reveal”). Step 6 is the pilot-interest and verification boundary. Steps 7–8 remain future connected-data journeys.

The user should understand the immediate result before any pilot or permission flow is offered.

### Phase 1.1B: pilot-interest step only

Step 6 is the pilot-interest flow and is divided into two sub-steps: 6A and 6B.

- 6A: anonymous interest click only. No phone number, OTP, identity or permission is collected at this stage.
- 6B: mobile submission, OTP issuance and successful OTP verification. Anonymous-history linking occurs only after successful OTP verification.

Optional product or pilot updates remain a separate choice and must be unchecked by default. Pilot interest, OTP verification, optional updates and future data permissions are distinct signals. Step 6 analytics-event payloads must never contain the mobile number, OTP value or raw authentication data.

### Phase 1.2: future connected journey

Steps 7-8 are future-only and outside the current anonymous implementation scope.

- Step 7: choose which future permissioned data to connect
- Step 8: show the connected-data result

The future connected-data steps must use the word “permission” rather than “consent” in any user-facing choice or supporting description.

These steps are not the current implementation target and must not be treated as a release blocker for the anonymous quick-check flow.

## Exact eight-step sequences

### Rewards Intelligence

1. Choose Rewards
2. Your card behaviour
3. Your priorities and inputs
4. Your Rewards Check
5. What your real data could reveal
6. Join the pilot
7. Choose whether to share a statement
8. Your real card and rewards picture

### Borrow Better

1. Choose Borrow Better
2. Your monthly position
3. Your borrowing plan
4. Your Borrow Better check
5. What your real data could reveal
6. Join the pilot
7. Choose what you want to connect
8. Your real monthly borrowing picture

These exact labels replace any earlier step numbering that placed the result at Step 3 or the illustrative example at Step 4.

## Exact Step 6 event set

The authoritative Step 6 funnel events are:

1. `pilot_interest_clicked`
2. `mobile_submitted`
3. `otp_sent`
4. `otp_verified`
5. `optional_updates_opted_in`

These are the five Step 6 events. General 1.1A analytics events such as `journey_started`, `result_declared` and `connected_example_seen` may be documented elsewhere, but they are not part of the Step 6 funnel and must not be substituted for these five events.

## History linking and post-OTP rule

After successful OTP verification:

- the anonymous journey history is linked to the verified pilot interest
- the user is marked as verified pilot-interested
- Step 6A remains a separate anonymous interest click with no identity capture yet
- optional product updates remain separate and unchecked by default
- future data permissions are handled later under 1.2 and are not part of the 1.1B Step 6 funnel

## Exact permission and privacy rules

- Anonymous users are shown the declared result and illustrative example before any pilot registration or data-permission request.
- Step 6A does not collect a phone number, OTP, identity or permission. It is an anonymous interest click only.
- Step 6B may collect a mobile number and issue OTP; only successful OTP verification permits anonymous-history linking.
- Optional product or pilot updates are a separate signal and remain unchecked by default.
- Rewards statement permission is distinct from Borrow transaction/account permission and from bureau permission.
- Borrow transaction/account permission is separate from bureau permission. They are distinct permission categories and must not be conflated.
- No fixed customer-facing retention promise, including “12 months,” may be stated until supported by the verified Privacy Notice. Anonymous-session authentication expires after 90 days; this is distinct from the retention period applicable to persisted data.
- Any future data-contract, event-taxonomy and Privacy Notice dependency is deferred until a separate approval gate is passed.

## Exact borrowing calculation rule

Borrow Better uses the configured, read-only 14% rate.

- Estimated post-loan buffer: `−₹1,100`.
- Canonical rate copy: `Illustrative annual rate: 14%. Configured by policy; not a loan offer.`
- The 14% rate is display-only and cannot be edited by the customer.
- “Configured” or “configurable” in the artwork means policy-controlled, never customer-editable.
- The value is treated as a prototype baseline and not as a loan offer or financial advice.
- Where the written specification differs from the Borrow Better PNG concerning the post-loan buffer sign or rate copy, this written specification prevails. The authoritative post-loan buffer is −₹1,100, and the 14% illustrative annual rate is display-only, policy-controlled and not customer-editable.

## Implementation constraints

- Do not introduce a generic deeper-journey acknowledgement gate before the declared result is shown.
- Do not ask for data permission before the anonymous result and illustrative example are delivered.
- Keep the current implementation focused on 1.1A and completion of the anonymous result delivery.
- Defer 1.2 until the connected journey is formally approved.
- Maintain the two-door product structure and route-specific naming for Rewards Intelligence and Borrow Better.

## Governance note

This file takes precedence over earlier issue lists, handovers, and legacy specifications for journey ordering and user-flow requirements. When implementation or policy detail is in doubt, the final PNGs and this text are the controlling authority.
