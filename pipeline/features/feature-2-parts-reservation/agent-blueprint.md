# Agent Blueprint — Feature 2: Parts Reservation

## Agent table

| Agent | Work | Inputs | Output | Gate |
|---|---|---|---|---|
| BA (Requirements) | Turn intent into reviewable requirements | Feature intent, `feature-1-decisions.md`, MockDataStore, `spec-generation-skill` | `requirements.md` with open questions labelled `[OPEN]` | **STOP — human must approve requirements** |
| Design | Write ADR and design review; challenge 5 concurrency/idempotency cases | Approved `requirements.md`, `feature-1-decisions.md`, `build-code-skill` | `architecture-adr.md`, `design-review.md` | **STOP — human must approve design before any code** |
| Build (Developer) | Implement T-01 → T-06 from `implementation-plan.md` | Approved ADR, `implementation-plan.md`, `build-code-skill`, `migration-safety-skill` | `ReservationService`, `ReservationCritic`, `ReservationController`, seeded parts, Angular reservation panel | Tester agent |
| Test (Tester) | Write and run tests against ACs; verify 5 design-review cases | Completed implementation, `requirements.md` ACs, `design-review.md` | Test suite + pass/fail per AC | **STOP — human must approve test results before delivery** |

## Execution order

1. BA → human approval → Design → human approval → Build → T-02 additionally blocked until partial-stock decision is in `pipeline/decisions/feature-2-decisions.md` → Test → human approval.

## Failure handling

- BA hits unresolvable business question → label `[OPEN BUSINESS QUESTION]`, stop. Human answers before Design begins.
- Build reaches T-02 without partial-stock decision → surface blocker explicitly, stop.
- Test finds failing AC → "Needs changes" verdict with AC reference. Build fixes only the affected task; Test re-runs.
- Any agent receives conflicting input → ask for clarification, do not assume.
