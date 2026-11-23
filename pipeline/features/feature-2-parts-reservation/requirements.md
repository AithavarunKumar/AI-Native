# Feature 2 — Parts Reservation

| Field | Value |
|---|---|
| **Status** | Requirements — human reviewed, awaiting business decisions |
| **One-line intent** | Reserve required parts in inventory for a job that has already been successfully scheduled by Feature 1. |
| **Depends on** | Feature 1's specific committed job-slot decision: a successfully scheduled job is non-overlapping for the technician, using the full interval check and `TRAVEL_BUFFER_MINUTES = 45`. |
| **In scope** | Checking inventory for an existing scheduled job, reserving sufficient stock per required part, preventing duplicate reservations, reporting stock shortages, and releasing active reservations when a supported cancellation lifecycle occurs. |
| **Out of scope** | Purchasing, supplier management, automatic or manual backorder creation, low-stock replenishment, technician scheduling changes, customer notifications, and consuming reserved parts. |
| **Definition of Done** | A reservation request for a successfully scheduled job either reserves the required stock atomically according to an agreed policy or returns an explicit shortage response; reservation quantities never exceed net available inventory; duplicate attempts do not increase quantities; concurrent attempts cannot oversubscribe stock; and only a job with a successfully committed Feature 1 technician slot is eligible for reservation. |

## 1. Feature overview

After Feature 1 confirms and creates a technician job for a valid, conflict-free slot, Parts Reservation determines whether the job's required parts are available. Parts are reserved against the existing job so they cannot be allocated to another job until the reservation is released or a later lifecycle action is approved.

Parts reservation does not replace or recreate technician scheduling. It operates on a job that already exists and was successfully created by Feature 1. The repository does not establish whether scheduling and reservation occur in one combined operation or as separate operations, or whether a stock failure changes the job or technician booking. These remain open business decisions.

<!-- Reviewed by me:
Original BA output: "A parts-reservation failure may prevent final job confirmation, but it must not silently alter or cancel the Feature 1 technician booking."
Correction: Replaced it with a neutral statement that the repository does not establish combined-operation or rollback behavior, and that these decisions remain open.
Reason: The initial draft assumed that stock failure could prevent final confirmation and that preservation of a booked slot was the desired policy. The repository defines no such combined-transaction or rollback rule.
-->

## 2. User stories

- **US-1:** As a dispatcher, I want required parts checked for an existing scheduled job, so that I know whether the current inventory can support that job.
- **US-2:** As a dispatcher, I want to see each unavailable or insufficient part and its requested and available quantities, so that the shortage can be assessed without guessing.
- **US-3:** As a service manager, I want a successful reservation to remain linked to the existing job, so that inventory is not reused by another job.
- **US-4:** As a dispatcher, I want an active reservation for a cancelled job to be released, so that inventory becomes available for future work when the repository implements and exposes a supported cancellation lifecycle.
- **US-5:** As a dispatcher, I want repeated reservation requests for the same job to be idempotent, so that retries do not double-reserve stock.
- **US-6:** As a service manager, I want unavailable-stock responses to state only the known inventory shortage, with no implied backorder or purchase; backorder handling remains a separate business decision.

<!-- Reviewed by me:
Original BA output: US-1 said the dispatcher schedules a job and checks parts atomically; US-6 said to distinguish unavailable stock from an "optional backorder".
Correction: US-1 now reserves for an existing scheduled job, US-4 is explicitly conditioned on a supported cancellation lifecycle, and US-6 removes the optional-backorder implication.
Reason: Feature 1 owns job scheduling, and the repository does not establish atomic scheduling-plus-reservation or backorder support. The user stories should not expand Feature 2 beyond repository-defined behavior.
-->

## 3. Testable acceptance criteria

