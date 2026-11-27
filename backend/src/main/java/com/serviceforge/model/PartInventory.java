package com.serviceforge.model;

public class PartInventory {
    private final String sku;
    private final String name;
    private final int quantityOnHand;

    public PartInventory(String sku, String name, int quantityOnHand) {
        this.sku = sku;
        this.name = name;
        this.quantityOnHand = quantityOnHand;
    }

    public String getSku() { return sku; }
    public String getName() { return name; }
    public int getQuantityOnHand() { return quantityOnHand; }
}
