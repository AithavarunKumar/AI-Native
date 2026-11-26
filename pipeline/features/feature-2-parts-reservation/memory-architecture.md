# Memory Architecture — Feature 2: Parts Reservation

**Framework:** see `.claude/skills/memory-management-skill/SKILL.md` for the four memory types, token budget, and retain/discard rules. This file records only the Feature 2-specific facts that belong in each store.

## Semantic memory — facts every agent loads for Feature 2

| Fact | Source |
|---|---|
| `TRAVEL_BUFFER_MINUTES = 45` | `pipeline/decisions/feature-1-decisions.md` |
| Overlap detection compares exact start times only (live bug) | `pipeline/decisions/feature-1-decisions.md` |
| Net available stock = `physicalQty − sum(ACTIVE reservation quantities)` | `requirements.md` AC-1 |
| `CANCELLED` status exists; no cancellation endpoint yet | Codebase |
| Partial-stock policy is `[OPEN BUSINESS QUESTION]` | `requirements.md` Section 7 |
| Feature 2 is out of scope for: backorders, cancellation endpoint, stock consumption | `requirements.md` Section 1 |

## Episodic memory — retain from this feature

| Event | Importance | Decision |
|---|---|---|
| BA agent invented partial-stock policy without repo evidence | High | Retain — systemic pattern; prime future BA runs with "check repo evidence first" |
| `ReservationCritic` exception → structured 422 (not 500) | High | Retain — becomes a standing rule for all future critic components |
| Design verdict: Needs changes — partial-stock is the open gate | High | Retain — blocks T-02 until recorded in `pipeline/decisions/feature-2-decisions.md` |

## Critical gate

T-02 (`ReservationService`) must not start until the partial-stock policy is answered and recorded in `pipeline/decisions/feature-2-decisions.md`.
