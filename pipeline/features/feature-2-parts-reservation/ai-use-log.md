# AI-Use Log — Kata 2, Feature 2: Parts Reservation

**Tool:** Claude Code · **Agent:** `ba-agent` + `spec-generation-skill`
**Scope:** Requirements phase only. No Feature 2 code was written.

## Human interventions (10 total)

1. **Feature intent/overview** — Parts Reservation operates on an existing scheduled job, not during scheduling. Combined scheduling+reservation behavior is an open question, not an assumed default.
2. **US-1, US-4, US-6** — US-1 now reserves for an existing job; US-4 conditions cancellation on a supported lifecycle; US-6 removes the implied backorder option.
3. **Remove all-or-nothing default** — Partial-stock policy is an open business question. The draft must not prescribe a policy the repo does not establish.
4. **Full/partial/zero stock distinctions** — Added explicit full-stock success case; kept partial and zero as separate scenarios, not conflated by policy assumptions.
5. **Backorders out of scope** — Removed "backorder-eligible" language from AC-12. No backorder model exists in the repo.
6. **Cancellation lifecycle** — AC-10/AC-11 conditioned on a supported cancellation endpoint; `CANCELLED` status exists in code but no endpoint does.
7. **Jobs without a booked slot** — Added explicit edge case: a job rejected by Feature 1 (or not yet scheduled) must not consume inventory.
8. **Concurrency as a formal AC** — Elevated from edge-case bullet to AC-15 with a testable concurrent-reservation requirement.
9. **Atomic-failure metric** — Removed "all-or-nothing" from the success metric; replaced with "according to the eventually approved failure policy."
10. **Narrow assumptions** — Moved partial-stock, rollback, combined scheduling, backorder, required-part model, and stock consumption from assumptions to open questions.
11. **Preserve initial draft** — Created `initial-requirements.md` as a pre-review snapshot before edits.

## Open questions (unresolved at requirements phase close)

1. Partial reservation or all-or-nothing when stock is insufficient?
2. If stock fails, does the Feature 1 slot stay booked, change status, or roll back?
3. Is reservation part of `POST /api/jobs` or a separate API call?
4. Combined scheduling+reservation: HTTP response and transaction behavior?
5. Is backorder supported, and who creates it?
6. How are required parts represented for a job or work type?
7. Are jobs with no required parts valid?
8. Is a cancellation endpoint in scope for releasing reservations?
9. When are reserved parts consumed (job start, completion, or separate operation)?
10. HTTP status and response shape for partial or unavailable inventory?

## Reflection

The BA agent reliably invents policy when the repo provides no evidence — partial stock, backorder, cancellation. The fix is to require repo evidence before accepting any AC that asserts business behavior. Human review is necessary specifically for policy boundaries, not just structure.
