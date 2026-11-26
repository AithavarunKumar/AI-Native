# Feature 2 — Parts Reservation

| Field | Value |
|---|---|
| **Status** | Requirements — human reviewed |
| **One-line intent** | Reserve required parts in inventory for a job already successfully scheduled by Feature 1. |
| **Depends on** | Feature 1's committed job-slot decision: a successfully scheduled job is non-overlapping, using `TRAVEL_BUFFER_MINUTES = 45` from `pipeline/decisions/feature-1-decisions.md`. |
| **In scope** | Checking inventory for an existing scheduled job, reserving sufficient stock, preventing duplicate reservations, reporting shortages, releasing reservations on a supported cancellation lifecycle. |
| **Out of scope** | Purchasing, backorders, low-stock replenishment, technician scheduling changes, customer notifications, stock consumption at job completion. |
| **Definition of Done** | Reservation succeeds or returns an explicit shortage; quantities never exceed net available stock; identical retries are idempotent; concurrent requests cannot oversubscribe stock; only Feature 1-scheduled jobs are eligible. |

## User stories

- **US-1** Dispatcher checks inventory for an existing scheduled job.
- **US-2** Dispatcher sees each unavailable part with requested vs. available quantities.
- **US-3** A successful reservation stays linked to the job so stock isn't reused by another job.
- **US-4** An active reservation is released when a supported job cancellation occurs.
- **US-5** Repeated reservation requests for the same job are idempotent.
- **US-6** Shortage responses report known inventory only — no implied backorder.

## Acceptance criteria (key)

- **AC-1** Net available = physicalQty − active reservations; this formula is authoritative.
- **AC-2** Full availability → reservation created; job ID and quantities reported.
- **AC-3** `[OPEN]` Partial stock: all-or-nothing vs. partial reservation — unresolved.
- **AC-4** Zero/unavailable stock → response names the part, requested qty, available qty.
- **AC-5** Atomicity: failed reservation leaves inventory and records unchanged.
- **AC-6** Duplicate (same jobId + same requirements) → returns existing reservation, no double-decrement.
- **AC-7** Conflicting retry (same jobId, different requirements) → rejected.
- **AC-8** Unknown or unscheduled job → rejected; inventory unchanged.
- **AC-9** Quantity ≤ 0 or unknown part → 400/404.
- **AC-10** Cancellation releases reservations exactly once — when a supported lifecycle exists.
- **AC-15** Concurrent requests for constrained stock → one succeeds, one fails; aggregate never exceeds available stock.

## Open questions

See `ai-use-log.md` Section "Open questions" for the full list (10 items). Critical gate: AC-3 (partial-stock policy) must be answered and recorded in `pipeline/decisions/feature-2-decisions.md` before the Build agent runs T-02.
