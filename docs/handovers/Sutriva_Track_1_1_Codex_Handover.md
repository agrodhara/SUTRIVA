# Sutriva Track 1.1 — Codex Handover

Prepared by: Claude (repository verification + handover assembly only — no implementation performed)
Verification pass: 2026-09-13, this document
Governing specification: `Sutriva_Track_1_1_Single_Agent_Master.md` (13 September 2026, "reconciled after Claude's repository review")
Status: **FROZEN.** This document is self-contained. Do not reopen product strategy. Codex should be able to take this file alone, confirm the starting state, implement the authorised change, run the checks, and return one reviewable PR without guessing product behaviour.

This document supersedes `Sutriva_Track_1_1_Claude_Prompt.md` and its V1 visual reference (including the unsupported ₹18.4L Borrow Better hero). It carries forward, unchanged, every product decision in the Single Agent Master file. Sections 3 and 4 below are that file's execution policy and product specification, reproduced in full — nothing has been shortened, summarised, or replaced with "see above." Section 1 adds a fresh, dated repository verification pass on top of it. Section 2 is a short change ledger covering the small number of process-level (not product-level) points this verification pass needed to correct or flag. No product copy, enum, screen, or behaviour described in the master file has been altered.

---

## 1. Verified repository baseline — 2026-09-13

Verification was performed two ways: (a) directly against the user's local clone of `agrodhara/SUTRIVA` (branch `copilot/copilotalpha50-reconciliation-final`) via a fresh `git fetch --all --prune`, and (b) against the public GitHub pages for the repository. Every fact below is labelled by how it was obtained. Codex must re-confirm the SHA and branch state again at the moment it actually starts work — time has passed between this verification and implementation, and section 1.4 below identifies a specific reason that re-check is not optional this time.

### 1.1 Verified this turn (fresh git fetch + GitHub page fetch, 2026-09-13)

