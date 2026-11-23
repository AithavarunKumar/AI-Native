# Memory Architecture Specification — Feature 2: Parts Reservation

| Field | Value |
|---|---|
| **Status** | Design — awaiting human review |
| **Feature** | Feature 2 — Parts Reservation |
| **Date** | 2026-11-23 |
| **Scope** | Planning document only. No implementation code. |

---

## Part 1 — Memory Taxonomy & Scoping Blueprint

### 1.1 The Four Memory Boxes

| Memory Type | What it holds | Storage backend | Namespace | Lifetime |
|---|---|---|---|---|
| **Semantic** | Stable facts: conventions, decisions, formulas, status values | Repo-committed Markdown files | `repo:serviceforge` | Permanent (until a decision is revised) |
| **Procedural** | How-to knowledge: skill sequences, validation rules, build patterns | `.claude/skills/*/SKILL.md`, MCP tool definitions | `repo:serviceforge:skills` | Permanent (evolves with the codebase) |
| **Episodic** | Past-run events: decisions made, bugs found, interventions logged | Vector DB (conceptual); `pipeline/decisions/` as boilerplate substitute | `repo:serviceforge:{branch}:{env}` | Long-lived (summarised after each feature completes) |
| **Short-Term / Working** | Active task state: in-flight reasoning, current request data, intermediate outputs | LLM context window | `session:{timestamp}:{agent-id}` | Ephemeral — cleared when the session ends |

---

### 1.2 Feature 2 Context Mapping

#### Semantic Memory — `repo:serviceforge`

Backed by: `pipeline/decisions/feature-1-decisions.md`, `pipeline/decisions/feature-2-decisions.md` (once written), `AGENTS.md`, `.github/copilot-instructions.md`.

| Fact | Source | Why it is semantic |
|---|---|---|
| `TRAVEL_BUFFER_MINUTES = 45` | `feature-1-decisions.md` | A committed constant that every downstream feature must respect; it does not change per session |
| Overlap detection compares exact start times only (live bug) | `feature-1-decisions.md` | A known defect any feature building on scheduling must be aware of |
| Net available stock = physical quantity − sum of ACTIVE reservation quantities | `requirements.md` AC-1 | The authoritative formula for all inventory calculations in Feature 2 |
| Job status values: SCHEDULED, CANCELLED (defined; no cancellation endpoint yet) | Codebase + `requirements.md` | Stable enum facts; a future feature will add the endpoint, but the status value is fixed |
| Partial-stock policy is `[OPEN BUSINESS QUESTION]` | `requirements.md`, `design-review.md` | The absence of a decision is itself a fact worth retaining — prevents any agent from inventing a default |
| REST conventions: `ResponseEntity<T>`, `ApiError` for 400/404/422 | `AGENTS.md`, `build-code-skill` | Stack-wide conventions that govern every endpoint Feature 2 adds |
| Feature 2 is out of scope for: backorders, cancellation endpoint, stock consumption | `requirements.md` Section 1 | Explicit scope boundaries prevent scope creep in later agent runs |

**Write policy:** a human commits a new entry to the decisions file after each approved decision. No agent writes to semantic memory autonomously.

**Read policy:** loaded at agent startup via the Bootstrap JIT stage (see §1.5). Agents do not re-read the decisions file mid-task unless they encounter a gap.

---

#### Procedural Memory — `repo:serviceforge:skills`

Backed by: `.claude/skills/build-code-skill/SKILL.md`, `.claude/skills/migration-safety-skill/SKILL.md`, `.claude/skills/spec-generation-skill/SKILL.md`.

| Procedure | Skill / source | Feature 2 application |
|---|---|---|
| How to extend the MockDataStore with a new model | `migration-safety-skill` | Adding `PartInventory` and `Reservation` collections without breaking existing `Job` and `Technician` consumers |
| How to structure a Spring Boot service with constructor injection | `build-code-skill` | `ReservationService` and `ReservationCritic` wiring |
| How to write a REST controller returning `ResponseEntity<T>` | `build-code-skill` | `ReservationController` endpoints (`POST`, `GET`, `DELETE`) |
| How to turn a feature intent into a requirements spec | `spec-generation-skill` | Used by the BA agent in the Requirements phase |
| How the BA → Developer → Tester pipeline sequences | `pipeline/orchestration.md` | Governs which agent runs when and what it must not skip |

**Write policy:** a new skill is written and committed when a reusable how-to pattern is identified that will recur across features. Skills are never written mid-task to avoid contaminating the current session's context.

**Read policy:** loaded on demand (Task-time JIT stage) when the agent's current step matches the skill's trigger condition. The `migration-safety-skill` loads whenever a model field is added or removed.

---

#### Episodic Memory — `repo:serviceforge:{branch}:{env}`

Backed by: `pipeline/decisions/feature-N-decisions.md` (boilerplate substitute for Vector DB); conceptually a Chroma or pgvector store in a production system.

