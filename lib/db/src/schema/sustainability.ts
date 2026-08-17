import {
  pgTable,
  text,
  serial,
  integer,
  date,
  real,
  timestamp,
} from "drizzle-orm/pg-core";
import { buildingsTable } from "./vastgoed";
import { usersTable } from "./users";

// Audit log for meter reading corrections and deletions
export const meterReadingAuditLogTable = pgTable("meter_reading_audit_log", {
  id: serial("id").primaryKey(),
  meterReadingId: integer("meter_reading_id").notNull(), // not FK — reading may be deleted
  action: text("action").notNull(), // "correctie" | "verwijderd"
  changedById: integer("changed_by_id").references(() => usersTable.id),
  changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
  oldReadingDate: date("old_reading_date", { mode: "string" }),
  newReadingDate: date("new_reading_date", { mode: "string" }),
  oldValue: real("old_value"),
  newValue: real("new_value"),
});

export const meterReadingsTable = pgTable("meter_readings", {
  id: serial("id").primaryKey(),
  buildingId: integer("building_id")
    .notNull()
    .references(() => buildingsTable.id),
  meterType: text("meter_type").notNull(), // elektriciteit | gas | water
  readingDate: date("reading_date", { mode: "string" }).notNull(),
  value: real("value").notNull(), // meterstand (cumulatief)
  unit: text("unit").notNull(), // kWh | m3
  source: text("source").notNull().default("handmatig"), // handmatig | csv_import
  registeredById: integer("registered_by_id").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const wasteRegistrationsTable = pgTable("waste_registrations", {
  id: serial("id").primaryKey(),
  buildingId: integer("building_id")
    .notNull()
    .references(() => buildingsTable.id),
  registrationDate: date("registration_date", { mode: "string" }).notNull(),
  category: text("category").notNull(), // restafval | papier | gft | plastic | glas | chemisch
  weightKg: real("weight_kg").notNull(),
  registeredById: integer("registered_by_id").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type MeterReading = typeof meterReadingsTable.$inferSelect;
export type WasteRegistration = typeof wasteRegistrationsTable.$inferSelect;
