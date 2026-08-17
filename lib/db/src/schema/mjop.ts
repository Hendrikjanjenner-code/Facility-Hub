import {
  pgTable,
  text,
  serial,
  integer,
  timestamp,
  jsonb,
  real,
  boolean,
} from "drizzle-orm/pg-core";
import { buildingsTable, floorsTable, roomsTable } from "./vastgoed";
import { usersTable } from "./users";
import { ticketsTable } from "./tickets";

export const bouwdelenTable = pgTable("bouwdelen", {
  id: serial("id").primaryKey(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  category: text("category").notNull(), // bijv. dak | gevel | installaties | terrein | interieur | transport
  nlSfbCode: text("nlsfb_code"), // NL-SfB elementclassificatie, bijv. (17), (42)
  buildingId: integer("building_id")
    .notNull()
    .references(() => buildingsTable.id),
  floorId: integer("floor_id").references(() => floorsTable.id),
  roomId: integer("room_id").references(() => roomsTable.id),
  material: text("material"),
  installYear: integer("install_year").notNull(),
  expectedLifespanYears: integer("expected_lifespan_years").notNull(),
  replacementCost: real("replacement_cost").notNull(),
  notes: text("notes"),
});

// Gebrek bij een conditiemeting (NEN 2767)
export type Gebrek = {
  description: string;
  ernst: string; // licht | serieus | ernstig
  omvang: string | null; // bijv. "< 2%", "2-10%", ...
  intensiteit: string | null; // laag | midden | hoog
  photoPath: string | null; // object storage pad (/objects/...)
};

export const conditiemetingenTable = pgTable("conditiemetingen", {
  id: serial("id").primaryKey(),
  bouwdeelId: integer("bouwdeel_id")
    .notNull()
    .references(() => bouwdelenTable.id),
  inspectorId: integer("inspector_id")
    .notNull()
    .references(() => usersTable.id),
  score: integer("score").notNull(), // NEN 2767: 1 (uitstekend) t/m 6 (zeer slecht) — effectieve score (override of afgeleid)
  scoreAfgeleid: integer("score_afgeleid"), // Automatisch afgeleide score op basis van gebreken
  scoreOverride: integer("score_override"), // Handmatige override (optioneel)
  toelichting: text("toelichting"),
  gebreken: jsonb("gebreken").$type<Gebrek[]>().notNull().default([]),
  measuredAt: timestamp("measured_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const mjopTakenTable = pgTable("mjop_taken", {
  id: serial("id").primaryKey(),
  bouwdeelId: integer("bouwdeel_id")
    .notNull()
    .references(() => bouwdelenTable.id),
  title: text("title").notNull(),
  description: text("description"),
  taskType: text("task_type").notNull(), // inspectie | onderhoud | vervanging | renovatie
  plannedYear: integer("planned_year").notNull(),
  estimatedCost: real("estimated_cost").notNull(),
  status: text("status").notNull().default("gepland"), // gepland | in_uitvoering | afgerond
  ticketId: integer("ticket_id").references(() => ticketsTable.id),
  scenarioId: integer("scenario_id"), // koppeling aan scenario (optioneel)
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Kostenbibliotheek: kengetallen voor vervangingskosten per element
export const kostenKengetallenTable = pgTable("kosten_kengetallen", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(), // bijv. "Bitumen dakbedekking"
  category: text("category").notNull(), // bijv. dak | installaties
  nlSfbCode: text("nlsfb_code"), // optionele NL-SfB koppeling
  unit: text("unit").notNull(), // bijv. "m²", "stuk", "m"
  pricePerUnit: real("price_per_unit").notNull(), // € per eenheid
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Scenarioplanning: twee of meer scenario's voor meerjarenbegroting
export const mjopScenariosTable = pgTable("mjop_scenarios", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(), // bijv. "Alleen noodzakelijk", "Instandhouding hoog niveau"
  type: text("type").notNull(), // noodzakelijk | hoog
  description: text("description"),
  buildingId: integer("building_id").references(() => buildingsTable.id), // null = alle gebouwen
  isActive: boolean("is_active").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Bouwdeel = typeof bouwdelenTable.$inferSelect;
export type Conditiemeting = typeof conditiemetingenTable.$inferSelect;
export type MjopTaak = typeof mjopTakenTable.$inferSelect;
export type KostenKengetal = typeof kostenKengetallenTable.$inferSelect;
export type MjopScenario = typeof mjopScenariosTable.$inferSelect;
