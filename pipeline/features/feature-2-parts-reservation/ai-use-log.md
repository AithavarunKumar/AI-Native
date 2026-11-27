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

---

## C2 Review Layer — AI-use log entry

**Tool:** Claude Code · **Date:** 2026-11-27

### What was added

- `.claude/rules/review-checklist-rule.md` — 5-area, 25-condition checklist (Jira AC, Quality, Security/LLM, Compliance, Design Alignment).
- `.claude/agents/review-agent.md` — 39-line read-only review agent wired after tester-agent.
- `.claude/settings.json` — PreToolUse hook blocking Write/Edit containing credential patterns (AWS key, Stripe live key, GitHub PAT, private key) with exit code 2.
- `pipeline/orchestration.md` updated — Step 4 (Review Agent) and Step 5 (PR stage) added.
- `CLAUDE.md` updated — Review layer section registered.
- `docs/reviews/SF-2-review.md` — Full review report for Feature 2.

### Hook verification (actual execution evidence)

Attempted `Write` of a file containing a fake AWS key (AKIA + 16 uppercase alphanum pattern):
- **Result:** `PreToolUse:Write hook error: BLOCKED: Hardcoded secret or private key detected in proposed file content.`
- **File check:** `FILE DOES NOT EXIST (hook blocked correctly)` — write was prevented before the file was created.
- **Secondary finding:** The hook also blocked writing the review document when it contained the unredacted fake key strings, confirming it protects all file types.

Hook limitation identified: the PreToolUse hook only fires on Claude's `Write`/`Edit` tools. Direct file writes via `PowerShell`, `Bash`, or manual git operations bypass it. This is documented as a known gap. The review agent (Step 4) exists as the second, mandatory defense for this reason.

### Review execution (actual results)

**Run 1 — Clean code:** All 11 testable ACs: Pass. AC-3: Needs Human Decision (open business question). Zero Fail items. Verdict: **Ship**.

**Run 2 — Violation planted:** Fake Stripe live key injected at `PartInventoryService.java:16` via PowerShell (bypassing hook). `grep -n "sk-live-"` scan detected it immediately. F3-1 (OWASP A02) → Verdict: **No-Ship**.

**Revert:** Violation removed via PowerShell. `PartInventoryService.java` restored. Tests re-run: `Tests run: 13, Failures: 0, Errors: 0 — BUILD SUCCESS`. Final verdict: **Ship**.

### Jira MCP limitation

Jira MCP is not configured in this repository. The review-agent used `pipeline/features/feature-2-parts-reservation/requirements.md` as the AC proxy. All 11 testable ACs were mapped directly from that file. Limitation documented in `docs/reviews/SF-2-review.md` header.

### Reflection

1. **Did the hook prevent the violation from being written via Write/Edit?** Yes — confirmed by exit code 2 and file non-existence check.
2. **Did the hook prevent ALL paths?** No — PowerShell/Bash writes bypass it. This gap is why the review agent is mandatory, not optional.
3. **Did the review catch the planted violation?** Yes — F3-1 detected at first file scan, verdict immediately No-Ship.
4. **Were all five checklist areas actually checked against code?** Yes — each finding cites a specific file and line number.
5. **What would improve the hook?** Extend the matcher to include `Bash` tool calls that write to source directories; or add a git pre-commit hook that runs the same secret scan. Neither was added — keeping changes minimal per kata constraints.
