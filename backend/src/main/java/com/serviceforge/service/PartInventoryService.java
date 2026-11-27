package com.serviceforge.service;

import com.serviceforge.data.MockDataStore;
import com.serviceforge.dto.PartStockResponse;
import com.serviceforge.model.JobStatus;
import com.serviceforge.model.Reservation;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class PartInventoryService {

    private final MockDataStore dataStore;

    public PartInventoryService(MockDataStore dataStore) {
        this.dataStore = dataStore;
    }

    public List<PartStockResponse> getAllPartsWithStock() {
        return dataStore.getAllParts().stream()
                .map(p -> {
                    int reserved = dataStore.getActiveReservationsForSku(p.getSku())
                            .stream().mapToInt(Reservation::getQuantity).sum();
                    return new PartStockResponse(p.getSku(), p.getName(), p.getQuantityOnHand(), reserved);
                })
                .collect(Collectors.toList());
    }

    public Optional<PartStockResponse> getPartWithStock(String sku) {
        return dataStore.findPart(sku).map(p -> {
            int reserved = dataStore.getActiveReservationsForSku(sku)
                    .stream().mapToInt(Reservation::getQuantity).sum();
            return new PartStockResponse(p.getSku(), p.getName(), p.getQuantityOnHand(), reserved);
        });
    }

    public synchronized Reservation reserve(String sku, Long jobId, int quantity) {
        var part = dataStore.findPart(sku)
                .orElseThrow(() -> new IllegalArgumentException("Unknown sku '" + sku + "'"));

        var job = dataStore.findJob(jobId)
                .orElseThrow(() -> new IllegalArgumentException("Unknown job id " + jobId));

        // AC-8: only SCHEDULED jobs may hold reservations
        if (job.getStatus() != JobStatus.SCHEDULED) {
            throw new IllegalStateException("Job " + jobId + " is not in SCHEDULED status");
        }

        // AC-6/AC-7: idempotency — check for existing active reservation for this job+sku
        List<Reservation> existing = dataStore.getReservationsForJob(jobId).stream()
                .filter(r -> r.getSku().equals(sku) && r.getStatus() == Reservation.ReservationStatus.ACTIVE)
                .collect(Collectors.toList());

        if (!existing.isEmpty()) {
            Reservation prior = existing.get(0);
            if (prior.getQuantity() == quantity) {
                return prior; // AC-6: identical retry returns existing record
            }
            throw new IllegalStateException(
                    "Conflicting retry: reservation already exists for job " + jobId + " with different requirements");
        }

        // AC-1: net available = physicalQty − active reservations
        int activeReserved = dataStore.getActiveReservationsForSku(sku)
                .stream().mapToInt(Reservation::getQuantity).sum();
        int available = part.getQuantityOnHand() - activeReserved;

        if (available < quantity) {
            throw new IllegalStateException(
                    "Insufficient stock for " + sku + ": requested " + quantity + ", available " + available);
        }

        Reservation res = new Reservation(UUID.randomUUID().toString(), sku, jobId, quantity);
        dataStore.saveReservation(res);
        return res;
    }

    // AC-10: releases all ACTIVE reservations for a job; returns count released
    public synchronized int release(Long jobId) {
        List<Reservation> active = dataStore.getReservationsForJob(jobId).stream()
                .filter(r -> r.getStatus() == Reservation.ReservationStatus.ACTIVE)
                .collect(Collectors.toList());
        active.forEach(r -> r.setStatus(Reservation.ReservationStatus.RELEASED));
        return active.size();
    }

    public List<Reservation> getReservationsForJob(Long jobId) {
        return dataStore.getReservationsForJob(jobId);
    }
}
