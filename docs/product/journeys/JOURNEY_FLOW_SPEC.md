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

### Phase 1.1A: Anonymous check and value delivery

Steps 1–5 are the public, anonymous quick-check journey in both product doors.

- Step 1: landing / door selection
- Step 2: collect the quick-check inputs
- Step 3: calculate and render the declared result
- Step 4: show the illustrative connected-insight example
- Step 5: offer the next non-committal closure or continuation within the same journey

The user should understand the immediate result before any pilot or permission flow is offered.

### Phase 1.1B: Pilot join and permission boundary

Step 6 is the pilot registration / deeper-journey permission moment.

- This step is reached only after Step 5 is complete.
- It is not a generic acknowledgement gate.
- It is a deliberate pilot-signup or permission step aligned with the final approved flow.
- It must not occur before the user has seen the result and the illustrative connected-insight example.

### Phase 1.2: Future connected journey

Steps 7–8 are future-only and outside the current anonymous implementation scope.

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
6. Pilot join / permission
7. Connected journey continuation
8. Connected insight outcome

### Borrow Better

1. Door selection / start
2. Input collection
3. Result summary
4. Illustrative connected-insight example
5. Anonymous closure or continuation
6. Pilot join / permission
7. Connected journey continuation
8. Connected insight outcome

## Implementation constraints

- Do not introduce a generic deeper-journey acknowledgement gate before the declared result is shown.
- Do not ask for data permission before the anonymous result and illustrative example are delivered.
- Keep the current implementation focused on 1.1A and completion of anonymous result delivery.
- Defer 1.2 until the connected journey is formally approved.
- Maintain the two-door product structure and route-specific naming for Rewards Intelligence and Borrow Better.

## Governance note

This file takes precedence over earlier issue lists, handovers, and legacy specifications for journey ordering and user-flow requirements. When implementation or policy detail is in doubt, the final PNGs and this text are the controlling authority.
