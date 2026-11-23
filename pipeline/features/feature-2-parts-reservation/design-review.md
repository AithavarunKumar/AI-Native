# Design Review — Feature 2: Parts Reservation

**Reviewer:** AI assistant (Claude Sonnet 4.6)
**Source:** ADR at `architecture-adr.md`, requirements at `requirements.md`

## Challenge case walkthrough

| Case | ADR response | Verdict |
|---|---|---|
| Two valid requests compete for the last part | `synchronized` check-and-reserve ensures only one thread holds the lock at write time. The second thread sees zero net available stock and receives an insufficient-stock response. Stock never goes below zero. | Pass |
| No stock is available | Net available = physical − active reservations. If the result is zero or less, the service returns a structured shortage response (partId, requested qty, available qty) without writing any reservation record. | Pass |
| A user submits the same request twice | Idempotency check runs before entering the lock. A duplicate with identical `jobId` and requirements returns the existing reservation; stock is not decremented again. | Pass |
| A reservation is released twice | The release method checks status before restoring stock. If status is already `RELEASED`, the method exits without touching inventory. Stock is restored exactly once. | Pass |
| Job notes ask to bypass rules, or critic rejects/is unavailable | Notes are stored as free text and are never parsed by the service. The `ReservationCritic` runs synchronously inside the `synchronized` block before any write. If the critic rejects or throws, the method exits without committing. No reservation is finalized without a successful critic check. | Pass |

## Findings

**Finding 1 — Partial stock policy is unresolved.**
The ADR defaults to all-or-nothing behavior but this is an open business question in `requirements.md` (Question 1). Without a decision, the developer cannot implement the shortage path correctly. The ADR should explicitly state the assumed default and flag it as requiring a business decision before T-02 is built.

**Finding 2 — Critic unavailability returns an unstructured error.**
If the `ReservationCritic` component throws an unexpected exception, the caller receives a generic 500 rather than a structured error response. The UI would show a generic failure when it should show "reservation could not be validated." The ADR did not define the error shape for a critic exception.

## Improvement applied to ADR

Added a sentence to Section 4 (Impact) specifying that an unexpected exception from the `ReservationCritic` is caught and treated as a rejection, returning a structured `422` response rather than a 500. This closes Finding 2.

Finding 1 remains open and is recorded as an `[OPEN BUSINESS QUESTION]` gate in the ADR and in the implementation plan. It must be answered before the Build agent runs T-02.

## Verdict

**Needs changes — one open item.**

All five challenge cases pass. The critic-exception handling (Finding 2) has been addressed in the ADR. The partial-stock policy (Finding 1) is unresolved and must be decided and recorded in `pipeline/decisions/feature-2-decisions.md` before the Build agent begins T-02. Once that decision is recorded, the design is ready.
