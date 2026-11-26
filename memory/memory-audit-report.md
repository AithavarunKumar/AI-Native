# Memory Management Pipeline — Audit Report

| Field | Value |
|---|---|
| **Feature** | Feature 2 — Parts Reservation |
| **Kata** | Memory Management in the Pipeline (Design → Build) |
| **Validated** | 2026-11-25T12:19:58Z |
| **Branch** | day4-memory-architecture |
| **Script** | `memory/validate.js` (run via `node validate.js`) |
| **Exit code** | 0 (all checks passed) |

---

## Part 1 — Write Path & Store Integration

### B1 Requirements vs. Actual Implementation

| # | B1 Requirement | Implementation | Validation Evidence | Status |
|---|---|---|---|---|
| W1 | Non-blocking post-turn write hook | `enqueueMemoryWrite` defers via `setImmediate` | `hookResult=null` immediately after enqueue, then `stored=true id=8` after 300ms | **PASS** |
| W2 | Retain/Discard filter — retain semantic, procedural, episodic_decision, open_question | `classify()` in `write_path.js` checks `type_tag` and `assumption_status` | 7 of 11 seeds retained | **PASS** |
| W3 | Discard git_operation | `DISCARD_TAGS` set includes `git_operation` | 2 git_operation seeds discarded | **PASS** |
| W4 | Discard raw output | `DISCARD_TAGS` includes `raw_output` | 1 raw_output seed discarded | **PASS** |
| W5 | Discard unconfirmed assumptions | `classify()` checks `assumption_status === 'unconfirmed'` | 1 unconfirmed assumption discarded | **PASS** |
| W6 | Provenance metadata on every stored row | INSERT always includes `namespace`, `type_tag`, `source_task`, `status`, `timestamp` | 7 rows checked, 0 incomplete | **PASS** |
| W7 | Persist to PostgreSQL + pgvector | `pg` pool to `pgvector/pgvector:pg16` on port 5433; `vector(1536)` column in schema | Rows inserted and queryable | **PASS** |
| W8 | Seed verified Feature 1 decisions | `memory_store.json` entries sourced from `feature-1-decisions.md` | TRAVEL_BUFFER_MINUTES=45 (id=1), overlap bug (id=2) stored | **PASS** |
| W9 | Write + read round-trip | Write via `enqueueMemoryWrite`, then `retrieve()` | id=9 written, retrieved with stage=bootstrap relevance=1.000 | **PASS** |

### Discard Evidence

| Seed content (truncated) | type_tag | Discard reason |
|---|---|---|
| Soft-reset of original memory-architecture.md commit | git_operation | type_tag 'git_operation' is in discard list |
| Four planning deliverables committed as 'Day3...' | git_operation | type_tag 'git_operation' is in discard list |
| Tests run: 6, Failures: 0, Errors: 0, Skipped: 0 | raw_output | type_tag 'raw_output' is in discard list |
| Assumed all-or-nothing stock policy before design review | semantic | assumption_status is unconfirmed |

---

## Part 2 — Read Path & Just-in-Time Memory Retrieval

### B1 Requirements vs. Actual Implementation

| # | B1 Requirement | Implementation | Validation Evidence | Status |
|---|---|---|---|---|
| R1 | Accept current Feature 2 task as query | `retrieve(query, options)` in `read_path.js` | Called with feature2Task string, returned 6 memories | **PASS** |
| R2 | Retrieve from correct namespace | SQL `WHERE namespace='repo:{repo}' OR namespace LIKE '{repo}:%'` | Scope = `[repo:serviceforge, serviceforge:*]` | **PASS** |
| R3 | Relevance ranking | Keyword overlap: `matchedQueryTerms / totalQueryTerms` | Scores range 0.042–0.375; highest-scoring items selected first per stage | **PASS** |
| R4 | Recency as tiebreaker | Secondary sort by `timestamp DESC` | Episodic decisions from day3 (newer) ranked before day2 when relevance ties | **PASS** |
| R5 | Bootstrap budget ≤ 150 tokens | Stage 1 ceiling enforced with `continue` guard | **129 / 150 tokens used** | **PASS** |
| R6 | Task-time budget ≤ 250 tokens | Stage 2 ceiling enforced | **227 / 250 tokens used** | **PASS** |
| R7 | On-demand budget ≤ 100 tokens | Stage 3 ceiling enforced; only fires when relevance > 0 | **41 / 100 tokens used** | **PASS** |
| R8 | Total budget ≤ 500 tokens | Outer guard on all stage loops | **397 / 500 tokens used** | **PASS** |
| R9 | Context injection format | `formatContext()` renders stage/type/namespace header + content | Non-empty string with "Injected Memory Context" header | **PASS** |
| R10 | Namespace isolation — cross-repo exclusion | `extractRepo()` strips repo prefix; SQL restricts to that prefix only | `other-project:main:dev` memory inserted directly, 0 items leaked into serviceforge retrieval | **PASS** |
| R11 | Foreign row not fetched | SQL WHERE clause never matches `other-project:*` | rows fetched = 9 before and after isolation insert | **PASS** |

