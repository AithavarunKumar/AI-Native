package com.serviceforge.service;

import com.serviceforge.data.MockDataStore;
import com.serviceforge.model.Job;
import com.serviceforge.model.JobStatus;
import com.serviceforge.model.Reservation;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.*;

class PartInventoryServiceTest {

    private MockDataStore dataStore;
    private PartInventoryService service;
    private Long job1;
    private Long job2;
    private Long job3;
    private Long job4;

    @BeforeEach
    void setUp() {
        dataStore = new MockDataStore();
        dataStore.seed();
        service = new PartInventoryService(dataStore);
        var jobs = dataStore.getAllJobs();
        job1 = jobs.get(0).getId();
        job2 = jobs.get(1).getId();
        job3 = jobs.get(2).getId();
        job4 = jobs.get(3).getId();
    }

    @Test // AC-1
    void netAvailableIsPhysicalMinusActiveReservations() {
        service.reserve("CMP-CLUTCH", job1, 1);

        var stock = service.getPartWithStock("CMP-CLUTCH").orElseThrow();

        assertEquals(3, stock.getQuantityOnHand());
        assertEquals(1, stock.getReserved());
        assertEquals(2, stock.getAvailable());
    }

    @Test // AC-2
    void reservationSucceedsWhenFullStockAvailable() {
        Reservation res = service.reserve("CMP-CLUTCH", job1, 2);

        assertNotNull(res.getId());
        assertEquals("CMP-CLUTCH", res.getSku());
        assertEquals(job1, res.getJobId());
        assertEquals(2, res.getQuantity());
        assertEquals(Reservation.ReservationStatus.ACTIVE, res.getStatus());
    }

    @Test // AC-4 — insufficient stock
    void throwsWithShortageDetailsWhenInsufficientStock() {
        IllegalStateException ex = assertThrows(IllegalStateException.class,
                () -> service.reserve("CMP-CLUTCH", job1, 10));

        String msg = ex.getMessage();
        assertTrue(msg.contains("CMP-CLUTCH"), "Should name the part SKU");
        assertTrue(msg.contains("10"), "Should include requested quantity");
        assertTrue(msg.contains("3"), "Should include available quantity");
    }

    @Test // AC-4 — zero stock case
    void throwsWhenZeroStockAvailable() {
        service.reserve("CMP-CLUTCH", job1, 3);

        assertThrows(IllegalStateException.class,
                () -> service.reserve("CMP-CLUTCH", job2, 1));
    }

    @Test // AC-5
    void failedReservationLeavesInventoryUnchanged() {
        try {
            service.reserve("CMP-CLUTCH", job1, 100);
        } catch (IllegalStateException ignored) {}

        var stock = service.getPartWithStock("CMP-CLUTCH").orElseThrow();
        assertEquals(3, stock.getAvailable(), "Stock must be unchanged after failed reservation");
        assertEquals(0, service.getReservationsForJob(job1).size(), "No reservation record written");
    }

    @Test // AC-6
    void duplicateReservationReturnsExistingWithoutDoubleDecrement() {
        Reservation first = service.reserve("CMP-CLUTCH", job1, 1);
        Reservation second = service.reserve("CMP-CLUTCH", job1, 1);

        assertEquals(first.getId(), second.getId(), "Same reservation should be returned");

        var stock = service.getPartWithStock("CMP-CLUTCH").orElseThrow();
        assertEquals(2, stock.getAvailable(), "Stock decremented once, not twice");
    }

    @Test // AC-7
    void conflictingRetryRejected() {
        service.reserve("CMP-CLUTCH", job1, 1);

        assertThrows(IllegalStateException.class,
                () -> service.reserve("CMP-CLUTCH", job1, 2));

        var stock = service.getPartWithStock("CMP-CLUTCH").orElseThrow();
        assertEquals(2, stock.getAvailable(), "Stock unchanged after conflicting retry rejection");
    }

    @Test // AC-8 — unknown job
    void unknownJobRejected() {
        assertThrows(IllegalArgumentException.class,
                () -> service.reserve("CMP-CLUTCH", 9999L, 1));

        assertEquals(3, service.getPartWithStock("CMP-CLUTCH").orElseThrow().getAvailable(),
                "Inventory unchanged for unknown job");
    }

    @Test // AC-8 — unscheduled job
    void unscheduledJobRejected() {
        LocalDateTime t = LocalDateTime.now().plusDays(1);
        Job cancelled = new Job(99L, 1L, "Cancelled Customer", t, t.plusHours(1), JobStatus.CANCELLED);
        dataStore.save(cancelled);

        assertThrows(IllegalStateException.class,
                () -> service.reserve("CMP-CLUTCH", 99L, 1));

        assertEquals(3, service.getPartWithStock("CMP-CLUTCH").orElseThrow().getAvailable(),
                "Inventory unchanged for unscheduled job");
    }

    @Test // AC-9
    void unknownPartThrows() {
        assertThrows(IllegalArgumentException.class,
                () -> service.reserve("NO-SUCH-PART", job1, 1));
    }

    @Test // AC-10 — release restores stock
    void releaseRestoresStock() {
        service.reserve("CMP-CLUTCH", job1, 2);

        assertEquals(1, service.getPartWithStock("CMP-CLUTCH").orElseThrow().getAvailable());

        int released = service.release(job1);

        assertEquals(1, released, "One reservation should be released");
        assertEquals(3, service.getPartWithStock("CMP-CLUTCH").orElseThrow().getAvailable(),
                "Stock fully restored after release");
    }

    @Test // AC-10 — double release idempotent
    void secondReleaseIsIdempotent() {
        service.reserve("CMP-CLUTCH", job1, 1);
        service.release(job1);

        int secondRelease = service.release(job1);

        assertEquals(0, secondRelease, "Second release returns 0 (nothing active to release)");
        assertEquals(3, service.getPartWithStock("CMP-CLUTCH").orElseThrow().getAvailable(),
                "Stock not double-restored");
    }

    @Test // AC-15
    void concurrentReservationsOfLastStockOnlyOneSucceeds() throws Exception {
        // Exhaust 2 of 3 CMP-CLUTCH units, leaving exactly 1
        service.reserve("CMP-CLUTCH", job1, 1);
        service.reserve("CMP-CLUTCH", job2, 1);

        CyclicBarrier barrier = new CyclicBarrier(2);
        AtomicInteger successes = new AtomicInteger(0);
        AtomicInteger failures = new AtomicInteger(0);

        Thread t1 = new Thread(() -> {
            try {
                barrier.await();
                service.reserve("CMP-CLUTCH", job3, 1);
                successes.incrementAndGet();
            } catch (IllegalStateException e) {
                failures.incrementAndGet();
            } catch (Exception ignored) {}
        });

        Thread t2 = new Thread(() -> {
            try {
                barrier.await();
                service.reserve("CMP-CLUTCH", job4, 1);
                successes.incrementAndGet();
            } catch (IllegalStateException e) {
                failures.incrementAndGet();
            } catch (Exception ignored) {}
        });

        t1.start();
        t2.start();
        t1.join();
        t2.join();

        assertEquals(1, successes.get(), "Exactly one thread should succeed");
        assertEquals(1, failures.get(), "Exactly one thread should fail");

        int totalActive = dataStore.getActiveReservationsForSku("CMP-CLUTCH")
                .stream().mapToInt(Reservation::getQuantity).sum();
        assertTrue(totalActive <= 3, "Active reservations must not exceed physical stock");
    }
}
