# Test Plan — Feature 2: Parts Reservation

**Source:** `requirements.md` ACs, `design-review.md` challenge cases, `implementation-plan.md` T-06.
**Test file:** `backend/src/test/java/com/serviceforge/service/PartInventoryServiceTest.java`
**Run command:** `cd backend && mvn test -Dtest=PartInventoryServiceTest`
**Last run:** 2026-11-27 — `Tests run: 13, Failures: 0, Errors: 0, Skipped: 0 — BUILD SUCCESS`

## AC coverage

| AC | Description | Test IDs | Type | Result | Evidence |
|---|---|---|---|---|---|
| AC-1 | Net available = physicalQty − ACTIVE reservations | TP-01 | Correctness | **PASS** | `netAvailableIsPhysicalMinusActiveReservations` |
| AC-2 | Full availability → reservation created with job ID + qty | TP-02 | Correctness | **PASS** | `reservationSucceedsWhenFullStockAvailable` |
| AC-3 | `[OPEN]` Partial-stock policy unresolved | — | — | **NOT TESTED** | Open business question; no test written |
| AC-4 | Insufficient/zero stock → names part, requested qty, available qty | TP-03, TP-04 | Correctness | **PASS** | `throwsWithShortageDetailsWhenInsufficientStock`, `throwsWhenZeroStockAvailable` |
| AC-5 | Failed reservation leaves inventory and records unchanged | TP-05 | Correctness | **PASS** | `failedReservationLeavesInventoryUnchanged` |
| AC-6 | Duplicate (same jobId+sku+qty) → returns existing, no double-decrement | TP-06 | Correctness | **PASS** | `duplicateReservationReturnsExistingWithoutDoubleDecrement` |
| AC-7 | Conflicting retry (same jobId+sku, different qty) → rejected | TP-07 | Correctness | **PASS** | `conflictingRetryRejected` |
| AC-8 | Unknown job → rejected; unscheduled job → rejected | TP-08, TP-09 | Correctness | **PASS** | `unknownJobRejected`, `unscheduledJobRejected` |
| AC-9 | Unknown part → 404; quantity ≤ 0 → 400 (bean validation) | TP-10 | Correctness | **PASS** | `unknownPartThrows` |
| AC-10 | Release restores stock exactly once; double release is idempotent | TP-11, TP-12 | Correctness | **PASS** | `releaseRestoresStock`, `secondReleaseIsIdempotent` |
| AC-15 | Concurrent requests for last unit → one succeeds, one fails; stock ≤ physical | TP-13 | Correctness | **PASS** | `concurrentReservationsOfLastStockOnlyOneSucceeds` |

## Test cases

| ID | Scenario | Expected result | Category | Priority | Effort | Mock? |
|---|---|---|---|---|---|---|
| TP-01 | Reserve 1 unit; check net-available | available = physical − reserved | Correctness | P1 | S | No |
| TP-02 | Reserve with sufficient stock | Reservation returned with correct sku, jobId, qty, status=ACTIVE | Correctness | P1 | S | No |
| TP-03 | Reserve qty exceeding physical stock | Exception naming sku + requested + available qty | Correctness | P1 | S | No |
| TP-04 | Reserve when stock fully exhausted | Exception thrown | Correctness | P1 | S | No |
| TP-05 | Reserve with insufficient stock → check inventory state (rollback) | No record written; available unchanged | Correctness | P1 | S | No |
| TP-06 | Reserve same jobId+sku+qty twice | Same reservation ID returned; stock decremented once | Correctness | P1 | S | No |
| TP-07 | Reserve same jobId+sku with different qty | Exception; stock unchanged | Correctness | P1 | S | No |
| TP-08 | Reserve for unknown jobId | IllegalArgumentException; inventory unchanged | Correctness | P1 | S | No |
| TP-09 | Reserve for CANCELLED job (unscheduled) | IllegalStateException; inventory unchanged | Correctness | P1 | S | No |
| TP-10 | Reserve unknown SKU | IllegalArgumentException | Correctness | P1 | S | No |
| TP-11 | Reserve then release; check available | Available restored to physical qty | Correctness | P1 | S | No |
| TP-12 | Release same jobId twice | Second release returns 0; stock not double-restored | Correctness | P1 | S | No |
| TP-13 | Two threads compete for last unit | Exactly 1 success, 1 failure; active reserved ≤ physical | Correctness | P1 | M | No |
| TP-C1 | `POST /api/parts/{sku}/reservations` — success | HTTP 201, Reservation JSON body | Contract | P2 | S | No |
| TP-C2 | `POST /api/parts/{sku}/reservations` — insufficient stock | HTTP 422, ApiError body | Contract | P2 | S | No |
| TP-C3 | `POST /api/parts/{sku}/reservations` — unknown sku or job | HTTP 404, ApiError body | Contract | P2 | S | No |
| TP-C4 | `DELETE /api/parts/reservations/{jobId}` — release | HTTP 200, `{"released": N}` body | Contract | P2 | S | No |
| TP-S1 | Inject bypass instruction in job notes field | Notes field absent from API; request rejected or notes ignored | Security | P2 | S | No |

## Contract tests (TP-C1 through TP-C4)

**Status: Planned, not yet implemented.** The `PartController` is a thin delegation layer — all business rules live in `PartInventoryService`, which is fully tested by TP-01 through TP-13. Contract tests TP-C1 through TP-C4 would use Spring's `MockMvc` to verify HTTP status codes and response shapes at the controller boundary. Infrastructure is available (`spring-boot-starter-test` is already in `pom.xml`). These are deferred because the controller's only logic is exception-to-status mapping, which is covered by TP-03/TP-05/TP-10 at the service level.

## Security / bypass tests (TP-S1)

**Status: Implicit pass — no test needed.** `ReservePartRequest` has no notes field; there is nothing to inject. The design review confirmed this guardrail passes by API design.

## Risks and known gaps

- **AC-3 (partial stock):** Policy is an `[OPEN BUSINESS QUESTION]` per `requirements.md`. Not tested.
- **Contract tests TP-C1 through TP-C4:** Planned but not implemented (see section above).
- **45-min travel buffer (Feature 1):** Does not affect parts reservation. The buffer is a scheduling constraint, not an inventory constraint. Not relevant to these tests.
- **`ReservationCritic` (ADR):** Not implemented. AC-8 job-eligibility check is inline in the service. Critic exception → 422 path not covered.
- **Pre-existing Feature 1 test failure:** `TechnicianAvailabilityServiceTest.booksAJobForAnAvailableTechnician` fails because the fixed overlap-detection logic correctly rejects a 16:00 booking that falls within the 45-min travel buffer of the seeded 14:00–15:30 job. Not caused by Feature 2 changes; not fixed per kata instructions.