- **AC-1 — Inventory check:** When an existing scheduled job includes a required part quantity, the system checks net available inventory (physical quantity minus active reservations) and reserves according to the approved stock-allocation policy.
- **AC-2 — Full availability:** When every required part has sufficient net available stock, the system creates one reservation for the job for each part and reports success with the job ID and reserved quantities.
- **AC-3 — Partial stock:** [OPEN BUSINESS QUESTION] The repository does not define whether a shortage allows partial reservations or whether the whole reservation must fail. Until decided, no partial-reservation behavior or backorder status is defined.
- **AC-4 — Zero/unavailable stock:** When a required part has zero net available stock or no inventory record, the reservation response identifies the part, requested quantity, available quantity, and shortage status.
- **AC-5 — Atomicity:** Any reservation failure that follows an approved atomic policy leaves inventory and reservation records unchanged for all required parts.
- **AC-6 — Duplicate reservation:** Repeating a reservation request with the same job ID and same part requirements returns the existing reservation unchanged and does not consume inventory again.
- **AC-7 — Conflicting retry:** Repeating a reservation request for the same job ID with changed requirements is rejected rather than modifying or replacing the existing reservation.
- **AC-8 — Unknown or unscheduled job:** A reservation request for a job that does not exist or was not successfully scheduled by Feature 1 is rejected.
- **AC-9 — Invalid part quantities:** A required part that does not exist in inventory is unavailable; a quantity of zero or less is rejected as invalid.
- **AC-10 — Cancellation:** When a supported job-cancellation operation is implemented, all active reservations for that cancelled job are released exactly once.
- **AC-11 — Duplicate cancellation:** Releasing an already-released reservation is idempotent and does not add stock twice.
- **AC-12 — Backorders:** Backorders are outside this feature. A shortage response must not create a backorder or claim that an unmet quantity is backorder-eligible unless the repository gains an explicit business policy.
- **AC-13 — Feature 1 dependency:** Reservation is performed only for a job whose technician slot has been successfully committed by Feature 1. It does not rerun overlap validation or reserve inventory for a rejected technician slot.
- **AC-14 — Traceability:** Every reservation records the job ID and part ID/quantity, and reservation status is queryable by job ID.
- **AC-15 — Concurrent reservation:** Two or more jobs attempting to reserve the same constrained stock are processed safely; one request is rejected if net available stock is insufficient, and aggregate reserved quantity never exceeds available physical stock.

<!-- Reviewed by me:
Original BA output: AC-3 made all-or-nothing an assumed default policy; AC-12 allowed an unmet quantity to be identified as "backorder-eligible" without policy; AC-10 assumed a cancellation API; AC-15 was missing as an explicit acceptance criterion even though the edge-case section mentioned concurrency.
Correction: Removed the invented all-or-nothing default, made partial-stock behavior an open business question, prohibited backorder status until policy exists, tied cancellation to a supported lifecycle, and added a concurrent-reservation acceptance criterion.
Reason: The repository provides no partial-stock or backorder policy and Feature 1 has no cancellation endpoint. Concurrency needed to be elevated from an edge case to a testable requirement.
-->

## 4. Edge cases

- **Full stock:** Every requested part has sufficient net available quantity. A reservation may succeed and must remain linked to the scheduled job.
- **Partial stock:** At least one requested part has less than the requested quantity. The repository has no policy for partial reservation or a reservation that remains partially unmet; this must be decided before implementation.
- **Zero/unavailable stock:** A part has zero net available quantity or no inventory record. The request fails for that part and reports the shortage clearly.
- **Duplicate reservations:** Identical retry requests, sequential or concurrent, must resolve to the same existing reservation and must not consume stock twice.
- **Reservation conflicts:** A retry for an existing job uses different part requirements or quantities and is rejected rather than replacing the original reservation.
- **Concurrent jobs:** Competing reservations are serialized or otherwise guarded so net available stock cannot be oversubscribed.
- **Jobs without a booked technician slot:** A reservation request for a nonexistent, unscheduled, or technician-rejected job is rejected; inventory remains unchanged.
- **Backorders:** No backorder is created and no unmet quantity is marked backorder-eligible without an approved business policy.
- **Cancellation:** The repository defines `CANCELLED` as a job status but provides no cancellation endpoint or reservation-to-cancellation integration. Cancellation behavior remains unresolved until that lifecycle is defined.
- **Job completion and stock consumption:** Reserved stock consumption at job start or completion is outside scope unless a later approved lifecycle explicitly defines it.
- **Invalid quantities or part lists:** Required quantities must be positive, and unknown parts are unavailable. Whether a job with no required parts is valid remains open if the repository later adds work types or part requirements.