### Token Budget Actual Usage (Feature 2 task)

```
Bootstrap : 129 / 150  tokens  (86% of stage budget)
Task-time : 227 / 250  tokens  (91% of stage budget)
On-demand :  41 / 100  tokens  (41% of stage budget)
─────────────────────────────
Total     : 397 / 500  tokens  (79% of total budget)
```

### Retrieved Memories — Feature 2 Task

Query: *"Feature 2 task: implement parts reservation service. Check net available stock formula. Active reservations reduce inventory. Partial stock policy is unresolved. Respect travel buffer and technician scheduling."*

| Stage | id | Relevance | Tokens | Type | Namespace |
|---|---|---|---|---|---|
| bootstrap | 3 | 0.375 | 56 | semantic | repo:serviceforge |
| bootstrap | 4 | 0.333 | 73 | open_question | repo:serviceforge |
| task-time | 7 | 0.250 | 63 | episodic_decision | serviceforge:day3-architecture-planning:dev |
| task-time | 5 | 0.167 | 94 | episodic_decision | serviceforge:day2-kata2-requirements:dev |
| task-time | 6 | 0.042 | 70 | episodic_decision | serviceforge:day3-architecture-planning:dev |
| on-demand | 9 | 0.208 | 41 | semantic | repo:serviceforge |

Excluded (3 rows not selected):
- id=1: TRAVEL_BUFFER seed (relevance 0.125, 79t — bootstrap budget already filled)
- id=2: Overlap bug seed (relevance 0.042, 123t — too large for remaining bootstrap budget)
- id=8: Hook test event (relevance 0.000 — excluded from on-demand by zero-relevance guard)

---

## Part 3 — Design-to-Build Gaps

### Namespace Isolation Validation

The B1 design defines namespace scoping as `{repo}:{branch}:{env}` with the rule "search from narrowest to widest scope and stop at the first match." The implementation interprets this for context retrieval (not point lookups) as:

- **Implemented:** SQL prefix filter `namespace LIKE 'serviceforge:%'` restricts to the repo. Stage assignment (bootstrap vs. task-time) provides implicit narrowing — semantic facts from `repo:serviceforge` load first, branch-specific episodic facts load in task-time.
- **Deviation:** The B1 "stop at first match" rule is a point-lookup semantic. Retrieval for context injection needs *all* relevant memories, not just the nearest one, so a pure narrowest-wins approach was not implemented.
- **Impact:** Low. The narrowing intent (prevent cross-repo leakage) is fully preserved; the aggregation across branches within the same repo is intentional.

### Known Limitations

| Limitation | B1 Requirement | Gap | Severity |
|---|---|---|---|
| No real embedding/vector search | B1 §1.4 — similarity search for episodic retrieval | Keyword overlap score used instead. No semantic similarity. Exact word matches only; plurals and camelCase are distinct tokens. | Medium |
| No stemming | Relevance scoring | "reservation" and "reservations" are different terms; camelCase types like "ReservationCritic" are not split | Low |
| Token counting is approximate | B1 §2.2 — accurate token cost per item | 1 token ≈ 4 chars; actual count ±20% | Low |
| On-demand stage fires proactively | B1 §1.5 — on-demand fires only when agent encounters a gap | Stage 3 fires on every retrieval call; it just returns empty if nothing has relevance > 0 | Low |
| Task-time items not truncated to first sentence when over budget | B1 §2.2 rule 3 | Implementation skips oversized items rather than truncating | Low |
| `embedding` column is NULL | pgvector column provisioned | Vector population requires an embedding API (Part 2 of design evolution) | Medium |
| pg_hba.conf uses MD5 (not SCRAM) | Not a B1 concern | A local native PostgreSQL on port 5432 required moving the container to 5433 and switching to MD5 auth | Infrastructure only |

---

## Summary

| Part | Checks | Passed | Failed |
|---|---|---|---|
| Part 1 — Write Path | 10 | 10 | 0 |
| Part 2 — Read Path | 13 | 13 | 0 |
| **Total** | **23** | **23** | **0** |

All 23 checks passed on the actual `node validate.js` run dated 2026-11-25T12:19:58Z.

---

## How to Reproduce

```bash
# 1. Start PostgreSQL + pgvector (once per machine restart)
docker compose up -d        # from project root

# 2. Install dependency (once)
cd memory
npm install

# 3. Part 1 only (write path)
node write_path.js

# 4. Full validation — Parts 1 + 2 + evidence for Part 3
node validate.js
```

Environment: Node.js v24.19.0, pg 8.23.1, pgvector/pgvector:pg16, Docker Compose v5.7.1, Windows 11.
