# Review Checklist Rule

**Status:** Active
**Applies to:** Every feature before the PR stage.

The Review Agent must check all five areas below. A single **Fail** blocks the PR (No-Ship). **Needs Human Decision** means the agent cannot determine pass/fail from code alone — a human must decide before the PR merges.

---

## 1. Jira AC Verification

Each AC in the linked Jira story must be traceable to an implemented code path or a test method.

- **F1-1:** An AC is marked `[OPEN]` in the spec but code ships as if it were decided.
- **F1-2:** A code path implements behavior not covered by any AC (scope creep).
- **F1-3:** An AC is listed in the test plan as PASS but no test method covers it.
- **F1-4:** The Jira story cannot be resolved and no AC proxy exists in `pipeline/features/`.
- **F1-5:** A test method covers an AC but the assertion is trivially weak (e.g., `assertNotNull` only on a business-logic invariant).

---

## 2. Code Quality

- **F2-1:** A service method exposes a raw exception at the controller boundary instead of `ResponseEntity<ApiError>`.
- **F2-2:** Business logic lives in a controller method rather than the service layer.
- **F2-3:** A `synchronized` method contains blocking I/O or external calls, creating a deadlock risk.
- **F2-4:** A magic number or magic string is hardcoded where a named constant already exists (e.g., `45` instead of `TRAVEL_BUFFER_MINUTES`).
- **F2-5:** A test assertion on a critical invariant (stock never negative, idempotency) omits a failure message.

---

## 3. Security — OWASP Web + LLM

- **F3-1:** A credential, API key, or private key is hardcoded in source code (OWASP A02 — Cryptographic Failures).
- **F3-2:** User-supplied input (customer name, job notes, SKU) is concatenated into a log statement, SQL fragment, or shell command without sanitisation (OWASP A03 — Injection).
- **F3-3:** An HTTP endpoint returns a Java stack trace or full internal exception class in the response body (OWASP A05 — Security Misconfiguration / information leakage).
- **F3-4:** Job notes, customer names, or any free-text field is passed unsanitised into an LLM prompt or agent instruction (OWASP LLM01 — Prompt Injection).
- **F3-5:** An agent or service parses free-text fields as structured commands or instructions rather than treating them as opaque data (OWASP LLM01 — indirect prompt injection).

---

## 4. Compliance

- **F4-1:** A new third-party library is added without a license compatibility check recorded in `pipeline/decisions/`.
- **F4-2:** Personal data (customer name, technician name) is written to a log at any level other than DEBUG, without a recorded data-handling decision.
- **F4-3:** A new external service call (HTTP, messaging, database) is introduced without an approved ADR entry in `pipeline/features/`.
- **F4-4:** A business decision that future agents must retrieve (e.g., partial-stock policy) is encoded silently in code without a `pipeline/decisions/feature-N-decisions.md` entry.
- **F4-5:** A data-retention or audit-trail gap is introduced that would not survive a move from in-memory mock to a real persistence layer.

---

## 5. Design Alignment

- **F5-1:** The net-available formula deviates from the ADR definition: `physicalQty − sum(ACTIVE reservation quantities)`.
- **F5-2:** The travel buffer is hardcoded as a literal integer instead of referencing `TRAVEL_BUFFER_MINUTES` (violates `pipeline/rules/no-overlap-booking.md`).
- **F5-3:** A stock-availability or idempotency check is placed outside the `synchronized` block, introducing a check-then-act race (violates ADR atomicity requirement).
- **F5-4:** A model field is added in a way that breaks existing consumers without an additive migration step per `migration-safety-skill`.
- **F5-5:** An HTTP status code deviates from the ADR specification (e.g., 409 instead of 422 for insufficient-stock responses).
