import { isoDate, type LoadProperties, type Property } from "./work-order";

const PROPERTIES: readonly Property[] = [
  {
    id: "harbor-point-building-b",
    name: "Harbor Point Logistics, Building B",
    address: "2200 Industrial Pkwy, Riverton",
    roof: { system: "tpo", installedYear: 2016, areaSqFt: 84_000, thicknessMil: 60 },
    warranty: { manufacturer: "Apex Membrane Co.", expiresOn: isoDate("2031-12-31") },
    history: [
      {
        date: isoDate("2026-04-14"),
        problem: "active_leak",
        notes: "Patched seam failure above dock doors 4-5.",
        workmanshipWarrantyUntil: isoDate("2027-04-14"),
      },
      {
        date: isoDate("2025-10-02"),
        problem: "inspection",
        notes: "Annual inspection. Cleared a clogged drain at the northeast corner.",
        workmanshipWarrantyUntil: null,
      },
    ],
  },
  {
    id: "riverton-medical-plaza",
    name: "Riverton Medical Plaza",
    address: "815 Commerce Dr, Riverton",
    roof: { system: "modified_bitumen", installedYear: 2009, areaSqFt: null, thicknessMil: null },
    warranty: null,
    history: [
      {
        date: isoDate("2026-07-22"),
        problem: "flashing",
        notes: "Replaced cracked flashing around a rooftop HVAC unit.",
        workmanshipWarrantyUntil: null,
      },
      {
        date: isoDate("2024-09-10"),
        problem: "storm_damage",
        notes: "Emergency tarp after hail.",
        workmanshipWarrantyUntil: null,
      },
    ],
  },
  {
    id: "northgate-self-storage",
    name: "Northgate Self Storage",
    address: "47 Northgate Rd, Riverton",
    roof: { system: "standing_seam_metal", installedYear: 2019, areaSqFt: null, thicknessMil: null },
    warranty: { manufacturer: "Northline Metal Systems", expiresOn: isoDate("2039-12-31") },
    history: [
      {
        date: isoDate("2025-05-05"),
        problem: "other",
        notes: "Resealed fasteners along the south eave.",
        workmanshipWarrantyUntil: null,
      },
    ],
  },
];

export const loadMockProperties: LoadProperties = async () => PROPERTIES;
