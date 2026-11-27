# ADR: Parts Reservation for Scheduled Jobs

| Field | Value |
|---|---|
| **Status** | Proposed |
| **Feature** | Feature 2 — Parts Reservation |
| **Date** | 2026-11-23 |

## Context

Dispatcher needs to hold stock exclusively for a booked job. Classic check-then-act race: two requests read available stock simultaneously, both see one unit, both reserve it. Must be eliminated inside a single JVM without a database.

**Reservation record fields:** `reservationId`, `jobId`, `partId`, `quantity`, `requestId` (idempotency key), `timestamp`, `status` (ACTIVE / RELEASED / REJECTED).

## Decision

**MockDataStore** gains `PartInventory` (partId → physicalQty) and `Reservation` collections.
Net available = `physicalQty − sum(ACTIVE reservation quantities)`.

**ReservationService.reserve(...)** — `synchronized` method: inside one locked block, runs the `ReservationCritic`, calculates net available stock, and writes only if both pass. No partial state is ever written.

**ReservationCritic** — validates before any write: job exists and is SCHEDULED; quantities positive; no conflicting retry. Returns structured `422`. If the critic throws unexpectedly, the exception is caught, treated as rejection, returning `422` — not `500`.

**Idempotency** — before the lock: if an identical `jobId`+requirements reservation exists, return it. If `jobId` exists with different requirements, reject.

**Release** — checks status before restoring stock; if already RELEASED, exits without touching inventory.

**Partial stock policy** — `[OPEN BUSINESS QUESTION]`. Design supports all-or-nothing as default; partial behavior requires a new status value and different response shape.

**Angular** adds a reservation panel: "Check availability" action, per-part shortage table, Confirm / Release buttons.

## Chosen approach — `synchronized` block

Sufficient for a single-JVM in-memory system. Provides atomicity without external infrastructure.
**Alternative rejected — optimistic locking with version field:** adds retry logic and version-conflict handling unnecessary for a training boilerplate with no real persistence.

## Impact

The `synchronized` block is a throughput bottleneck under high concurrency — acceptable for this training system. The inventory and reservation collections are kept as separate concerns so the lock boundary can be narrowed per-partId later without changing the REST API.