| Event | Namespace | Importance weight | Retained or discarded |
|---|---|---|---|
| BA agent invented partial-stock policy (all-or-nothing) without repository evidence — corrected by human intervention 3 | `serviceforge:day2-kata2-requirements:dev` | High | **Retained** — pattern of AI inventing policy; use to prime future BA runs with a "check repo evidence first" instruction |
| BA agent generated 10 human interventions in one requirements pass | `serviceforge:day2-kata2-requirements:dev` | Medium | **Retained** (summarised) — signals that policy-sensitive features need a tighter BA prompt |
| Soft-reset of the original `memory-architecture.md` commit | `serviceforge:day2-kata2-requirements:dev` | Low | **Discarded** — a git operation, not a design decision |
| `ReservationCritic` exception handling improved from 500 to structured 422 (design-review finding 2) | `serviceforge:day3-architecture-planning:dev` | High | **Retained** — becomes a standing rule: critic exceptions must return structured errors, not 500s |
| `design-review.md` verdict: Needs changes — partial-stock policy is the open gate | `serviceforge:day3-architecture-planning:dev` | High | **Retained** — blocks T-02; must surface when Build agent reaches that task |
| Four planning deliverables committed as `Day3 architecture planning- #4` | `serviceforge:day3-architecture-planning:dev` | Low | **Discarded** — git history carries this; not a design fact |

**Write policy:** written at session end by a summarization step. Raw agent output (tool call logs, intermediate reasoning) is never written. Only the final decision, correction, or outcome is extracted and stored.

**Read policy:** queried by similarity search before a new task starts. The query is the task description; the top-k results are injected into the context window up to the On-Demand token budget (see §2.2).

---

#### Short-Term / Working Memory — `session:{timestamp}:{agent-id}`

Backed by: the LLM context window. Nothing in this box survives session end.

| Element | Feature 2 example | Discard rule |
|---|---|---|
| Active task state | Build agent is currently implementing T-02; T-01 is complete | Discarded when the agent session ends or the task completes |
| In-flight reservation request | `{jobId: J-42, partId: P-100, qty: 1, requestId: uuid-abc}` | Discarded after the service method returns |
| `ReservationCritic` result for the current call | Critic passed; proceeding to stock check | Discarded after the reservation is committed or rejected |
| Current test run stdout | `Tests run: 6, Failures: 0` | Discarded immediately — the pass/fail outcome is what matters, not the raw output |
| Last file read in the current turn | `requirements.md` lines 40–55 | Discarded after the agent uses the fact it needed |

**Write policy:** written continuously and automatically by the LLM as it processes each turn. No explicit write action required.

**Read policy:** always available within the session. Injected into the prompt implicitly. Subject to the hard token ceiling (§2.2).

---

### 1.3 Namespace Scoping

**Format:** `{repo}:{branch}:{env}`

| Scope | Example value | Used for |
|---|---|---|
| Repo-wide | `serviceforge` | Semantic and procedural facts that apply regardless of branch |
| Branch-scoped | `serviceforge:day3-architecture-planning` | Episodic events tied to this feature's planning branch |
| Environment-scoped | `serviceforge:day3-architecture-planning:dev` | Dev-only episodic facts (e.g., test failures in local runs vs. CI) |
| Session-scoped | `session:20261123T0900:ba-agent` | Short-term working state; never persisted |

**Scoping rule:** when reading, an agent searches from narrowest to widest scope and stops at the first match. This prevents a dev-only episodic event (e.g., a flaky local test) from polluting the repo-wide semantic store.

---

### 1.4 Store Selection & Justification

| Memory type | Selected store | Justification | Rejected alternative |
|---|---|---|---|
| Semantic | Repo-committed Markdown (`pipeline/decisions/`) | Versioned, human-readable, survives restarts, requires no infrastructure; aligns with the boilerplate's no-database constraint | A SQL table of key-value pairs — adds infra without benefit for a training system |
| Procedural | `.claude/skills/*/SKILL.md` | Follows the Claude Agent Skills format; loadable on demand via the Skill tool; structured for reuse across features | Inline prompts per agent — not reusable, not versionable, bloats agent definitions |
| Episodic | Vector DB (Chroma / pgvector in production); `pipeline/decisions/` as boilerplate substitute | Similarity search is the right retrieval model for "what happened last time I did something like this"; the decisions file is a readable approximation | Full conversation history replay — token-prohibitive; retrieves noise with signal |
| Short-term | LLM context window | Native to the model; zero latency; no implementation required | External session store (Redis) — overengineered for a training boilerplate |

---

### 1.5 Write / Read Path Policies

