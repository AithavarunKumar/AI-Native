# Code Review — SF-2: Parts Reservation

**Date:** 2026-11-27
**Reviewer:** review-agent (automated) + human verification
**Story ID:** SF-2 (Feature 2 — Parts Reservation)
**Checklist:** `.claude/rules/review-checklist-rule.md`
**Jira status:** **Jira MCP not configured.** Using `pipeline/features/feature-2-parts-reservation/requirements.md` as AC proxy.
**Source files reviewed:**
- `backend/.../service/PartInventoryService.java`
- `backend/.../controller/PartController.java`
- `backend/.../model/Reservation.java`
- `backend/.../data/MockDataStore.java`
- `backend/.../test/.../PartInventoryServiceTest.java`
- `pipeline/features/feature-2-parts-reservation/test-plan.md`

---

## Violation Test Evidence (pre-review No-Ship run)

Before this final review, a **No-Ship run** was performed to prove the review catches real violations:

- **Hook test:** A Write containing a fake AWS key (AKIA + 16 uppercase alphanum chars) was attempted — blocked by `PreToolUse` hook with exit 2 before the file was written. `FILE DOES NOT EXIST (hook blocked correctly)`.
- **Hook limitation:** The hook only fires on Claude Write/Edit tools. Direct file writes (PowerShell, git patches, manual edits) bypass it. The review agent is the second, mandatory defense for all code paths.
- **Planted (via PowerShell, bypassing hook):** `PartInventoryService.java:16` — fake Stripe live key `private static final String STRIPE_API_KEY = "sk-live-[32-char fake key]";`
- **Review detection:** `grep -n "sk-live-"` scan detected the planted key at line 16 → **F3-1 (OWASP A02) → No-Ship**.
- **Note:** This review document also triggered the hook when it contained the unredacted key strings — confirming the hook protects documentation files too. Keys are redacted here deliberately.
- **Action:** Violation reverted. `PartInventoryService.java` restored. All 13 tests re-verified: `Tests run: 13, Failures: 0, Errors: 0 — BUILD SUCCESS`.

---

## Section 1 — Jira AC Verification

| AC | Description | Result | Evidence |
|---|---|---|---|
| AC-1 | Net available = physicalQty − ACTIVE reservations | **Pass** | `PartInventoryService.java:68-70` — `physicalQty - activeReserved` using `getActiveReservationsForSku()` |
| AC-2 | Full availability → reservation created | **Pass** | `PartInventoryService.java:77-78` — `new Reservation(UUID, sku, jobId, quantity)` + `saveReservation()` |
| AC-3 | `[OPEN]` Partial-stock policy | **Needs Human Decision** | Marked `[OPEN]` in `requirements.md`. Not encoded in code. `test-plan.md`: NOT TESTED. Must be cleared before AC-3 ships. |
| AC-4 | Insufficient stock → names part, qty requested, qty available | **Pass** | `PartInventoryService.java:73-75` — `"Insufficient stock for " + sku + ": requested " + quantity + ", available " + available` |
| AC-5 | Failed reservation leaves inventory and records unchanged | **Pass** | `PartInventoryService.java:41` — `synchronized`; all checks precede `saveReservation()`. TP-05 confirms. |
| AC-6 | Duplicate (same jobId+sku+qty) → returns existing, no double-decrement | **Pass** | `PartInventoryService.java:54-62` — idempotency check inside synchronized block; TP-06 passes. |
| AC-7 | Conflicting retry (same jobId+sku, different qty) → rejected | **Pass** | `PartInventoryService.java:63-65` — throws `IllegalStateException`. TP-07 passes. |
| AC-8 | Unknown/unscheduled job → rejected | **Pass** | `PartInventoryService.java:45-51` — `findJob()` + `getStatus() != SCHEDULED`. TP-08, TP-09 pass. |
| AC-9 | Unknown part → 404; qty <= 0 → 400 | **Pass** | Service line 42-43 — `IllegalArgumentException` caught as 404 at `PartController.java:43`. `@Min(1)` on DTO → Bean Validation 400. |
| AC-10 | Release restores stock exactly once; double release idempotent | **Pass** | `PartInventoryService.java:83-89` — filters ACTIVE only; sets RELEASED. TP-11, TP-12 pass. |
| AC-15 | Concurrent requests → one succeeds, one fails; stock <= physical | **Pass** | `PartInventoryService.java:41` — `synchronized` serialises. TP-13 passes with `CyclicBarrier`. |

**Section verdict: Pass** (1 Needs Human Decision — AC-3 open business question, not a code defect)

---

## Section 2 — Code Quality