<!-- Reviewed by me:
Original BA output: The edge-case section assumed all-or-nothing partial stock, invented no-requirements validity behaviour, and described completion consumption as a vague open implementation choice.
Correction: Added full-stock and jobs-without-a-slot explicitly, moved partial-stock policy into an open business question, corrected cancellation to a repository-supported gap, and kept stock consumption outside Feature 2 scope.
Reason: These additions make the repository-backed scenarios and unsupported assumptions explicit; they remove guessed behavior that could become hidden implementation policy.
-->

## 5. Dependencies on Feature 1

- Feature 2 depends specifically on the Feature 1 decision that a successfully scheduled job has a committed, non-overlapping technician slot.
- The overlap formula and `TRAVEL_BUFFER_MINUTES = 45` are authoritative for Feature 1. Parts reservation must not rerun, weaken, or recreate technician availability validation.
- A reservation must link to the existing Feature 1 job ID. It must not create or modify a technician booking.
- A job whose Feature 1 booking returns `404` or `409` is not eligible for reservation.
- The repository does not define a combined `POST /api/jobs` plus parts-reservation transaction. A separate reservation request and combined-operation policy must be approved before implementation.
- The repository does not define whether a stock shortage leaves the Feature 1 slot booked, rolls back a schedule, or changes job status. No rollback behavior is assumed in this requirements document.

<!-- Reviewed by me:
Original BA output: The draft required HTTP `409`/`404` behavior for Feature 1 and assumed a stock failure would preserve the committed technician slot unless a separate rollback policy was approved.
Correction: Retained the fact that Feature 1's missing-tech and overlap outcomes make a job ineligible; removed the preservation-or-rollback assumption and stated that combined scheduling/reservation behavior is unresolved.
Reason: Feature 1 establishes booking conflicts and not-found behavior, but it does not establish transaction semantics with a later parts feature. Preservation or rollback must not be presented as a decision without repository evidence.
-->

## 6. Success metrics

- 100% of successful reservations correspond to an existing job successfully scheduled by Feature 1.
- 100% of successful reservations consume no more than net available physical inventory.
- 0 duplicate stock decrements for identical retries for the same job and requirements.
- 100% of rejected or failed reservation attempts leave stock unchanged until a final policy defines an alternative outcome.
- 100% of concurrent constrained-stock scenarios avoid aggregate reservation beyond available inventory.
- 100% of shortage responses include the affected part ID and requested versus available quantity.
- If and when cancellation is exposed, 100% of active reservations for a cancelled job are released exactly once.

<!-- Reviewed by me:
Original BA output: The draft used a 100% metric for "failed all-or-nothing reservations" and assumed cancellation always existed.
Correction: Changed the failure metric to depend on the approved failure policy and conditioned cancellation on a supported cancellation lifecycle.
Reason: All-or-nothing and cancellation behavior are not established in the repository, so the metric would otherwise validate a hidden business assumption.
-->

## 7. Assumptions and open questions

### Assumptions supported by the repository

- The system uses mock/in-memory data, with no external inventory system established.
- A reservation must be linked to an existing Feature 1 job.
- Net available inventory means physical inventory minus active reservations.
- Duplicate identical requests must not increase reservation quantity.
- Backorders, purchasing, replenishment, and parts consumption are not implemented or established as part of this feature.

### Open business questions

1. May a job receive partial stock reservations, or must the complete part list be available before reservation succeeds?
2. If stock is insufficient, does the Feature 1 technician slot remain booked, change status, or roll back?
3. Is reservation part of `POST /api/jobs`, or a separate API operation after scheduling?
4. If both operations are combined, what is the HTTP response and transaction behavior?
5. Is a backorder supported, and if it is, who creates it and what status represents it?
6. How are required parts and quantities represented for each job or work type?
7. Are jobs with no required parts valid?
8. Is there a cancellation endpoint or status transition in scope for releasing reservations?
9. When, if ever, are reserved parts consumed: at job start, completion, or through a separate operation?
10. What HTTP status and response shape represent partial or unavailable inventory outcomes?

<!-- Reviewed by me:
Original BA output: The draft included assumptions that the partial-stock policy was all-or-nothing and that reservation could be tied to a cancellation lifecycle without repository evidence.
Correction: Moved policy-sensitive statements out of the assumptions and retained them as open business questions.
Reason: The repository establishes neither policy, so neither may be presented as an approved assumption.
-->

## Artifacts this feature touches

- `<filled in later by the developer and tester agents>`
