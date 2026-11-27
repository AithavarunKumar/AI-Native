# Rule: No-Overlap Booking

**Status:** Active — added after the Feature 1 bug was fixed.

## The rule

Any code that checks whether a technician is available for a time slot **must** use a proper interval-overlap test, not a point-in-time comparison. It **must** also apply the `TRAVEL_BUFFER_MINUTES` constant from `TechnicianAvailabilityService` to both the existing job and the new job.

### Correct overlap formula

Two time slots conflict when both of the following hold:

```
newStart         < existingEnd + TRAVEL_BUFFER_MINUTES
existingStart    < newEnd     + TRAVEL_BUFFER_MINUTES
```

This is the standard half-open interval overlap test: `[a, b)` intersects `[c, d)` when `a < d && c < b`, with each `b` and `d` extended by the travel buffer.

### What is prohibited

- Checking only `newStart == existingStart` (exact start-time match only). This is the bug that was present in Feature 1 and must never be reintroduced.
- Checking only `newStart < existingEnd` without the buffer. This ignores the travel-time constraint defined in `pipeline/decisions/feature-1-decisions.md`.
- Using any hardcoded integer instead of `TRAVEL_BUFFER_MINUTES`. If the buffer changes, one constant changes — not scattered literals.

## Why this rule exists

Feature 1 shipped with an exact-start-time check. Because the check was too narrow, two jobs with different-but-overlapping start times (e.g. `09:00–11:00` and `10:00–12:00`) were silently double-booked. The bug was documented in both the feature spec and the decision log but was never prevented from being re-introduced. This rule is that prevention.

## Scope

This rule applies to every agent (ba-agent, developer-agent, tester-agent, bug-fixer-agent) and to any human contributor. It is enforced by the tester-agent's Definition-of-Done checklist on any feature that touches job booking or technician scheduling.

## References

- Original bug: `TechnicianAvailabilityService.bookJob()` — the `KNOWN ISSUE` comment that is now removed
- Decision log: `pipeline/decisions/feature-1-decisions.md` — travel-buffer decision
- Feature spec: `pipeline/features/feature-1-technician-availability.md` — Definition of Done that this rule makes objectively testable
