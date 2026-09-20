# SUTRIVA Delivery and Release Gate

Pre-merge and release control standard. It applies to every bounded task.
`ROADMAP.md` ranks it as the control standard; it does not set sequencing.

Derived from the candidate 100-point checklist reviewed on 2026-09-20. All of
that checklist's controls are kept, regrouped by who is responsible for them and
tagged by how they are enforced today.

## How to use this gate

Give every applicable control one status: **PASS**, **FAIL**, **N/A** or
**NOT VERIFIED**.

- Every PASS cites evidence: command output, file or diff, PR check, screenshot,
  browser trace or deployed URL.
- Every N/A states a reason.
- A critical FAIL or NOT VERIFIED blocks release (see *Mandatory stop rules*).
- Journey modules (section J) apply only to the journeys a task touches.

### Enforcement labels

| Label | Meaning |
|---|---|
| **[CI]** | Enforced automatically by a CI job or by GitHub branch protection. Passing is visible on the PR. |
| **[MANUAL]** | Not automated. The owner supplies evidence in the PR or handoff and the reviewer checks it. |
| **[NOT YET ENFORCED]** | Needs tooling that does not exist yet. Until it does, the owner supplies evidence as for [MANUAL], and the gap is recorded in the handoff. |

### Enforcement snapshot (verified 2026-09-20)

