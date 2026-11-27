package com.serviceforge.model;

public class Reservation {

    public enum ReservationStatus { ACTIVE, RELEASED }

    private final String id;
    private final String sku;
    private final Long jobId;
    private final int quantity;
    private ReservationStatus status;

    public Reservation(String id, String sku, Long jobId, int quantity) {
        this.id = id;
        this.sku = sku;
        this.jobId = jobId;
        this.quantity = quantity;
        this.status = ReservationStatus.ACTIVE;
    }

    public String getId() { return id; }
    public String getSku() { return sku; }
    public Long getJobId() { return jobId; }
    public int getQuantity() { return quantity; }
    public ReservationStatus getStatus() { return status; }
    public void setStatus(ReservationStatus status) { this.status = status; }
}
