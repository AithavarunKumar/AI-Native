package com.serviceforge.dto;

public class PartStockResponse {
    private final String sku;
    private final String name;
    private final int quantityOnHand;
    private final int reserved;
    private final int available;

    public PartStockResponse(String sku, String name, int quantityOnHand, int reserved) {
        this.sku = sku;
        this.name = name;
        this.quantityOnHand = quantityOnHand;
        this.reserved = reserved;
        this.available = quantityOnHand - reserved;
    }

    public String getSku() { return sku; }
    public String getName() { return name; }
    public int getQuantityOnHand() { return quantityOnHand; }
    public int getReserved() { return reserved; }
    public int getAvailable() { return available; }
}
