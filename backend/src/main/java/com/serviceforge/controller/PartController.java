package com.serviceforge.controller;

import com.serviceforge.dto.ApiError;
import com.serviceforge.dto.PartStockResponse;
import com.serviceforge.dto.ReservePartRequest;
import com.serviceforge.model.Reservation;
import com.serviceforge.service.PartInventoryService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/parts")
public class PartController {

    private final PartInventoryService partInventoryService;

    public PartController(PartInventoryService partInventoryService) {
        this.partInventoryService = partInventoryService;
    }

    @GetMapping
    public ResponseEntity<List<PartStockResponse>> getAllParts() {
        return ResponseEntity.ok(partInventoryService.getAllPartsWithStock());
    }

    @GetMapping("/{sku}")
    public ResponseEntity<?> getPart(@PathVariable String sku) {
        return partInventoryService.getPartWithStock(sku)
                .<ResponseEntity<?>>map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.status(404).body(new ApiError("Unknown sku '" + sku + "'")));
    }

    @PostMapping("/{sku}/reservations")
    public ResponseEntity<?> reserve(@PathVariable String sku, @Valid @RequestBody ReservePartRequest request) {
        try {
            Reservation reservation = partInventoryService.reserve(sku, request.getJobId(), request.getQuantity());
            return ResponseEntity.status(201).body(reservation);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.status(404).body(new ApiError(e.getMessage()));
        } catch (IllegalStateException e) {
            return ResponseEntity.status(409).body(new ApiError(e.getMessage()));
        }
    }
}