| Item | Result | Evidence |
|---|---|---|
| F2-1: Controller returns `ResponseEntity<ApiError>` on errors | **Pass** | `PartController.java:42-46` — `catch (IllegalArgumentException)` → 404; `catch (IllegalStateException)` → 422 |
| F2-2: No business logic in controller | **Pass** | `PartController.java` delegates entirely to `PartInventoryService`; zero branching logic |
| F2-3: `synchronized` method contains no blocking I/O | **Pass** | `PartInventoryService.java:41-79` — in-memory operations only |
| F2-4: No magic numbers where named constants exist | **Pass** | No `45` literal in reservation code; `TRAVEL_BUFFER_MINUTES` correctly absent from inventory logic |
| F2-5: Concurrent test assertions include failure messages | **Pass** | `PartInventoryServiceTest.java:199-200` — `assertEquals(1, successes.get(), "Exactly one thread should succeed")` |

**Section verdict: Pass**

---

## Section 3 — Security (OWASP Web + LLM)

| Item | Result | Evidence |
|---|---|---|
| F3-1: No hardcoded credentials | **Pass** | Source scan for AWS/Stripe/GitHub key patterns returns 0 matches after violation revert |
| F3-2: No user input concatenated into log/SQL/shell | **Pass** | No logging present; SKU in error messages is intentional per AC-4, not piped to any channel |
| F3-3: No stack traces in HTTP response body | **Pass** | `PartController.java:43,45` — returns `new ApiError(e.getMessage())` only; no `e.toString()` |
| F3-4: No free-text field passed unsanitised to LLM/agent | **Pass** | `ReservePartRequest` has only `jobId` and `quantity`; no notes or free-text fields |
| F3-5: Free-text fields not parsed as agent instructions | **Pass** | No free-text parsing in reservation path; design review challenge case 5 confirmed this |

**Section verdict: Pass**

---

## Section 4 — Compliance

| Item | Result | Evidence |
|---|---|---|
| F4-1: No new third-party library without license check | **Pass** | `backend/pom.xml` unchanged from C1; only Spring Boot parent and existing dependencies |
| F4-2: No personal data logged at non-DEBUG level | **Pass** | Zero logging calls in reservation code |
| F4-3: No new external service call without ADR entry | **Pass** | In-memory only; no HTTP/messaging/DB calls introduced |
| F4-4: Business decision not silently encoded without decisions file | **Needs Human Decision** | AC-3 partial-stock policy NOT silently encoded — correctly left unimplemented. `pipeline/decisions/feature-2-decisions.md` does not exist and must be created before AC-3 is ever implemented. |
| F4-5: No data-retention gap for real persistence | **Needs Human Decision** | In-memory mock: RELEASED reservations accumulate indefinitely. Acceptable for training boilerplate; production would need archival policy. |

**Section verdict: Pass** (2 Needs Human Decision — pre-existing architectural scope limits)

---

## Section 5 — Design Alignment

| Item | Result | Evidence |
|---|---|---|
| F5-1: Net-available formula matches ADR | **Pass** | `PartInventoryService.java:67-70` — `physicalQty - sum(ACTIVE quantities)` via `getActiveReservationsForSku()` |
| F5-2: Travel buffer uses constant, not literal | **Pass** | Travel buffer correctly absent from reservation logic |
| F5-3: Stock check inside `synchronized` block | **Pass** | `PartInventoryService.java:41` — entire method synchronized; idempotency at line 54 is inside the lock |
| F5-4: `ReservationStatus` added additively | **Pass** | Existing 4-arg constructor still present; `status` defaults to `ACTIVE`; no existing callers broken |
| F5-5: HTTP 422 for insufficient stock (not 409) | **Pass** | `PartController.java:45` — `ResponseEntity.status(422)` matches ADR |

**Section verdict: Pass**

---

## Final Verdict

| Area | Verdict | Needs Human Decision |
|---|---|---|
| 1. Jira AC Verification | Pass | AC-3 (partial-stock policy unresolved) |
| 2. Code Quality | Pass | — |
| 3. Security (OWASP + LLM) | Pass | — |
| 4. Compliance | Pass | F4-4 (feature-2-decisions.md missing), F4-5 (in-memory retention) |
| 5. Design Alignment | Pass | — |

## SHIP

No Fail items. Three Needs Human Decision items are pre-existing open business questions from the requirements phase, not implementation defects introduced in this delivery.

**Before PR merges:** Confirm the three Needs-Human-Decision items are accepted as deferred scope, or escalate AC-3 for immediate resolution and require `pipeline/decisions/feature-2-decisions.md` before the PR merges.