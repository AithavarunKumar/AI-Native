# Feature 1 — Decision Log

Decisions made while building Feature 1 that later features may need to retrieve. This file exists so a later feature's memory-retrieval step has something concrete to pull a single fact from, instead of needing the entire build history in context.

## Decision: standard travel buffer per job is 45 minutes

**What was decided:** every booked job reserves not just its own start/end time on a technician's calendar, but an additional 45-minute travel buffer, to account for the technician getting to the next job. This is encoded as `TRAVEL_BUFFER_MINUTES = 45` in `TechnicianAvailabilityService`.

**Why it matters beyond Feature 1:** this buffer is what actually limits how many jobs — and, later, how many parts-reservations tied to those jobs — can realistically be scheduled for one technician in a day. Anything built on top of the calendar that reasons about "how many jobs can fit today" needs this number, not a guess.

**Where it lives in code:** `backend/src/main/java/com/serviceforge/service/TechnicianAvailabilityService.java`, `TRAVEL_BUFFER_MINUTES` constant.

## Decision: overlap detection uses full interval logic including the travel buffer (fixed)

**Original (buggy) behaviour:** the overlap check in `bookJob(...)` only rejected a new booking if its start time exactly matched an existing booking's start time. Two jobs with different-but-overlapping start times were silently accepted.

**Fixed behaviour (applied by bug-fixer-agent):** the check now uses a proper half-open interval test with the travel buffer applied to both sides:

```
newStart < existingEnd + TRAVEL_BUFFER_MINUTES  &&  existingStart < newEnd + TRAVEL_BUFFER_MINUTES
```

A booking is rejected with HTTP 409 whenever the above is true for any existing booking on the same technician.

**Why it matters for later features:** anything reasoning about "a technician's booked slots never overlap" can now rely on that invariant. The travel-buffer constant (`TRAVEL_BUFFER_MINUTES = 45`) is the authoritative value — do not hardcode a different number anywhere.

**Standing rule:** `pipeline/rules/no-overlap-booking.md` enforces this pattern and prevents exact-start-time checks from being re-introduced.