- **Repository:** `agrodhara/SUTRIVA`.
- **Durable integration branch:** `copilot/copilotalpha50-reconciliation-final`.
- **Current remote HEAD of that branch:** `cd6d80368ee89a2deb13764bf2394372aaed13a4` ("chore: prepare alpha50 internal uat deployment"). This was confirmed by fetching the remote directly (`git fetch --all --prune` then `git rev-parse origin/copilot/copilotalpha50-reconciliation-final`), not carried over from an earlier session. It happens to match the SHA reported in the master file's Section 1 as "Claude reports inspecting... HEAD `cd6d803`" — that prior report is now independently re-verified as still current as of this timestamp, not merely repeated. It is **not** to be treated as a fixed instruction to build from that exact SHA (per the master file's own Section 2); Codex must re-fetch at start of work.
- **Local working tree state:** clean of tracked changes; untracked-only items are `Claude outputs/` (this engagement's own review files), `apps/pwa/.gitignore`, `railway.toml`, `requirements.txt` — none are Track 1.1-related and none should be disturbed or committed incidentally.
- **PR #3** ("Reconcile Alpha-50 into durable integration branch"): **state = Draft**, **base = `main`**, **head = `copilot/copilotalpha50-reconciliation-final`**, 21 commits, author Copilot AI, last updated 2026-09-13, awaiting review from `agrodhara`. This directly confirms the master file's framing: `main` is untouched by this PR, and the head branch — not a merge into `main` — is the correct integration target. **PR #3 does not need to be merged before Track 1.1 work begins**, consistent with the master file's instruction not to require that.
- **No Track 1.1 branch, issue, or PR currently exists.** The full remote branch list is: `main`, `copilot/add-health-endpoint-and-test`, `copilot/alpha50-reconciliation-final`, `copilot/copilotalpha50-reconciliation-final`, `copilot/implement-comfortable-borrowing-check`, `copilot/money-value-check`, `copilot/origin-integration-alpha50-reconciled`, `copilot/ux-merge-frontend-refinement`, `copilot/vertical-slice-3-audit-event-persistence`, `copilot/vertical-slice-5-alpha-journey-consent-boundary`, `integration/alpha50-reconciled`. None reference Track 1.1, reveal/intent/closure, or continuation flow. The repository's only three PRs are #1 (PWA backend connectivity indicator), #2 (Comfortable Borrowing Check), #3 (the reconciliation PR above) — none is Track 1.1. **Codex should create exactly one new task branch from the verified current SHA**, per master Section 2, rather than search further for a branch that does not exist.
- **`docs/decision_log.md`** currently ends at 2026-09-08 (Alpha-50 reconciliation policy and product-events entries). No Track 1.1 entry exists yet — confirms this increment has not been logged or started by anyone.
- **CI workflow (`.github/workflows/ci.yml`)** triggers only on `pull_request` and `push` to `main` — pushing directly to `copilot/copilotalpha50-reconciliation-final` does **not** by itself trigger this workflow; CI runs against that branch happen through PR #3's pull-request/synchronize events. The workflow runs Python tests for `services/decision_engine`, `services/learning_engine`, and `services/api` only; there is no frontend typecheck/build/lint step defined in this workflow file, so "run the frontend typecheck/build" (master Section 10/11) will need to be run manually by Codex, not assumed to be covered by CI.

### 1.2 Previously reported (from Claude's earlier repository review this engagement, not independently re-opened file-by-file in this verification pass, but not contradicted by anything found)

- `journey` enum is `"comfortable_borrowing" | "money_value"` (not `borrow_better`), from `apps/pwa/lib/api.ts` and `services/api/app/models/product_event.py`.
- `ComfortableBorrowingCheckResponse` has no lump-sum comfortable-borrowing amount field — only `policy_version`, `estimated_new_monthly_commitment`, `total_monthly_commitment`, `commitment_ratio`, `comfort_status`, `reason_codes`, `next_best_action`, `guidance_disclaimer`, `audit_event_id`, `audit_event`.
- `decision_context` is a fixed `"local_demo"` string set in `trackEvent()` in `lib/api.ts`, not a payload slot for intent/reason.
- Real, coherent design tokens exist and are wired through `app/styles.css` → `app/layout.tsx` (Inter font, `#f7f7f3` background, `#171717` ink, `#16794f` green primary, `#d9d7cc` borders, 28px card radius, pill buttons) — the product is not "bare unstyled HTML."
- Two redundant, uncoordinated continuation surfaces exist: the inline `FutureInterestCapture` component (rendered at the bottom of both Result views) and the separate `/go-deeper?journey=` route — neither currently cross-linked, both firing `go_deeper_selected`/`go_deeper_declined`.
- No phone-frame/native-app chrome exists anywhere in the shipped product; it is a responsive web page (`.shell` max-width 980px, `.journey` max-width 820px).

These are carried forward as reported, not re-verified line-by-line in this pass. The master specification already tells Codex to re-confirm each of these against the actual current checkout before relying on them (Section 1, "Confirm the current checkout, HEAD, types, functions and tokens before relying on the reported findings") — that instruction stands unchanged.

### 1.3 Could not verify this turn — explicitly unresolved, assigned to Codex

- **Exact pass/fail CI status for HEAD `cd6d803`.** The GitHub Actions run list shows CI runs #14 and #15 ("Reconcile Alpha-50...") triggered by PR #3 synchronize events, both showing status **"Action required"** rather than a clean pass — this typically means GitHub is withholding automatic workflow execution pending approval (common for bot/Copilot-authored PRs) rather than a test failure, but this could not be confirmed either way through available read access; the PR checks page did not load far enough to show a per-check pass/fail breakdown. **Codex must check the actual CI status for its starting SHA directly in the repository before treating baseline checks as already green**, per master Section 3 ("Use existing CI evidence for the same starting SHA when complete and relevant; otherwise run documented baseline checks once").
- **Whether the repository's "existing agent-instruction file" (referenced in master Section 5) actually exists.** A search of the working tree (`.github/`, repo root, and common locations to depth 4) found no `AGENTS.md`, `copilot-instructions.md`, or similarly named file. See change ledger item 2.1 below.
- **Frontend regression/typecheck/build evidence** — not run in this verification pass (this task is read-only verification, not implementation). Codex must run these itself per master Sections 10–11.

### 1.4 Genuinely unresolved — flagged, not guessed: possible concurrent activity on the integration branch

At the moment of this verification (2026-09-13), the repository's Actions run list showed **three "Copilot cloud agent" workflow runs (#33, #32, #31) with status "Running", all against branch `copilot/copilotalpha50-reconciliation-final`** — the same branch this handover designates as the integration baseline. This is not this Claude session's own activity: this session has made no commits, pushes, or repository writes of any kind (it is explicitly barred from doing so). It may be an automated Copilot PR-review/response job tied to draft PR #3 that does not write new commits, or it may be an actual Copilot coding-agent session actively working on this branch. Read-only inspection could not distinguish between these two possibilities, and a fresh `git fetch` at verification time showed no commit newer than `cd6d80368ee89a2deb13764bf2394372aaed13a4` — but that is a single point-in-time snapshot and does not rule out a push landing shortly after.

This is exactly the situation master Section 2 ("confirm baseline closeout has finished and no other agent is still writing the baseline") and Section 6 ("fetch integration again and compare it with the recorded starting SHA... if it moved, inspect the actual intervening commits") already instruct Codex to handle. **This finding does not change what Codex should do — the master file's own re-fetch-and-compare discipline already covers it — but it is flagged explicitly here so the first action Codex takes is that re-fetch, not an assumption that `cd6d80368ee89a2deb13764bf2394372aaed13a4` is still current by the time it starts.**

---

## 2. Change ledger — process-level corrections only, no product decisions changed

| # | Master file assumption | What this verification found | Resolution |
|---|---|---|---|
| 2.1 | Section 5 says to "update the repository's existing agent-instruction file" | No such file currently exists anywhere in the repository (searched to depth 4, including `.github/`) | Codex should **create** a minimal one (e.g. `AGENTS.md` at repo root, or `.github/copilot-instructions.md` if that is the convention this repo's tooling expects) containing the single concise rule the master file specifies ("single writer; one branch/PR per vertical outcome; resume existing PR for fixes; verify current integration baseline"), rather than search further for a pre-existing file that is not there. This is a file-creation detail, not a product or process-policy change. |
| 2.2 | Master implicitly assumes CI evidence for the current baseline SHA is checkable and current | CI runs against PR #3 show "Action required" rather than a clear pass, and the exact per-check result for HEAD `cd6d80368ee89a2deb13764bf2394372aaed13a4` could not be read through available access | Codex must check this directly (it has full repository access this verification pass does not) before relying on existing CI evidence as "complete and relevant" under master Section 3; if genuinely blocked, run the documented baseline checks once, as the master file already directs. |
| 2.3 | N/A — new information, not a correction | Active "Copilot cloud agent" runs were observed against the integration branch at verification time (Section 1.4) | No change to instructions — flagged so Codex's mandatory re-fetch-and-compare at start of work (master Sections 2 and 6) is not skipped as a formality. |

No line of product copy, no screen, no event enum, no UI specification, and no acceptance criterion in the master file required correction. Sections 3 and 4 below are reproduced exactly as authored.

---

## 3. Execution policy — governs the entire task

*(Reproduced in full from `Sutriva_Track_1_1_Single_Agent_Master.md`. Verified-baseline values from Section 1 above apply wherever this section says to fetch/confirm/record them.)*

### 3.1 One outcome and one writer

Implement the complete Track 1.1 increment for Borrow Better and Money Value, including necessary event contracts, UI, tests and documentation, as ONE vertical outcome.

You are the sole implementation agent. Do not spawn sub-agents, delegate subtasks, launch other agents or create parallel agent runs. Do not create separate backend, frontend, QA, documentation or checkpoint tasks, branches, worktrees or PRs. You may use ordinary tools and the repository's required CI; those are not additional agent tasks. Respect mandatory platform checks and branch protections; do not disable them to satisfy this workflow.

Keep all feedback/retries/fixes on this same branch and PR. If a cloud runner is recreated by the platform, recover from the saved remote branch/PR; never promise environment persistence or create a second feature variant. If the platform cannot continue the same branch, report that capability constraint rather than bypassing it with another parallel task.

### 3.2 Canonical baseline and branch selection

Repository: `agrodhara/SUTRIVA`.
Durable integration target: `copilot/copilotalpha50-reconciliation-final`.
Do not write feature commits directly to that branch, main, or an old source branch.

Read repository/agent instructions and inspect git remotes, status, branches, PRs and current task metadata before mutations. Fetch the remote integration branch. Record its full SHA; historical `cd6d803` is not an instruction to use that revision. (This verification pass independently confirmed `cd6d80368ee89a2deb13764bf2394372aaed13a4` as current on 2026-09-13 — see Section 1.1 and 1.4 — but Codex must re-fetch at its own start of work, not reuse this timestamp's value unchecked.)

Before new work, confirm baseline closeout has finished and no other agent is still writing the baseline or this feature. Do not start the feature merely because an agent task says Completed. Compare the remote commits and required baseline results.

Reuse an existing Track 1.1 issue/branch/PR if it is the same intended outcome and based on this integration line. If a suitable PR exists, continue it; do not open a duplicate. If only an unrelated task exists, do not repurpose its branch. (Verified: none exists — see Section 1.1.)

If no Track 1.1 task branch exists, create exactly one from the latest verified integration SHA. Preferred name: `task/<actual-issue-number>-track1-1`. If the platform already created one mandatory agent branch, use that ONE branch instead of creating a second branch to satisfy naming. Confirm ancestry and PR base. If it was created from the wrong baseline and contains substantive work, do not silently reset/rebase/cherry-pick it: report the commits and minimal recovery needed before coding. Do not fabricate issue IDs or force operations around platform branch restrictions.

GitHub issue title: "Track 1.1 — personalised reveal, intent and closure". Create or reuse one issue for the whole increment if authorised tools allow it. PR base must be the durable integration branch, not main. If issue/PR APIs are unavailable, retain work safely and provide exact local branch/SHA and ready-to-use issue/PR text; do not claim external creation succeeded or launch another agent to obtain access.

### 3.3 Baseline check and scope gate

Confirm clean task working tree and intended starting SHA before feature edits. Inspect and preserve unrelated changes; never stash, reset, delete or commit someone else's work just to make the tree look clean.

Use existing CI evidence for the same starting SHA when complete and relevant; otherwise run documented baseline checks once. If baseline fails, identify whether it is an environment limitation or an existing defect. Report material failures that prevent validating this feature; do not hide them, bypass mandatory gates or expand into unrelated repair work.

Before editing, report base branch/SHA, task branch/HEAD, issue/PR identifiers, intended files, route/data/event mapping and baseline results. Then proceed autonomously when valid. This is a progress report, not a routine request for permission.

### 3.4 Work sequentially inside this same branch

1. Verify the reported response fields and current design system; inspect duplicate continuation mechanisms.
2. Update the canonical event contract and meaningful validation/service tests, preserving compatibility.
3. Implement both journeys with shared components/state logic where natural; no separate competing implementation.
4. Validate navigation, financial-result provenance, event behaviour, responsive layouts and regressions.
5. Record the scope/decisions and handoff in existing repository documentation.

Do not open a new task after each step. Do not create foundation/configuration work unless a specific dependency is necessary for this feature. Do not add new tooling or infrastructure to manage the workflow.

### 3.5 Durable coordination without extra branches

Update `docs/decision_log.md` (or the actual canonical equivalent) with this increment's scope and material decisions. Update the repository's existing agent-instruction file with a concise "single writer; one branch/PR per vertical outcome; resume existing PR for fixes; verify current integration baseline" rule, preserving unrelated instructions. Do not create several competing instruction files or override security/approval requirements. (Per change ledger 2.1: no such file currently exists — create one minimal file rather than searching further.)

Keep the complete handoff in the one issue/PR and existing execution notes, not scattered local folders. Record starting integration SHA, current feature branch, actual commit SHAs, checks and remaining blockers. Do not embed a commit's own SHA in that same commit and chase changing hashes; final SHA belongs in the PR/task report after commit.

If the session runs out of time/credits: preserve completed changes, push only if authorised, record exact progress and resume instructions on the SAME work item. Distinguish incomplete checkpoints from merge-ready work. No automatic new issue, branch, task or agent; no budget changes.

### 3.6 Final verification and integration boundary

Before declaring merge-ready, fetch integration again and compare it with the recorded starting SHA. If it moved, inspect the actual intervening commits. For non-overlapping changes, update the SAME feature branch using the repository's allowed non-destructive merge workflow and rerun affected gates; do not create another branch. For overlapping work/conflicts, suspend new feature additions, resolve only when canonical behaviour is clear from the frozen contract, and test that resolution. If the intended behaviour is genuinely ambiguous, report that exact conflict. Never resolve by blindly taking ours/theirs or force-pushing shared history. (This is the check that directly covers the possible concurrent-writer activity noted in Section 1.4 — it must not be skipped.)

Run the required regression/typecheck/build and targeted acceptance gates once at final candidate, repeating only to verify changed code or a specific unresolved risk. No empty checkpoint commit and no separate "create checkpoint" agent task.

Create/update ONE PR into `copilot/copilotalpha50-reconciliation-final`, linked to the one issue. Finish with:
- task/issue/PR links;
- base branch and initial full SHA;
- final fetched integration SHA;
- feature branch and full final HEAD SHA;
- changed files and behaviour;
- commands/results, screenshot evidence when available;
- deliberate limitations;
- READY FOR REVIEW or BLOCKED with exact reason.

Do not merge a PR into integration/main, enable auto-merge, deploy, delete branches or close unrelated PRs under this instruction. After review, integration is ONE subsequent merge of this PR, followed by verification of the resulting integration SHA. Cleanup happens only after integration is confirmed. Do not use manual copying or cherry-picking as the default alternative to that merge.

Product specification follows. It is part of THIS task, not another task to launch.

---

## 4. Sutriva Track 1.1 — Final Codex implementation prompt

*(Reproduced in full from `Sutriva_Track_1_1_Single_Agent_Master.md`, unchanged. Version: 13 September 2026, reconciled after Claude's repository review.)*

### 4.1 Assignment, evidence and authority

Implement both journeys through completion and verify the change. Do not restart product research or request another routine design approval. Follow repository instructions, preserve unrelated work, and inspect the active branch before editing. Do not deploy, merge a PR into the integration branch or send person-directed messages under this instruction. Bringing verified integration changes into this task branch is allowed only under the execution policy above. Creating or updating the one authorised repository issue/PR and its task-status documentation is allowed by the execution policy above.

Claude reports inspecting `~/SUTRIVA`, branch `copilot/copilotalpha50-reconciliation-final`, HEAD `cd6d803`. The author of THIS reconciliation has inspected Claude's response, not independently inspected that repository. Confirm the current checkout, HEAD, types, functions and tokens before relying on the reported findings; do not reset to an old revision or overwrite newer work. (This handover's own verification pass, Section 1.1, independently re-confirmed that HEAD value via a fresh fetch on 2026-09-13 — this still does not substitute for Codex's own re-check at its own start of work.)

Reported mappings to confirm:
- Borrow route: `apps/pwa/app/borrow-better/page.tsx`; event journey `comfortable_borrowing`.
- Money Value route: `apps/pwa/app/money-value/page.tsx`; event journey `money_value`.
- Borrow response: `commitment_ratio`, `comfort_status`, reason codes and next-best-action fields; no backend lump-sum comfortable borrowing amount. Reuse existing `percent()` and `borrowingStatusLabels`; verify exports/location in `components/QuickCheckUI.tsx`.
- Money Value response: `estimated_net_annual_value`, formatted through existing `currency()`.
- Events: `apps/pwa/lib/api.ts`, `services/api/app/models/product_event.py`, `services/api/app/services/product_events.py`, and router `services/api/app/routers/product_events.py`. Preserve `decision_context` and its existing `local_demo` use. Add dedicated optional intent/reason fields as specified below.
- Duplicate continuation surfaces: inline `FutureInterestCapture` and `/go-deeper`. Audit all usages. Replace the old inline ASK with one explicit entry CTA, not an automatically displayed new screen. Keep legacy `/go-deeper` as a lightweight redirect to the recognised journey's current page, otherwise `/`; no financial data in the redirect, no go-deeper event on redirect. Retire the obsolete component/CSS only if unused. Do not delete externally bookmarkable URLs simply because internal search finds no link.
- Real design tokens reportedly use Inter, #f7f7f3 background, #171717 ink, #16794f green, 28px cards and pill buttons. Preserve the responsive web shell; do not introduce app chrome or constrain the existing desktop page to a phone width.

Authority: this document freezes product interactions/copy/scope; actual repository types and design system govern technical mapping/style; V2 images illustrate hierarchy only. V3 Blueprint remains strategic context if supplied. Report concrete conflicts rather than inventing code facts. Rewards is an alias; use the current Money Value product name consistently.

### 4.2 Fixed scope and full continuity

Both journeys:
1 Landing → 2 Quick Check → 3 Result → 4 What-if: CURRENT, preserve.
5 Personalised Reveal → 6 Intent → 7 Closure: BUILD NOW.
7 includes its optional decline-reason and terminal states; these are not additional questionnaire screens.
Alpha 50 STOPS at the terminal state. No live CTA enters Track 2.

Future Borrow Better only: OTP → consent → bureau → confirm obligations → verified readiness.
Future Money Value only: OTP → explicit upload permission/data-use explanation → statement upload → confirm parsed data → actual card analysis.
These are conceptual future dependencies, not fully designed or implementation-ready screens. Do not collapse Borrow's consent and bureau stages into a single claim that data is already verified. No future stage is implemented now.

Landing retains TWO equal entry cards throughout Alpha 50. This is qualitative learning with approximately 50 people; no statistically conclusive demand, conversion or market claims.

Core value exchange: show the useful existing answer and explain its limits before asking which next answer is valuable. One intent question; one use-intent decision; at most one optional reason after an explicit decline. No free-text field.

Important interpretation: "I'd use this when available" is stated future-use intent, not actual data-sharing behaviour, consent, a completed verification, a lead or a waitlist signup. The selected intent adds context; neither proves the user will upload a statement or approve bureau access.

### 4.3 Exact copy and display rules — Borrow Better

**B5: Personalised Reveal**
Header: existing responsive web shell. Back link is "← Back to what-if" for a What-if entry and "← Back to my estimate" for a Result entry. Do not add native-app chrome.
H1: "Your answer is based on what you told us"
Hero label: "YOUR ESTIMATE"
Hero: show the exact existing `borrowingStatusLabels[result.comfort_status]` as the lead status, then `percent(result.commitment_ratio)` with label "Commitment-to-income ratio". For a scenario, label the hero "YOUR WHAT-IF ESTIMATE". No principal/lakhs figure. Verify whether the ratio includes the proposed new commitment by reading the existing calculation; if so add "Includes the proposed borrowing." beneath it. Do not describe a scenario-inclusive ratio as already committed income. Preserve existing mapped reasons and result qualifiers; never render raw reason-code strings to the user.
Body: "Loans, card balances or other commitments not included here could change this picture."
Small bridge panel label: "With your actual obligations"
Bridge text: "Check whether the same answer still holds."
Primary CTA: "See what I could check next" → B6.
No other promotional CTA, input or data-access control.
Emotion: the answer remains useful and its limitations are clear; avoid deliberately undermining trust.

For zero, unavailable or non-positive borrowing outcomes: preserve the backend's actual status and explanatory text; never pair them with "comfortable" or imply approval. A ratio of zero is valid if the service returned it; never replace zero using a truthiness fallback. If no displayable result exists, use the recovery state in section 4.7.

**B6: Intent**
H1: "What would be most useful next?"
Card A title: "My actual obligations"
Card A body: "Check whether the loans and cards I already have change this result."
Card A enum: `actual_obligations`
Card B title: "How I could improve this"
Card B body: "Show me what could strengthen my borrowing position."
Card B enum: `improve_readiness`
Skip link: "I'm only exploring for now" → neutral terminal state; bypass B7's question, not a No response.
Each card is one button. Tap immediately opens the matching B7 preview. No radio plus Continue combination. No selection prerequisite, automatic default, extra question or preselected intent.

**B7: Closure — intent-specific preview**
Badge: "Possible next step"
H1: "Here's what you could check next"
For `actual_obligations`, show exactly three rows:
- "Your loans and card commitments"
- "How they affect your borrowing estimate"
- "Details to check before you borrow"

For `improve_readiness`, show exactly three rows:
- "Which commitments affect your estimate"
- "Changes that could improve your position"
- "What to review before applying"

Disclosure: "This isn't available yet. A future check would need your permission to access credit information. Nothing is accessed here."
Question: "Would you use this?"
Primary: "I'd use this when available" → Yes terminal.
Secondary: "Not for me right now" → optional reason state.
No guarantee of improved eligibility, lender approval or exhaustive bureau coverage.

Optional reason state, within screen 7:
H1: "What's the main reason?"
Helper: "Optional — choose one, or finish without answering."
Buttons and exact enums:
- "I don't need it now" → `not_needed_now`
- "I'd need to trust the data access" → `trust_data_access`
- "The current answer is enough" → `current_answer_enough`
- "Something else" → `other`

Primary exit: "Finish" → No terminal, without a reason event.
Reason tap → No terminal immediately. No text entry on Other.

### 4.4 Exact copy and display rules — Money Value

**M5: Personalised Reveal**
Header as existing. Use the same entry-dependent Back link as B5.
H1: "Your estimate is only part of the story"
Hero label: "YOUR ESTIMATE" or "YOUR WHAT-IF ESTIMATE" under the same scenario rule.
Hero: reuse `currency(result.estimated_net_annual_value)` with the annual unit, after confirming the reported field and formatter. ₹5,600/year is ONLY a visual fixture.
Hero caption: "Estimated net annual card value" only if the existing service actually returns a NET ANNUAL metric. Otherwise preserve its exact metric name and period; flag the mismatch before implementation. Do not subtract fees or annualise in the frontend.
Body: "Your statement could help check rewards, fees and interest, and show where your spending went."
Small bridge panel label: "With your actual statement"
Bridge text: "Compare the estimate with recorded card activity."
Primary CTA: "See what I could check next" → M6.
Preserve negative signs and zero; never turn negative net value into "savings" or positive rewards. Avoid implying all reward redemptions or fees are available from one statement.

**M6: Intent**
H1: "What would be most useful next?"
Card A title: "What my card is actually worth"
Card A body: "Use my statement to compare rewards, fees and interest."
Card A enum: `actual_card_value`
Card B title: "Where my spending is going"
Card B body: "Show me the categories and patterns behind my card use."
Card B enum: `spend_understanding`
Skip: "I'm only exploring for now" → neutral terminal.
Same direct-tap interaction as Borrow. No cashback/miles/card-shopping submenus.

**M7: Closure — intent-specific preview**
Badge: "Possible next step"
H1: "Here's what you could check next"
For `actual_card_value`, show:
- "Rewards recorded on your statement"
- "Fees and interest reducing that value"
- "How this compares with your estimate"

For `spend_understanding`, show:
- "Your spending by category"
- "Recurring payments on your card"
- "Patterns across the period provided"

Disclosure: "This isn't available yet. A future check would need a statement you choose to share. Nothing is uploaded here."
Question: "Would you use this?"
Primary: "I'd use this when available" → Yes terminal.
Secondary: "Not for me right now" → optional reason state.

Optional reason state:
H1: "What's the main reason?"
Helper: "Optional — choose one, or finish without answering."
- "The estimate is enough" → `current_answer_enough`
- "I wouldn't share a statement" → `statement_sharing_declined`
- "This isn't useful to me" → `not_useful`
- "Something else" → `other`

Exit: "Finish" → No terminal. Reason tap → No terminal. No free text.

### 4.5 Shared terminal states — screen 7 variants

Yes: H1 "Thanks for letting us know"
Body: "This helps us understand what to build next. You haven't signed up or shared any additional financial data."

No, whether reason supplied or skipped: H1 "Thanks for the feedback"
Body: "You can keep exploring with the estimate you already have."

Intent skipped: H1 "Explore at your own pace"
Body: "You can return to your estimate whenever you're ready in this session."

All terminal states:
Primary "Back to my estimate" → existing Result screen for this journey.
Secondary text link "Back to home" → existing landing.
Keep prior What-if edits in existing in-memory state where supported; the Result link must not overwrite original result with the scenario. Do not manufacture a scenario-switching feature. The existing Result/What-if navigation remains the way to revisit the scenario.
No notification promise, subscription, success confetti, consent checkbox or future-feature button. Plain, respectful end state.

### 4.6 UI specification — implementable defaults

The PNGs specify composition, not a new brand. Reuse actual typography, colours, buttons, header, spacing primitives and radii wherever present. Do not add a font dependency or wholesale CSS rewrite. If a component token is absent, use these defaults; report substitutions explicitly rather than mixing systems.

Mobile target: 390 × 844 CSS px; verify also 375 and 430 widths, 667px height and 200% text scaling. Desktop: preserve the existing responsive `.shell` and `.journey` widths (reported 980px and 820px maxima); do not force a new 430px phone column. All content must reflow without horizontal scrolling.

Proposed missing-token defaults: page background #f7f7f3; primary text #171717; secondary text #40403a; green primary #16794f with white text; neutral borders #d9d7cc; restrained indigo #4456A6; pale indigo preview #F0F2FA. Validate rendered contrast; live accessible tokens take precedence. Use indigo only for preview accents/icons, keep the green primary CTA. No full palette switch. Colour alone never communicates a state.

390px geometry: 20px left/right content padding; 350px content width; existing header approximately 56px high; 24px between header and title; 24px between major blocks; 12px between intent cards; 8px between associated label/body items. Safe-area bottom padding at least 20px. All actionable targets at least 44 × 44px. Primary buttons min-height 48px; use existing pill radius (reported 999px); cards use existing 28px radius and 1px neutral border. No decorative shadows unless the current system uses them.

Typography defaults using existing font: H1 26px/32px, weight 600; body 16px/24px; card title 17px/23px, weight 600; secondary copy 14px/21px; hero value 34px/42px, weight 600; CTA 16px/22px, weight 600. Permit wrapping and growth; no forced single-line subtitles, ellipsis or fixed card heights. Large amounts may wrap with their units; use existing currency formatter, not a new numerical conversion.

Screen 5 order: header/back → H1 → result hero card → body → small bridge panel → primary CTA. No form controls, loading animation, fabricated uncertainty interval or side-by-side "verified result" containing invented numbers. At 390 × 844, H1, value, caveat and CTA should be visible without scrolling under normal text settings. At smaller heights or larger text, allow natural vertical scrolling; do not hide explanatory copy to fit.

Screen 6 order: header/back → H1 → two stacked compact cards → subordinate skip link. Cards min-height about 108px, grow with copy. Each has optional 20px neutral outline icon, title/body column and trailing chevron. Whole card is a native button with readable accessible name; decorative icons hidden from screen readers. Text may wrap over 2–3 lines. No illustration, question counter, required-field marker or survey progress bar. At normal target size, both cards and Skip visible above fold.

Screen 7 order: header/back → future badge → H1 → three benefit rows in one pale preview panel → explicit availability/data-access disclosure → subtle divider → question → filled Yes button → outline No button. Benefit rows use neutral outline icons or bullets; do not use completed checkmarks suggesting analysis has happened. At target size, both choices and the disclosure should be visible; prefer concise spacing over smaller text. Buttons stay in normal document flow, no sticky footer obscuring content.

Decline: replace closure body inline with reason state; do not use a modal or bottom sheet. Four full-width, compact text buttons, min-height 48px, 8px gaps; Finish stays visible and enabled. No colourful chips with implicit multi-select. Terminal: same header and one concise message with two return actions.

Back labels: Intent "← Back to reveal"; Closure "← Back to choices"; decline reasons "← Back to preview"; terminal "← Back to my estimate". Back is the existing `.backLink` text-link pattern; do not add a separate app header icon or duplicate in-page Back action. Preserve visible focus rings, keyboard activation, logical tab order, one H1 per screen and focus the new H1 after navigation. Announce non-navigation state changes politely. Respect reduced motion; no mandatory transitions or spinners. Press feedback may use existing 100–150ms transition. No auto-advance except deliberate intent/reason selection.

The words CURRENT, BUILD NOW, FUTURE, Alpha 50, Track 1.1, screen IDs and example-data badges belong to reference annotations only, never consumer UI.

### 4.7 State, navigation and data contract

Model states explicitly: reveal → intent → closure(intent) → yes_terminal OR decline_reason → no_terminal. intent → skip_terminal. Terminal states belong to the same increment and do not increase questionnaire length.

Entry: at the current inline FutureInterestCapture location, replace its old interest question/actions with ONE "See what I could check next" button. Preserve current Result/What-if display and controls until this button is tapped. Tap opens Reveal as an in-place step. Do not automatically mount the Reveal as a second long form below Result or automatically hide the result after calculation. Keep the existing Result path available; What-if remains optional. The Reveal itself has the same continuation CTA to Intent. No additional entry event: teaser_viewed records actual Reveal visibility, teaser_cta_selected only the Reveal-to-Intent tap.

Value provenance: preserve separate transient references for the original response and last successful What-if response if the current component overwrites one `result`. This is state management, not financial calculation. Use the last successfully returned backend result actually displayed on the source screen. For successful What-if, use that scenario response, not the original input estimate. For untouched What-if or existing Result entry, use the existing original response. If pending or failed What-if inputs differ from the last successful response, do not silently portray the old answer as current: require the existing successful calculation path before continuing. Reuse approved formatter/status components and qualifiers. Formatting is allowed; financial arithmetic, annualisation, affordability rules, interpolation and derived savings are not.

Codex must document exact source endpoint, response property, result variant, formatter, and null/status handling for each hero. Do not supply invented backend field names in your frozen output.

Back: Reveal returns to actual entry screen; Intent returns to Reveal; unsubmitted Closure returns to Intent; decline reason Back returns to Closure and does not retract the historical No event. Terminal header Back returns to the matching Result, same as primary action. In-place React state alone is insufficient for browser Back. Integrate with existing history handling or add minimal history entries for the continuation steps with a namespaced, non-financial marker (journey and step only). Never put inputs, response objects, ratio, amount, intent or reason in history state/URLs. Handle popstate and remove listeners on cleanup. Browser Back/Forward restores reachable steps using transient state; never re-emits action events. An unavailable selection routes to Intent; missing result routes to recovery. No redirect loop. On terminal Return-to-result, use a guarded history transition so Back cannot silently submit or reopen an already submitted answer; revisiting Closure via an explicit fresh continuation is permitted. If user revisits and intentionally answers again, this is a new response event, not a rendering duplicate.

Refresh/deep link: a plain journey URL without a continuation marker opens its normal Quick Check. A reload with a recognised non-financial continuation history marker but no result shows recovery. Retain whatever existing approved state restoration the app already has; do not add financial data to localStorage, sessionStorage, URLs, logs or analytics. If a valid result is still available, render the reachable screen; if intent is missing on Closure, route to Intent. If result context is missing, show recovery H1 "Let's start with your estimate", body "Your previous estimate isn't available in this session." Primary "Start a quick check" → that journey's existing Quick Check; secondary "Back to home". No fake sample data. Browser refresh may lose transient state; state this limitation rather than introducing sensitive persistence.

Intent state is transient and journey-scoped; switching journeys clears that journey selection from the current continuation. Back preserves a choice for display if present but does not auto-submit it. Disable repeated taps synchronously during navigation. Never disable progression waiting on analytics.

Analytics submission failure: proceed normally, use existing bounded transport policy only; no toast that makes the customer think a financial operation failed, no new financial-data retry queue. Distinguish a locally captured intent from successfully received analytics; do not promise feedback was permanently saved.

### 4.8 Minimal instrumentation — preserve existing context, add typed payloads

Verify the actual flat `/v1/events` schema. Keep all existing event types and compatible old call sites. Add six event types: teaser_viewed, teaser_cta_selected, next_interest_viewed, next_interest_selected, next_interest_skipped, decline_reason_selected. Reuse go_deeper_selected and go_deeper_declined only for final Yes/No on the new flow. Preserve `decision_context` and the existing local_demo transport value; do not put intent/reason there or globally change arbitrary existing fields.

Add optional typed `intent` and `reason` to request, response, frontend helper and recording service. Verify the existing recording sink really retains both fields without adding a database. Do not blindly replace whole model classes with a partial example. Preserve existing identifiers, timestamps and approved transport fields. Use existing Pydantic conventions for cross-field validation.

| Event | Trigger | intent | reason |
|---|---|---|---|
| teaser_viewed | Reveal becomes visible | absent | absent |
| teaser_cta_selected | Reveal primary tap | absent | absent |
| next_interest_viewed | Intent becomes visible | absent | absent |
| next_interest_selected | Intent card tap | required | absent |
| next_interest_skipped | Intent skip | absent | absent |
| go_deeper_selected | Closure Yes | required for new client flow | absent |
| go_deeper_declined | Closure No | required for new client flow | absent |
| decline_reason_selected | Optional reason tap | required | required |

Journeys: comfortable_borrowing, money_value.
Borrow intents: actual_obligations, improve_readiness.
Money Value intents: actual_card_value, spend_understanding.
Borrow reasons: not_needed_now, trust_data_access, current_answer_enough, other.
Money Value reasons: current_answer_enough, statement_sharing_declined, not_useful, other.

Enforce combinations at the API, not only TS union membership: reject wrong-journey intents/reasons; reason on unrelated events; missing intent on next_interest_selected or decline_reason_selected; missing reason on decline_reason_selected. For legacy go_deeper_selected/declined requests, intent may remain absent for backward compatibility; NEW UI tests must require it. Unrelated existing event types must not acquire intent/reason payloads. Test null/omitted handling explicitly under the current model conventions.

Views once per visible screen entry, never per rerender. Deliberate revisit may produce a new view. Double-click lock prevents duplicate action emissions and navigation; transport exactly-once delivery is not promised. Existing best-effort transport must not block progression. No new retry queue.

Only approved fields; no input/result values, PII, full URLs, financial objects, raw free text or arbitrary object spreads. Do not echo invalid request contents in application logs. Preserve current context compatibility rather than presenting its pre-existing free-string field as newly privacy-validated. Scope any existing logging defect separately if found.

Retire duplicate old emitters on replaced UI. Record the release commit/date boundary. Historical go_deeper rows may lack intent; don't combine pre/post funnel rates as if the meaning were unchanged. Preserve approved anonymous correlation only if already supported; never invent identities. A missing reason event means no reason recorded, not proven deliberate skipping. Yes measures stated future use, not consent or verified data sharing. No new waitlist, early-access, terminal-view or reason-skipped events.

### 4.9 Hard exclusions

No OTP, authentication, account creation, contact capture, PAN, bureau/CIBIL integration, consent UI, AA, bank APIs, upload control (including disabled placeholders), lender API, loan offers, loan comparison, refinancing, application flow, card recommendation database, cashback/miles engine, offer database, LLM, LangGraph, chatbot, AI persona, new database, new sensitive persistence or frontend financial calculations. Future disclosure text is allowed; future functional UI is not. Do not add full Track 2 routes or stubs just because future stages appear below the PNG's stop line.

Remove from earlier drafts: cashback/miles preview promise; generic card-economics jargon where simpler copy exists; fixed comfortable result labels; one generic closure preview regardless of intent; contact/notification promises; implicit No on Skip; and forced one-line card subtitles.

### 4.10 Required verification and acceptance

Freeze testable outcomes, not cosmetic promises:
- Both complete current journeys remain functional; two equal landing cards remain.
- Reveal uses the correct backend response for original and successful What-if contexts; zero, negative Money Value, caution/negative Borrow, missing result, pending and failed scenario cases are correct.
- No hardcoded fixture financial values or new frontend financial calculations ship; no unsupported Borrow principal figure or misleading scenario-ratio caption.
- Four intent choices produce four matching preview variants; Skip bypasses use-intent question and emits no No.
- Yes, No, all eight journey-specific reason buttons and reason-free Finish have explicit terminal outcomes.
- Back, browser Back, refresh, missing context and cross-journey navigation behave as specified.
- Tap lock prevents rapid duplicate transitions. View events do not multiply on rerender. Event failure never blocks customer flow.
- Contract validates cross-field event/journey/intent/reason combinations and legacy optional-field compatibility; event payloads contain only approved fields. No PII/value leakage through URL or new persistence.
- Inspect 375/390/430px, short viewport, long values, keyboard/focus, 200% text and reduced motion; no overflow, clipping or hidden disclosure/actions.
- No Track 2 controls, routes, integration, dependency or placeholder is introduced.

Codex implementation handoff must require: inspect current branch and instructions; identify actual files/routes/shared components; decide reuse/replace/redirect for current go-deeper route; map data and events; implement one cohesive change; run relevant existing backend/decision-engine regression gates, event validation, TypeScript and production build plus targeted navigation/responsive checks. Do not invent successful test output. If a required test cannot run, report why. No deployment or external messages requested by this implementation prompt. One intended commit, if repository policy permits: `feat: add alpha50 track1.1 intent discovery flow`.

### 4.11 Implementation delivery

Before editing, briefly report current branch/HEAD, actual components/routes, data field/formatter mapping, event changes and the legacy-route/history approach. Then implement; do not stop at a plan when authorised work can continue. Preserve user changes and repository instructions.

Do not silently omit existing result qualifiers. The review reports guidance_disclaimer returned by backend but not currently typed/rendered. Verify its meaning: preserve anything already displayed and add no new legal claim; report a material conflict between required backend guidance and new reveal copy before claiming correctness. This does not authorise a broad disclaimer/UI project.

Run relevant existing API and decision-engine regression gates, targeted cross-field event/service tests, frontend typecheck/build, and meaningful interaction tests covering scenario provenance, optional branches and navigation. Inspect responsive rendering at the specified widths and 200% text. Do not add tests that simply duplicate static copy; test the behavioural risks. Report every required check as passed, failed or not run with reason.

Finish with: change summary; actual final commit SHA if committed under repository policy; changed files; validation evidence; deliberate limitations. Show the new screens with actual app styling if screenshot tooling is available. Do not claim deployment or real-user validation. Use meaningful buildable commits on the SAME task branch, with one cohesive PR; do not create empty checkpoint commits. Suggested feature commit: `feat: add alpha50 track1.1 intent discovery flow`.

Product architecture is frozen. Resolve confirmed repository details without another product-review cycle; escalate only a real incompatibility or missing access that prevents correct implementation.

---

## 5. Genuine blockers for Codex to resolve before/while starting (not guessed here)

1. **Re-confirm the integration SHA at the actual moment of starting work**, and specifically re-check whether the "Copilot cloud agent" runs seen against `copilot/copilotalpha50-reconciliation-final` on 2026-09-13 (Section 1.4) landed any new commits. If they did, follow master Section 3.6's non-destructive comparison procedure — do not assume `cd6d80368ee89a2deb13764bf2394372aaed13a4` is still HEAD without checking.
2. **Confirm actual CI pass/fail for the starting SHA** (Section 1.3) before treating baseline checks as already satisfied.
3. **Confirm whether a repository agent-instruction file exists** by the time Codex starts (Section 2.1); create one only if genuinely absent.

None of these are product-decision blockers — they are standard pre-flight checks the master file already requires, surfaced explicitly so Codex performs them first rather than assuming this handover's snapshot is still current.
