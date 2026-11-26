package com.serviceforge.data;

import com.serviceforge.model.Job;
import com.serviceforge.model.JobStatus;
import com.serviceforge.model.PartInventory;
import com.serviceforge.model.Reservation;
import com.serviceforge.model.Technician;
import jakarta.annotation.PostConstruct;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicLong;
import java.util.stream.Collectors;

/**
 * In-memory mock data store. There is no real database in this repo (see AGENTS.md) —
 * everything here resets on restart, which is expected for a training boilerplate.
 */
@Component
public class MockDataStore {

    private final List<Technician> technicians = new ArrayList<>();
    private final List<Job> jobs = new ArrayList<>();
    private final List<PartInventory> parts = new ArrayList<>();
    private final List<Reservation> reservations = new ArrayList<>();
    private final AtomicLong jobIdSequence = new AtomicLong(1);

    @PostConstruct
    public void seed() {
        technicians.add(new Technician(1L, "Jordan Reyes", "North", List.of("HVAC", "Electrical")));
        technicians.add(new Technician(2L, "Priya Nair", "South", List.of("Plumbing", "HVAC")));
        technicians.add(new Technician(3L, "Sam Okafor", "East", List.of("Electrical", "Appliance")));

        LocalDateTime today = LocalDateTime.now().withSecond(0).withNano(0);

        jobs.add(new Job(nextJobId(), 1L, "Acme Corp",
                today.withHour(9).withMinute(0),
                today.withHour(11).withMinute(0),
                JobStatus.SCHEDULED));
        jobs.add(new Job(nextJobId(), 1L, "Northwind Traders",
                today.withHour(14).withMinute(0),
                today.withHour(15).withMinute(30),
                JobStatus.SCHEDULED));
        jobs.add(new Job(nextJobId(), 2L, "Globex",
                today.withHour(10).withMinute(0),
                today.withHour(12).withMinute(0),
                JobStatus.SCHEDULED));
        jobs.add(new Job(nextJobId(), 3L, "Riverside Clinic",
                today.withHour(15).withMinute(30),
                today.withHour(17).withMinute(0),
                JobStatus.SCHEDULED));

        parts.add(new PartInventory("CMP-CLUTCH", "Compressor Clutch", 3));
        parts.add(new PartInventory("HVAC-FILTER", "HVAC Air Filter", 15));
        parts.add(new PartInventory("ELEC-BREAKER", "Circuit Breaker 20A", 8));
        parts.add(new PartInventory("PLMB-VALVE", "Shutoff Valve 3/4in", 5));
    }

    public List<Technician> getAllTechnicians() {
        return Collections.unmodifiableList(technicians);
    }

    public Optional<Technician> findTechnician(Long id) {
        return technicians.stream().filter(t -> t.getId().equals(id)).findFirst();
    }

    public List<Job> getJobsForTechnician(Long technicianId) {
        return jobs.stream()
                .filter(j -> j.getTechnicianId().equals(technicianId))
                .collect(Collectors.toList());
    }

    public List<Job> getAllJobs() {
        return Collections.unmodifiableList(jobs);
    }

    public Optional<Job> findJob(Long jobId) {
        return jobs.stream().filter(j -> j.getId().equals(jobId)).findFirst();
    }

    public Job save(Job job) {
        jobs.add(job);
        return job;
    }

    public Long nextJobId() {
        return jobIdSequence.getAndIncrement();
    }

    public List<PartInventory> getAllParts() {
        return Collections.unmodifiableList(parts);
    }

    public Optional<PartInventory> findPart(String sku) {
        return parts.stream().filter(p -> p.getSku().equals(sku)).findFirst();
    }

    public void saveReservation(Reservation reservation) {
        reservations.add(reservation);
    }

    public List<Reservation> getReservationsForSku(String sku) {
        return reservations.stream()
                .filter(r -> r.getSku().equals(sku))
                .collect(Collectors.toList());
    }

    public List<Reservation> getReservationsForJob(Long jobId) {
        return reservations.stream()
                .filter(r -> r.getJobId().equals(jobId))
                .collect(Collectors.toList());
    }
}
