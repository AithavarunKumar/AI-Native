package com.serviceforge.service;

import com.serviceforge.data.MockDataStore;
import com.serviceforge.dto.PartStockResponse;
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
                    int reserved = dataStore.getReservationsForSku(p.getSku())
                            .stream().mapToInt(Reservation::getQuantity).sum();
                    return new PartStockResponse(p.getSku(), p.getName(), p.getQuantityOnHand(), reserved);
                })
                .collect(Collectors.toList());
    }

    public Optional<PartStockResponse> getPartWithStock(String sku) {
        return dataStore.findPart(sku).map(p -> {
            int reserved = dataStore.getReservationsForSku(sku)
                    .stream().mapToInt(Reservation::getQuantity).sum();
            return new PartStockResponse(p.getSku(), p.getName(), p.getQuantityOnHand(), reserved);
        });
    }

    public synchronized Reservation reserve(String sku, Long jobId, int quantity) {
        var part = dataStore.findPart(sku)
                .orElseThrow(() -> new IllegalArgumentException("Unknown sku '" + sku + "'"));

        dataStore.findJob(jobId)
                .orElseThrow(() -> new IllegalArgumentException("Unknown job id " + jobId));

        int reserved = dataStore.getReservationsForSku(sku)
                .stream().mapToInt(Reservation::getQuantity).sum();
        int available = part.getQuantityOnHand() - reserved;

        if (available < quantity) {
            throw new IllegalStateException(
                    "Insufficient stock for " + sku + ": requested " + quantity + ", available " + available);
        }

        Reservation res = new Reservation(UUID.randomUUID().toString(), sku, jobId, quantity);
        dataStore.saveReservation(res);
        return res;
    }

    public List<Reservation> getReservationsForJob(Long jobId) {
        return dataStore.getReservationsForJob(jobId);
    }
}