```
Write paths:
  Semantic    ← human commits a decision file entry after an approved decision
  Procedural  ← developer commits a new SKILL.md when a reusable pattern is identified
  Episodic    ← summarisation step runs at session end; extracts decisions and outcomes only
  Short-term  ← written automatically by the LLM during task execution

Read paths (JIT loading stages):
  Stage 1 — Bootstrap (always loaded, ≤150 tokens):
    AGENTS.md summary, current branch decisions file, active open questions from requirements.md

  Stage 2 — Task-time (loaded when task type matches, ≤250 tokens):
    Feature spec (requirements.md), ADR (architecture-adr.md), implementation plan task being built,
    relevant skill (build-code-skill or migration-safety-skill)

  Stage 3 — On-demand (loaded only if the agent encounters a gap, ≤100 tokens):
    Feature 1 decisions (if scheduling dependency is relevant),
    top-2 episodic results for the current task description,
    full AC list if a test agent needs to verify a specific criterion
```

---

## Part 2 — Retain / Discard Policy & Token Budgeting

### 2.1 Retain / Discard Rules

**RETAIN to long-term memory:**

| What | Rule | Feature 2 example |
|---|---|---|
| Decisions with rationale | Retain when a human approves a business or design decision and records why | Partial-stock policy decision (once made) with the reason it was deferred |
| Open questions with status | Retain while unresolved; promote to decision once answered | `[OPEN BUSINESS QUESTION]` partial-stock policy, flagged across ADR + design-review + implementation-plan |
| Test outcomes per AC | Retain pass/fail per AC reference after the tester agent runs | AC-15 (concurrent reservation): PASS — two threads, one success, zero oversubscription |
| Error patterns with root cause | Retain when a bug reveals a structural risk future agents should know | `ReservationCritic` exception → 500 (fixed to 422); retain as a pattern rule |
| Human interventions on AI output | Retain summarised (not verbatim) when they reveal a systematic AI over-reach | BA agent invented partial-stock policy — retain as "BA agents on this codebase tend to invent policy; require repo evidence" |

**DISCARD (never write to long-term memory):**

| What | Reason |
|---|---|
| Raw stdout / stderr from builds or tests | Noise; the pass/fail outcome is what matters |
| Intermediate reasoning chains ("I think I should…") | Ephemeral deliberation; irrelevant after the decision is made |
| Duplicate facts already in the semantic store | Prevents the same fact from consuming token budget twice |
| Which file was last read in a session | Operational detail; not a design fact |
| Git operations (commits, resets, branch names) | Git history is authoritative; the memory store should not duplicate it |
| Assumptions that were never confirmed | Record them as open questions, not as retained facts |

---

### 2.2 Token Ceiling & Budget Allocation

**Hard ceiling: 500 tokens total memory injection per agent invocation.**

| Stage | Token budget | Contents |
|---|---|---|
| Bootstrap | ≤ 150 tokens | AGENTS.md summary (~50), active decisions (~50), open questions list (~50) |
| Task-time | ≤ 250 tokens | Relevant feature spec section (~100), ADR decision block (~80), current task row from implementation plan (~70) |
| On-demand | ≤ 100 tokens | Top-2 episodic results (~60), specific AC text (~40) |
| **Total** | **≤ 500 tokens** | Never exceed this ceiling; drop on-demand items first if budget is tight |

**Token budget enforcement rules:**

1. Each memory item is tagged with an estimated token cost before injection.
2. If the total exceeds 500, on-demand items are dropped first (lowest importance weight first).
3. If still over budget after dropping on-demand items, task-time items are truncated to their first sentence.
4. Bootstrap items are never truncated — they represent the minimum viable context.
5. Short-term working memory is excluded from this ceiling; it is managed by the model's context window natively.

---

### 2.3 Summarization Techniques

**Hierarchical consolidation** (applied at feature completion):
After a feature's planning and build phases complete, all episodic events for that feature are consolidated into a single decisions file entry per decision. Individual session events are discarded; only the outcome and rationale survive. Example: the ten BA interventions on Feature 2 collapse to one entry: "BA agents on policy-sensitive features require a 'check repo evidence' constraint in the initial prompt."

**Importance weighting** (applied at session end before episodic write):
Each event is scored on two axes:
- **Cross-feature impact** (high if future features will need this fact; low if it only affected this session)
- **Surprise factor** (high if it contradicts an assumption; low if it confirmed expected behavior)

Events scoring high on either axis are retained; events scoring low on both are discarded.

| Event | Cross-feature | Surprise | Decision |
|---|---|---|---|
| `TRAVEL_BUFFER_MINUTES = 45` | High | Low | Retain (already in semantic store) |
| BA agent invented partial-stock policy | High | High | Retain — systemic pattern |
| Soft reset of a commit | Low | Low | Discard |
| Critic exception → 422 fix | High | Medium | Retain — becomes a standing rule |

**Progressive disclosure** (applied at read time):
Memory is loaded in stages (Bootstrap → Task-time → On-demand) rather than all at once. An agent that never encounters a gap in its current task never loads on-demand memory, keeping the injected token count near the Bootstrap floor (~150 tokens) rather than at the ceiling (500 tokens). This prevents context rot on routine tasks while ensuring retrieval depth is available when needed.
