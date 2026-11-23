# ADR: Parts Reservation for Scheduled Jobs

| Field | Value |
|---|---|
| **Status** | Proposed |
| **Feature** | Feature 2 — Parts Reservation |
| **Date** | 2026-11-23 |

## 1. Context

ServiceForge schedules technician jobs (Feature 1). Once a job slot is booked, the dispatcher needs to confirm that required parts are available and hold that stock exclusively for the job — otherwise two jobs can silently consume the same last unit. The system uses an in-memory MockDataStore with no real database; concurrency must be handled inside the JVM without transactions.

The core risk is a classic check-then-act race: two requests read available stock simultaneously, both see one unit available, both reserve it, and stock becomes negative. This design must eliminate that window without adding a database.

**Key reservation record fields:** `reservationId`, `jobId`, `partId`, `quantity`, `userId`, `requestId` (client-supplied idempotency key), `timestamp`, `status` (ACTIVE / RELEASED / REJECTED).

## 2. Decision

**MockDataStore** gains two new in-memory collections:
- `PartInventory`: maps `partId` to `physicalQuantity` (total stock on hand).
- `Reservation`: stores one record per reserved part per job, with the fields listed above.

Net available stock is computed on demand: `physicalQuantity − sum(quantity for ACTIVE reservations of that part)`.

**Spring Boot backend** adds:

- `ReservationService.reserve(...)` — a `synchronized` method that, inside a single locked block: (1) runs the `ReservationCritic` check, (2) calculates net available stock, (3) writes the reservation record only if the critic passes and stock is sufficient. If either check fails, the method returns without writing anything. Because both the read and the write happen inside the same lock, no other thread can interleave between them.
- `ReservationCritic` — a validator that runs before any write. It verifies: job exists and was successfully scheduled by Feature 1; requested quantities are positive; the job is not already reserved with different requirements. A critic rejection returns a structured `422` error. If the critic itself throws unexpectedly, the exception is caught and treated as a rejection — the reservation is not finalized.
- `POST /api/reservations` — creates a reservation; `GET /api/reservations/{jobId}` — queries status; `DELETE /api/reservations/{jobId}` — releases all ACTIVE reservations for the job.

**Idempotency:** before entering the lock, the service checks for an existing reservation with the same `jobId`. If one exists with identical requirements, it is returned without touching stock. If one exists with different requirements, the request is rejected.

**Release safety:** the release method checks the current status before restoring stock. If status is already `RELEASED`, the method exits without changing inventory. Stock is restored exactly once regardless of how many release calls arrive.

**Partial stock policy:** `[OPEN BUSINESS QUESTION]` — whether a shortage of one part allows partial reservation or requires all-or-nothing failure must be decided before this service is built. The design is written to support all-or-nothing as the default; partial behavior would require an additional status value and a different response shape.

**Angular frontend** adds a reservation panel on the job detail view: a "Check availability" action, a per-part shortage table (partId, requested qty, available qty), and Confirm / Release buttons.

## 3. Reason

**Chosen approach — `synchronized` service method in JVM.**
A single `synchronized` block is sufficient for a mock/in-memory system with one JVM instance. It provides the same atomicity guarantee as a database row-level lock without requiring any external infrastructure. It is the simplest correct solution for this scope.

**Alternative considered — optimistic locking with a version field.**
Each `PartInventory` entry would carry a `version` integer; the write would fail if the version changed between read and write, and the caller would retry. This is closer to a real distributed system but adds retry logic and version-conflict handling that is unnecessary overhead for a training boilerplate with no real persistence layer.

## 4. Impact

**Risk:** The `synchronized` block is a throughput bottleneck if many reservations run concurrently against the same part. For a training system with a small seed dataset this is acceptable. In production, the block would be replaced by a database transaction or optimistic locking.

**Mitigation:** The inventory map and reservation collection are kept as separate concerns so the synchronization boundary can be narrowed later (e.g., lock per partId rather than the whole service) without redesigning the REST API. All endpoints remain unchanged; only the internal locking strategy would evolve.

**Critic placement:** The `ReservationCritic` runs synchronously inside the `synchronized` service method, before any write. A critic rejection or unexpected exception exits the method without writing any reservation record and without modifying inventory. This means no partial state is ever written, and no rollback is needed.
