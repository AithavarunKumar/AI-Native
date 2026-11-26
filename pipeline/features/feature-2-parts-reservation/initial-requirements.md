# Initial BA Agent Draft — Feature 2: Parts Reservation

> Pre-review snapshot. Do not use for implementation. See `requirements.md` for the reviewed version and `ai-use-log.md` for what was corrected and why.

| Field | Value |
|---|---|
| **Status** | Initial draft — superseded by `requirements.md` |
| **One-line intent** | Reserve required parts when a technician job is scheduled so unavailable stock is handled consistently. |
| **Depends on** | Feature 1's committed job slot and `TRAVEL_BUFFER_MINUTES = 45`. |
| **In scope** | Inventory check at scheduling time, reserving per-part stock, duplicate prevention, shortage reporting, cancellation release. |
| **Out of scope** | Purchasing, backorder creation, replenishment, scheduling changes, customer notifications. |

## Key problems in this draft (corrected in reviewed version)

- **US-1** said "schedule a job and check parts atomically" — assumed combined scheduling+reservation, which the repo does not establish.
- **US-6** distinguished "optional backorder" — implied backorder support that does not exist.
- **AC-3** stated all-or-nothing as the initial assumption and default policy — invented a business rule the repo does not define.
- **AC-10/AC-11** assumed cancellation releases reservations as an active feature — `CANCELLED` status exists but no cancellation endpoint does.
- **AC-12** said unmet quantity is "backorder-eligible" with an open question — implies backorders are a possible outcome, which is out of scope.
- **Section 5** assumed a failed reservation "may prevent final job confirmation" and preserve the Feature 1 slot as a default — rollback/preservation behavior is an open question, not an established rule.

## Original open questions (9)

1. Partial stock: all parts required, or partial reservation allowed?
2. If parts fail, does the Feature 1 slot stay booked or roll back?
3. Is reservation part of `POST /api/jobs` or a separate call?
4. When are reserved parts consumed?
5. Does cancellation/rescheduling move reservations automatically?
6. Are backorders data records or just unmet quantities for manual follow-up?
7. Are zero-part jobs valid?
8. What cancellation API exists or must be introduced?
9. HTTP status for partial/unavailable inventory — 409 or 422?