| Mechanism | State |
|---|---|
| CI job `python-tests` | Runs on a PostgreSQL 16 service: `alembic upgrade head`, decision-engine tests, learning-engine tests and API tests. Required status check. |
| CI job `frontend-quality` | Added in [PR #11](https://github.com/agrodhara/SUTRIVA/pull/11) (2026-09-20). Runs from `apps/pwa` on Node 20: `npm ci`, `npm test`, `npm run lint`, `npx --no-install tsc --noEmit` and `npm run build`. Required status check. |
| Branch protection on `main` | Pull request required. Required status checks are `python-tests` and `frontend-quality`, and the branch must be up to date. Conversation resolution required. Force-push and deletion blocked. Applies to administrators. Required approving reviews: 0. |
| Frontend lint, typecheck, unit tests, production build | Enforced by `frontend-quality` since PR #11 (2026-09-20). |
| Browser or end-to-end tests | None in the repository. |
| Secret scanning | Not verified. |

Update this table whenever CI or branch protection changes.

## Controlled ownership

Concurrent work is allowed. It must not overwrite anyone's work.

- Each task has one named owner (the maker). The checker or reviewer is a
  different person or agent. An architect role may hold decisions and scope.
- Each concurrent task uses its own isolated git worktree or clone. Two writers
  never share one working tree.
- Concurrent tasks declare non-overlapping file scopes before work starts.
  Overlaps are resolved first, not at merge time.
- Another author's open PR or branch touching the same area is reconciled, or
  closed as superseded with a recorded reason, before new work starts.
- Uncommitted or untracked files in any checkout are preserved. Classifying a
  file as obsolete does not authorise deleting, resetting, cleaning or stashing
  it.

---

## U. Universal pre-merge controls

### U-A. Ownership and scope

| ID | Control | Enforcement |
|---|---|---|
| U1 | Repository path and remote (`agrodhara/SUTRIVA`) are recorded. | [MANUAL] |
| U2 | Git and GitHub identity are verified without exposing credentials. | [MANUAL] |
| U3 | The task outcome is stated in one sentence. | [MANUAL] |
| U4 | The authoritative specification and its version are identified. | [MANUAL] |
| U5 | The task is linked to one issue or equivalent tracked outcome. | [MANUAL] |
| U6 | In-scope and out-of-scope functionality are both enumerated. | [MANUAL] |
| U7 | The task has one named owner, and the checker is not the maker. | [MANUAL] |
| U8 | Each concurrent task has its own isolated worktree or clone. | [MANUAL] |
| U9 | Concurrent tasks have declared, non-overlapping file scopes. | [MANUAL] |
| U10 | Competing PRs or branches on the same area are reconciled or closed with a reason. | [MANUAL] |

### U-B. Git baseline and change hygiene

| ID | Control | Enforcement |
|---|---|---|
| U11 | Branch, base branch, and starting local and remote SHAs are recorded. | [MANUAL] |
| U12 | The local base is confirmed to derive from the intended integration SHA. | [MANUAL] |
| U13 | Working-tree status is captured before editing. Pre-existing modified and untracked files are inventoried and preserved. | [MANUAL] |
| U14 | No work lands directly on `main`. | [CI] (pull request required) |
| U15 | No unrelated files are in the task diff. | [MANUAL] |
| U16 | No force push, destructive reset or unexplained history rewrite. | [CI] on `main`; [MANUAL] elsewhere |
| U17 | Both required checks, `python-tests` and `frontend-quality`, pass and the branch is up to date with `main`. | [CI] |
| U18 | All review conversations are resolved. | [CI] |

### U-C. Documentation and handoff

| ID | Control | Enforcement |
|---|---|---|
| U19 | Architecture and contract decisions are recorded in `docs/` and dated in `docs/decision_log.md`. | [MANUAL] |
| U20 | Secrets and credentials are absent from code, commits, screenshots and logs. | [MANUAL] |
| U21 | Only reviewed files are staged. The commit SHA is pushed, and the local, remote and PR-head SHAs match. The PR diff and checks are reviewed. | [MANUAL] |
| U22 | The final handoff uses the summary format below and lists every FAIL and NOT VERIFIED item. | [MANUAL] |

---

## B. Backend and data controls

| ID | Control | Enforcement |
|---|---|---|
| B1 | The canonical backend route or service is identified before adding another. | [MANUAL] |
| B2 | No duplicate calculator, service, event path or legacy parallel implementation is introduced. | [MANUAL] |
| B3 | API changes are additive and backward-compatible unless a breaking change is explicitly approved. | [MANUAL] |
| B4 | Request and response fields have defined units, periods and missing-value semantics. | [MANUAL] |
| B5 | Unknown, blank and confirmed zero are represented distinctly where financially material. | [MANUAL] |
| B6 | Backend validation is the source of truth for financial inputs. | [MANUAL] |
| B7 | Calculation formulas and assumptions are verified from source, not inferred from UI copy. | [MANUAL] |
| B8 | Monthly, quarterly and yearly annualisation is correct and disclosed. | [MANUAL] |
| B9 | Existing decision-engine, learning-engine and API tests pass. The exact command and counts are recorded. | [CI] |
| B10 | New or changed behaviour has tests, including missing, negative and zero values. | [MANUAL] |
| B11 | Migrations upgrade to head, and downgrade and re-upgrade cleanly. | [CI] |
| B12 | Database tests run against PostgreSQL, not a substitute. | [CI] |
| B13 | Event names and controlled enumerations are the approved set. | [CI] for existing types; [MANUAL] for new ones |
| B14 | Event and audit payloads contain no raw financial values, rates, balances, PII or free text. | [CI] for existing redaction and sensitive-field tests; [MANUAL] for new fields |
| B15 | Application and deployment logs do not expose request bodies or sensitive values. | [MANUAL] |
| B16 | CORS is restricted to the exact intended frontend origins, and state-changing cookie-authenticated routes validate origin. | [CI] |
| B17 | Anonymous sessions keep a fixed absolute expiry with no sliding extension, and rotation stays dormant unless the task explicitly changes it. | [CI] |
| B18 | Event persistence failure does not block customer progression, and the response status truthfully reports persisted versus not persisted. | [CI] |
| B19 | Feature flags in `shared/track11_config.json` are unchanged unless the task is to change them. | [MANUAL] |
| B20 | Any deployment has a defined production origin, health check and rollback. | [MANUAL] |

---

## F. Frontend and browser controls

### F-A. Build and correctness

| ID | Control | Enforcement |
|---|---|---|
| F1 | The canonical frontend route or component is identified before adding another. | [MANUAL] |
| F2 | The frontend does not duplicate financial calculations owned by the backend. | [MANUAL] |
| F3 | Every displayed number traces to a backend response or an approved static disclosure. | [MANUAL] |
| F4 | Currency formatting is correct, including Indian digit grouping. | [MANUAL] |
| F5 | Valid zero displays as zero, valid negative displays correctly, and missing input never becomes confirmed zero. | [MANUAL] |
| F6 | Lint passes. | [CI] |
| F7 | Typecheck passes. | [CI] |
| F8 | Frontend unit tests pass. | [CI] |
| F9 | The production build succeeds. | [CI] |

Report F6–F9 separately, each with its exact command and result.

### F-B. Real-browser evidence

| ID | Control | Enforcement |
|---|---|---|
| F10 | Ordinary clicks, taps, keyboard actions and form submissions pass, with no DOM or script bypasses. | [MANUAL] |
| F11 | Every touched journey completes end to end against the actual running backend. | [MANUAL] (no automated end-to-end suite exists) |
| F12 | Screenshots cover key states, the three mobile widths, unknown and error states, and final screens. | [MANUAL] |
| F13 | One customer action emits exactly one intended event, and rerenders do not duplicate events. | [MANUAL] |

### F-C. UX, UI and accessibility

| ID | Control | Enforcement |
|---|---|---|
| F14 | Each screen has one primary objective and one visually dominant action. | [MANUAL] |
| F15 | Customer language avoids unexplained financial or product terminology. | [MANUAL] |
| F16 | Conditional fields match the selected type and input basis. Irrelevant controls are hidden. | [MANUAL] |
| F17 | Sliders and editable inputs stay synchronised without silently changing typed values. | [MANUAL] |
| F18 | Controls have labels, units, periods and short helper text where needed. | [MANUAL] |
| F19 | Interactive targets are at least 44px and whole choice cards are operable. | [MANUAL] |
| F20 | Keyboard focus is visible and follows the journey logically. | [MANUAL] |
| F21 | Buttons and forms use correct semantic HTML and accessible names. | [MANUAL] |
| F22 | Information and status are not conveyed by colour alone. | [MANUAL] |
| F23 | No duplicate headings, labels, calls to action or raw pipe-separated text remain. | [MANUAL] |
| F24 | The layout works at 375px, 390px and 430px without horizontal scrolling or clipping. | [MANUAL] |
| F25 | The desktop layout is coherent, without excessive empty or stacked space. | [MANUAL] |
| F26 | Enlarged text and vertical scrolling remain usable. | [MANUAL] |
| F27 | No overlay, animation, layout shift or rerender prevents an ordinary click or tap. | [MANUAL] |

---

## J. Journey-specific modules

Apply only the modules for journeys the task touches. Mark the rest N/A.

### J1. Landing

| ID | Control | Enforcement |
|---|---|---|
| J1.1 | Landing presents the two Alpha doors with the approved hierarchy. | [MANUAL] |

### J2. Quick check, result and what-if (both journeys)

| ID | Control | Enforcement |
|---|---|---|
| J2.1 | Quick check asks only what is needed for the initial answer. | [MANUAL] |
| J2.2 | Result gives a clear, useful answer before asking for further action. | [MANUAL] |
| J2.3 | What-if is optional and reachable from Result. | [MANUAL] |
| J2.4 | Editing what-if visibly marks the current result as needing recalculation. | [MANUAL] |
| J2.5 | The update action shows pending, success and actionable failure states. | [MANUAL] |
| J2.6 | A failed update preserves the previous successful result. | [MANUAL] |
| J2.7 | What-if uses the latest successful backend response and never a stale or failed edit. | [MANUAL] |
| J2.8 | Continuation is blocked while financial edits are stale or failed. | [MANUAL] |

### J3. Continuation (Track 1.1)

| ID | Control | Enforcement |
|---|---|---|
| J3.1 | Flow is Result or What-if, then Reveal, Intent, Closure, Finish. Reveal is not skipped. | [MANUAL] |
| J3.2 | Reveal, Intent and Closure replace the prior main content instead of appending beneath it. | [MANUAL] |
| J3.3 | Reveal reuses only supported result context and performs no new calculation. | [MANUAL] |
| J3.4 | Intent has exactly the approved choices and a subordinate skip. | [MANUAL] |
| J3.5 | The Closure preview is specific to the selected intent. | [MANUAL] |
| J3.6 | Yes, No, optional reason, Skip and Finish all reach defined states. | [MANUAL] |
| J3.7 | In-app Back restores the correct preceding state and values, and browser Back follows the visible journey. | [MANUAL] |
| J3.8 | Refresh and direct entry are safe when required context is absent. | [MANUAL] |
| J3.9 | Skip, decline and expressed future interest are analytically distinct. | [MANUAL] |
| J3.10 | Future interest is not recorded or described as data consent. | [MANUAL] |
| J3.11 | No Track 2 functionality or fake controls appear, and no copy promises notification, consent, verification or data access that has not occurred. | [MANUAL] |

### J4. Money Value

| ID | Control | Enforcement |
|---|---|---|
| J4.1 | Fixed reward amounts do not change when unrelated spending changes. | [MANUAL] |
| J4.2 | Percentage-based rewards change only under the documented spend and rate assumption. | [MANUAL] |
| J4.3 | Points and miles are not given an invented or universal rupee conversion. | [MANUAL] |
| J4.4 | An accumulated reward balance is not treated as rewards earned in a period. | [MANUAL] |
| J4.5 | The interest-cost estimate states its calculation limitations. | [MANUAL] |

### J5. Borrow Better

| ID | Control | Enforcement |
|---|---|---|
| J5.1 | The commitment ratio accurately describes every included numerator component. | [MANUAL] |
| J5.2 | The result does not imply lender approval, eligibility or guaranteed affordability. | [MANUAL] |
| J5.3 | The illustrative rate is labelled as illustrative and not an offer. | [MANUAL] |

---

## Mandatory stop rules

Release status is **BLOCKED** if any of these is FAIL or NOT VERIFIED:

- Git identity, base SHA or PR head is uncertain.
- Unrelated user work could be overwritten.
- A financial result can be fabricated, stale, incorrectly annualised, or confuse
  unknown with zero.
- Ordinary click or touch submission is not verified.
- Either journey cannot complete end to end.
- Event payloads may include financial data or PII.
- Responsive mobile behaviour is not verified.
- Production origin or CORS, health check or rollback is undefined.

## Required summary format

| Field | Required value |
|---|---|
| Task | One bounded outcome |
| Owner and checker | Named maker and named checker |
| Repository, worktree and branch | Exact path and branch |
| Base SHA | Exact starting SHA |
| Final local SHA | Exact SHA |
| Remote and PR SHA | Exact matching SHA |
| Diff | Intended files only |
| Automated tests | Commands and counts |
| Controls not yet enforced | Which [NOT YET ENFORCED] controls applied and what evidence replaced them |
| Browser evidence | Ordinary interaction only |
| Screenshots | Paths and viewport sizes |
| FAIL and NOT VERIFIED | Explicit list |
| Deployment | Not started, prepared, approved or deployed |
| Decision | READY FOR OWNER REVIEW, BLOCKED or APPROVED FOR DEPLOYMENT |
