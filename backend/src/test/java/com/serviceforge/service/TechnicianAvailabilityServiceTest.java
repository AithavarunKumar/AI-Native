package com.serviceforge.service;

import com.serviceforge.data.MockDataStore;
import com.serviceforge.model.Job;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * Covers the happy path, exact start-time conflicts (regression guard), genuine interval
 * overlaps with different start times, and the 45-minute travel-buffer boundary.
 */
class TechnicianAvailabilityServiceTest {

    private MockDataStore dataStore;
    private TechnicianAvailabilityService service;

    @BeforeEach
    void setUp() {
        dataStore = new MockDataStore();
        dataStore.seed();
        service = new TechnicianAvailabilityService(dataStore);
    }

    @Test
    void booksAJobForAnAvailableTechnician() {
        LocalDateTime start = LocalDateTime.now().withHour(16).withMinute(0).withSecond(0).withNano(0);
        LocalDateTime end = start.plusHours(1);

        Job job = service.bookJob(1L, "New Customer", start, end);

        assertEquals("New Customer", job.getCustomerName());
        assertEquals(1L, job.getTechnicianId());
    }

    @Test
    void rejectsABookingAtAnIdenticalStartTimeAsAnExistingJob() {
        LocalDateTime start = LocalDateTime.now().withHour(9).withMinute(0).withSecond(0).withNano(0);
        LocalDateTime end = start.plusHours(1);
        // Technician 1 already has a seeded job starting at 09:00 (see MockDataStore.seed()).

        assertThrows(IllegalStateException.class, () -> service.bookJob(1L, "Conflicting Customer", start, end));
    }

    @Test
    void throwsForAnUnknownTechnician() {
        LocalDateTime start = LocalDateTime.now().plusDays(1);
        LocalDateTime end = start.plusHours(1);

        assertThrows(IllegalArgumentException.class, () -> service.bookJob(999L, "Nobody", start, end));
    }

    @Test
    void rejectsABookingThatOverlapsAnExistingJobFromBelow() {
        // Technician 1 has a seeded job 09:00–11:00. A new job at 10:00–12:00 overlaps it.
        LocalDateTime start = LocalDateTime.now().withHour(10).withMinute(0).withSecond(0).withNano(0);
        LocalDateTime end = start.plusHours(2);

        assertThrows(IllegalStateException.class, () -> service.bookJob(1L, "Overlapping Customer", start, end));
    }

    @Test
    void rejectsABookingThatConflictsOnlyViaTheTravelBuffer() {
        // Technician 1 has 09:00–11:00. The travel buffer adds 45 min → effective end 11:45.
        // A new job at 11:30 starts inside the buffer window and must be rejected.
        LocalDateTime start = LocalDateTime.now().withHour(11).withMinute(30).withSecond(0).withNano(0);
        LocalDateTime end = start.plusHours(1);

        assertThrows(IllegalStateException.class, () -> service.bookJob(1L, "Buffer-Clash Customer", start, end));
    }

    @Test
    void acceptsABookingStartingExactlyAtEffectiveEndOfPreviousJob() {
        // Technician 1 has 09:00–11:00 + 45 min buffer = effective end 11:45.
        // A new job starting exactly at 11:45 must be accepted (boundary is exclusive).
        LocalDateTime start = LocalDateTime.now().withHour(11).withMinute(45).withSecond(0).withNano(0);
        LocalDateTime end = start.plusHours(1);

        Job job = service.bookJob(1L, "Post-Buffer Customer", start, end);

        assertEquals("Post-Buffer Customer", job.getCustomerName());
    }
}
