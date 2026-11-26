package com.serviceforge.model;

import java.util.ArrayList;
import java.util.List;

public class Technician {

    private final Long id;
    private String name;
    private String region;
    private List<String> skills;

    public Technician(Long id, String name, String region) {
        this(id, name, region, new ArrayList<>());
    }

    public Technician(Long id, String name, String region, List<String> skills) {
        this.id = id;
        this.name = name;
        this.region = region;
        this.skills = skills != null ? skills : new ArrayList<>();
    }

    public Long getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getRegion() {
        return region;
    }

    public void setRegion(String region) {
        this.region = region;
    }

    public List<String> getSkills() {
        return skills;
    }

    public void setSkills(List<String> skills) {
        this.skills = skills;
    }
}
