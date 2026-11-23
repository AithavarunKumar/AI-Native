# AI-Use Log — Kata 2, Feature 2: Parts Reservation

## 1. Objective of Kata 2

Complete the requirements phase for Feature 2 – Parts Reservation, with human review and annotation before implementation. The work was limited to generating, reviewing, and preserving requirements; no Feature 2 code was implemented and no later pipeline phases were run.

## 2. AI tool and existing agent

- **AI tool:** Claude Code
- **Existing repository agent:** `ba-agent`
- **Existing skill:** `spec-generation-skill`
- **Repository role documentation reviewed:** `pipeline/orchestration.md`, `.claude/agents/ba-agent.md`, `.claude/skills/spec-generation-skill/SKILL.md`, and `.github/prompts/ba-agent.prompt.md`

## 3. Initial prompt provided to the BA agent

The initial prompt requested Kata 2 – Feature 2: Parts Reservation, with the business requirement:

> “When a job is scheduled, check whether the required parts are available in inventory and reserve them for that job.”

The prompt also instructed the BA agent to:

- respect Feature 1's committed technician-availability-slot decision;
- inspect Feature 1 implementation and project documentation before generating requirements;
- reuse the existing spec-generation skill;
- generate `requirements.md` under the Feature 2 pipeline folder; and
- include feature overview, user stories, acceptance criteria, edge cases, Feature 1 dependencies, success metrics, assumptions, and open questions.

It explicitly required the initial requirements only, without implementation or correction/commit before human review.

## 4. Summary of the BA agent's initial generation

The BA agent created `pipeline/features/feature-2-parts-reservation/requirements.md` and initially:

- defined the feature as inventory checking and reservation after or during job scheduling;
- included 6 user stories, 14 acceptance criteria, edge cases, Feature 1 dependencies, success metrics, assumptions, and open questions;
- treated partial stock as all-or-nothing;
- considered the possibility of partial reservations and backorder-eligible unmet quantities;
- included duplicate reservation, conflicting retry, cancellation, concurrent stock, and unknown-job scenarios;
- linked the feature to the booked Feature 1 job and the 45-minute travel-buffer decision;
- mentioned mock/in-memory inventory and a Feature 1 cancellation status but did not establish repository endpoints or policy.

The initial draft's `initial-requirements.md` is preserved in the Feature 2 folder as a snapshot of this output.

## 5. Human interventions

### Intervention 1 — Correct the feature intent and overview

- **Original requirement:** “A parts-reservation failure may prevent final job confirmation” and the feature was described as being part of a scheduling-and-reservation flow that might preserve or alter the booked slot.
- **Correction:** State that Parts Reservation operates after an existing job is successfully scheduled by Feature 1, and preserve the unresolved combined-operation/rollback behavior as a business question.
- **Reason:** The repository establishes Feature 1 as the scheduler and job creator. It establishes no single-transaction behavior for job scheduling plus stock reservation.

### Intervention 2 — Correct US-1, US-4, and US-6

- **Original requirements:**
  - US-1 combined scheduling and atomic inventory checking.
  - US-4 assumed a dispatcher could cancel and release reservations without defining the cancellation lifecycle.
  - US-6 said the user should distinguish unavailable stock from an “optional backorder.”
- **Correction:**
  - US-1 now refers to checking parts for an existing scheduled job.
  - US-4 conditions cancellation release on a supported cancellation lifecycle.
  - US-6 removes the implication that backorder support exists.
- **Reason:** Feature 1 owns scheduling. The repository has no inventory backorder model and no cancellation endpoint. The draft should not create those capabilities as if they were established.

### Intervention 3 — Remove the unapproved all-or-nothing policy

- **Original requirement:** AC-3 assumed all-or-nothing reservation and called it the initial policy. The draft also stated that this policy was the default to use unless a later question was answered.
- **Correction:** Make partial-stock behavior an open business question and define no partial/all-or-nothing implementation outcome.
- **Reason:** The repository contains no established partial-stock policy. Prescribing all-or-nothing would have silently invented a business rule.

### Intervention 4 — Add an explicit full-stock requirement while preserving partial and zero stock separately

- **Original requirement:** Full availability was described in AC-2, but partial and zero stock were conflated by policy assumptions and weak status descriptions.
- **Correction:** Retain full availability as success, add explicit edge-case coverage for full, partial, and zero stock, and require shortage responses to identify requested and available quantities.
- **Reason:** Full, partial, and unavailable stock are distinct business scenarios. The final draft now makes that distinction explicit and testable.

### Intervention 5 — Remove unsupported backorder behavior

- **Original requirement:** AC-12 said unmet stock could be “backorder-eligible,” and the edge-case section said unmet quantities could be identified for manual follow-up.
- **Correction:** Backorders are marked explicitly out of scope. A shortage must not create or imply a backorder unless a future approved policy defines one.
- **Reason:** The repository has no inventory, supplier, purchasing, or backorder implementation or policy. The draft was corrected to avoid assuming backorders are supported.

