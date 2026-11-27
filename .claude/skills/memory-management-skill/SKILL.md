---
name: memory-management-skill
description: Use when any agent needs to decide what to load into context, what to retain after a session, or how to structure pipeline/decisions/ entries. Covers the four memory types, token budget, and retain/discard rules for all features.
---

# Memory Management Skill

## Four memory types

| Type | Backed by | Lifetime | Write rule |
|---|---|---|---|
| **Semantic** | `pipeline/decisions/*.md`, `AGENTS.md` | Permanent | Human commits after an approved decision |
| **Procedural** | `.claude/skills/*/SKILL.md` | Permanent | Developer commits when a reusable pattern is identified |
| **Episodic** | `pipeline/decisions/` (boilerplate); vector DB in production | Long-lived | Summarisation step at session end — decisions and outcomes only, not raw output |
| **Short-term** | LLM context window | Session only | Written automatically; never persisted |

## Context loading order (JIT stages)

| Stage | Token budget | What to load |
|---|---|---|
| Bootstrap | ≤ 150 | `AGENTS.md` summary, current decisions file, active open questions |
| Task-time | ≤ 250 | Feature spec section, ADR decision block, relevant skill |
| On-demand | ≤ 100 | Top-2 episodic results for current task, specific AC text if needed |
| **Hard ceiling** | **500 total** | Drop on-demand first; truncate task-time to first sentence if still over |

## Retain / discard rules

**Retain:** decisions with rationale, unresolved open questions (until answered), error patterns with root cause, human corrections that reveal a systematic AI over-reach.

**Discard:** raw build/test stdout, intermediate reasoning chains, git operations (branch names, commit hashes), duplicate facts already in semantic memory, unconfirmed assumptions.
