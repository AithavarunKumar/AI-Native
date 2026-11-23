# Agent Blueprint — Feature 2: Parts Reservation

## Agent table

| Agent | Assigned work | Input needed | Output produced | Handoff to |
|---|---|---|---|---|
| Requirements agent (BA) | Turn feature intent into a reviewable requirements doc: user stories, acceptance criteria, edge cases, open questions | Feature intent, Feature 1 decisions (`pipeline/decisions/feature-1-decisions.md`), existing MockDataStore model, spec-generation-skill | `requirements.md` with status "awaiting human review"; open questions labelled `[OPEN BUSINESS QUESTION]` | Human reviewer — **STOP until human approves requirements** |
| Design agent | Write ADR and design review from approved requirements; challenge the design against the five concurrency/idempotency cases | Approved `requirements.md`, Feature 1 decisions, stack conventions (build-code-skill) | `architecture-adr.md`, `design-review.md` with verdict (Ready / Needs changes) | Human approver — **STOP until human approves design before any code is written** |
| Build agent (Developer) | Implement the approved design into working backend and frontend code, following T-01 → T-06 in `implementation-plan.md` | Approved ADR, `implementation-plan.md`, `requirements.md` ACs, build-code-skill, migration-safety-skill | Working `ReservationService`, `ReservationCritic`, `ReservationController`, seeded PartInventory data, Angular reservation panel | Tester agent |
| Test agent (Tester) | Write and run tests against the Definition of Done; verify all five design-review challenge cases; report pass/fail per AC | Completed implementation, `requirements.md` ACs, `design-review.md` challenge cases | Test suite, test results with pass/fail per AC; "Needs changes" verdict if any AC fails | Human reviewer — **STOP until human approves test results before delivery** |

## Execution order

1. Requirements agent runs first. All subsequent work is blocked until a human reviews and approves the requirements.
2. Design agent runs after requirements approval. The Build agent must not start until a human approves the ADR — this is a hard gate.
3. Build agent runs after design approval, following T-01 → T-02 → T-03 → T-04 → T-05 order. T-02 is additionally blocked until the partial-stock business decision is recorded in `pipeline/decisions/feature-2-decisions.md`.
4. Test agent runs after the build is complete. Delivery is blocked until a human approves the test results.

**Critic check — separate from agent gates and human approvals.**
The `ReservationCritic` is a runtime in-process check that runs at reservation time inside `ReservationService`. It is not an agent-handoff gate and not a human step. It executes on every reservation request in the running application and prevents finalization of any reservation that fails validation. It has no effect on the agent pipeline itself.

## Missing information and failure handling

- If the Requirements agent encounters an unresolvable business question (e.g., partial-stock policy, cancellation lifecycle), it must label it `[OPEN BUSINESS QUESTION]`, include it in Section 7 of the requirements, and stop. A human or product owner must answer the question before the Design agent begins.
- If the Build agent reaches T-02 and the partial-stock decision is not yet recorded, it must surface the blocker explicitly and stop rather than inventing a default policy.
- If the Test agent finds a failing AC, it returns a "Needs changes" verdict with the specific failing test name and AC reference. The Build agent re-runs only the affected task; the Test agent re-runs after the fix. The delivery gate remains closed until all ACs pass.
- If any agent receives ambiguous or conflicting input (e.g., the requirements reference a cancellation endpoint that does not exist in the codebase), it must ask for clarification before proceeding rather than making an assumption.

## Reflection journal

Moving from writing code to directing agents shifted the primary responsibility from implementation to specification. The key insight is that an ambiguous requirement is a downstream defect: if the Design agent invents a partial-stock policy without a decision, the Build agent implements the wrong behavior silently, and the Test agent validates the wrong thing. The human review gate between Design and Build exists specifically to catch invented policy before it becomes code.

The AI assistant (Claude Sonnet 4.6) challenged the ADR on critic-failure handling — asking what the UI would show if the critic threw an unexpected exception. I accepted that finding and improved the ADR to specify a structured 422 response rather than a silent 500, because an unstructured error would leave the dispatcher unable to distinguish a validation rejection from a system failure.

I rejected a suggestion to use a `tryLock` with a timeout instead of a plain `synchronized` block, because a timeout-based approach introduces a new failure mode (lock contention timeout) that is unnecessary for a single-JVM training boilerplate with no real concurrency pressure. The simpler blocking lock is correct for this scope.

What still needs clarification is the partial-stock policy (all-or-nothing vs. partial reservation). This decision changes T-02 materially — a different response shape, a different status value, and a different set of ACs. It is logged as an open question in the requirements and as an explicit gate in the implementation plan, and it must be answered before the Build agent runs T-02.