### Intervention 6 — Correct cancellation requirements

- **Original requirement:** AC-10, AC-11, and success metrics assumed cancellation releases reservations as an active feature behavior.
- **Correction:** Define cancellation release only as a future supported lifecycle behavior. Preserve `CANCELLED` as an existing job status, but record the missing cancellation endpoint/lifecycle as unresolved.
- **Reason:** `JobStatus.java` defines `CANCELLED`, but no controller, API, or inventory integration in the repository implements reservation cancellation.

### Intervention 7 — Add jobs without a booked technician slot

- **Original requirement:** AC-8 covered nonexistent or unsuccessfully scheduled jobs, but it was not made a separate edge-case review item and the overview suggested reservation could be close to scheduling.
- **Correction:** Added an explicit edge case: jobs that have no committed Feature 1 booking are rejected and leave inventory unchanged.
- **Reason:** Feature 2 must validate the dependency on a successfully scheduled Feature 1 job. A job rejected by technician overlap or invalid booking must not consume inventory.

### Intervention 8 — Elevate concurrency to a formal acceptance criterion

- **Original requirement:** Concurrency appeared as an edge-case bullet and in a success metric, but lacked a dedicated acceptance criterion.
- **Correction:** Added AC-15 requiring safe handling of concurrent constrained-stock requests and no aggregate oversubscription.
- **Reason:** Concurrent reservations are a core duplicate/stock-integrity scenario and need a direct testable acceptance criterion rather than only an example.

### Intervention 9 — Correct the atomic-failure metric

- **Original requirement:** The success metric said 100% of “failed all-or-nothing reservations” leave stock and reservation records unchanged.
- **Correction:** Change the metric to apply failed reservation attempts according to the eventually approved failure policy, and remove all-or-nothing as a final assumption.
- **Reason:** The repository does not establish atomic/all-or-nothing behavior, so a metric should not validate an invented policy.

### Intervention 10 — Narrow assumptions and expand unresolved business questions

- **Original requirement:** Assumptions included an all-or-nothing default, stock consumption not assumed, cancellation behavior, required-part source, and completion behavior.
- **Correction:** Retained only repository-supported assumptions. Moved partial-stock, rollback, combined scheduling/reservation, backorder, required-part model, zero-part jobs, HTTP behavior, and stock consumption into open questions.
- **Reason:** Requirements that are not present in the repository should be explicit questions rather than silent assumptions.

### Intervention 11 — Preserve the initial draft

- **Original activity:** The initial requirements existed only in `requirements.md`, with no separate Git history.
- **Correction:** Created `initial-requirements.md` containing the complete BA agent draft before human editing.
- **Reason:** Preserve traceability because the repository has no prior commit or Git snapshot for the newly generated requirements.

## 6. Open questions or unresolved business decisions

1. May a job receive partial stock reservations, or must every required part be fully available first?
2. If stock is insufficient, does the Feature 1 technician slot remain booked, change status, or roll back?
3. Is reservation part of `POST /api/jobs`, or should it be a separate API operation?
4. If reservation is combined with scheduling, what is the HTTP response and transaction behavior?
5. Is a backorder supported, and if so, who creates it and what status represents it?
6. How are required parts and quantities represented for a job or work type?
7. Are jobs with no required parts valid?
8. Is a cancellation endpoint or status transition available for releasing reservations?
9. When, if ever, are reserved parts consumed: at job start, completion, or through a separate operation?
10. What HTTP status and response shape should represent partial or unavailable inventory outcomes?

## 7. Final review and reflection

### Where did the BA agent's first draft need the most correction?

The first draft needed the most correction in policy-sensitive assumptions: partial stock, backorder behavior, combined scheduling/rollback behavior, and cancellation. It invented or implied those policies despite the repository not establishing them.

### Which edge case would I have missed without reviewing the output?

Without review, I might have overlooked the combination of a job that exists in memory but does not have a successfully committed technician slot, or the distinction between a cancellation status and an actual cancellation endpoint. I would also have risked silently accepting partial stock or backorder assumptions.

### What will I check first next time I delegate work to an AI agent?

I will first check whether every business policy is evidenced by repository files, decision logs, or existing APIs. I will also check scope boundaries and dependencies before accepting acceptance criteria or metrics.

### What did I learn about the difference between AI generation and human judgment?

AI generation is effective at creating a broad, structured requirements draft and identifying candidate edge cases. Human judgment is necessary to determine whether a candidate rule is actually supported by the repository, to remove out-of-scope inventions, and to convert unsupported behavior into explicit open questions rather than silently approved assumptions.

## Final status

- Final reviewed requirements: `pipeline/features/feature-2-parts-reservation/requirements.md`
- Initial BA draft preserved at: `pipeline/features/feature-2-parts-reservation/initial-requirements.md`
- Human-reviewed AI-use log: `pipeline/features/feature-2-parts-reservation/ai-use-log.md`
- No Feature 1 files or application code were modified.
