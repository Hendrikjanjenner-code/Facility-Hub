import {
  pgTable,
  text,
  serial,
  integer,
  boolean,
  real,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const organizationsTable = pgTable("organizations", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
});

export const sitesTable = pgTable("sites", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id")
    .notNull()
    .references(() => organizationsTable.id),
  name: text("name").notNull(),
  city: text("city").notNull(),
});

export const buildingsTable = pgTable("buildings", {
  id: serial("id").primaryKey(),
  siteId: integer("site_id")
    .notNull()
    .references(() => sitesTable.id),
  name: text("name").notNull(),
  address: text("address").notNull(),
});

export const floorsTable = pgTable("floors", {
  id: serial("id").primaryKey(),
  buildingId: integer("building_id")
    .notNull()
    .references(() => buildingsTable.id),
  name: text("name").notNull(),
  level: integer("level").notNull(),
});

export const roomsTable = pgTable("rooms", {
  id: serial("id").primaryKey(),
  floorId: integer("floor_id")
    .notNull()
    .references(() => floorsTable.id),
  name: text("name").notNull(),
  code: text("code").notNull(),
  functionType: text("function_type").notNull(),
  areaM2: real("area_m2").notNull(),
  areaVvoM2: real("area_vvo_m2"),
  areaBvoM2: real("area_bvo_m2"),
  department: text("department"),
  floorFinish: text("floor_finish"),
  capacity: integer("capacity"),
  bookable: boolean("bookable").notNull().default(false),
  facilities: text("facilities").array().notNull().default([]),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const roomDossierHistoryTable = pgTable("room_dossier_history", {
  id: serial("id").primaryKey(),
  roomId: integer("room_id")
    .notNull()
    .references(() => roomsTable.id),
  changedById: integer("changed_by_id")
    .notNull()
    .references(() => usersTable.id),
  changedAt: timestamp("changed_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  // Lijst van { field, from, to } — alleen daadwerkelijk gewijzigde velden.
  changes: jsonb("changes").notNull(),
  // Markeert dat deze regel een terugdraaiing van een eerdere wijziging is.
  isUndo: boolean("is_undo").notNull().default(false),
});
export const workplacesTable = pgTable("workplaces", {
  id: serial("id").primaryKey(),
  floorId: integer("floor_id")
    .notNull()
    .references(() => floorsTable.id),
  name: text("name").notNull(),
  code: text("code").notNull(),
  zone: text("zone").notNull(),
  features: text("features").array().notNull().default([]),
});

export const buildingDocumentsTable = pgTable("building_documents", {
  id: serial("id").primaryKey(),
  buildingId: integer("building_id")
    .notNull()
    .references(() => buildingsTable.id),
  title: text("title").notNull(),
  category: text("category").notNull(), // huurcontract | bouwtekening | energielabel | overig
  objectPath: text("object_path").notNull(),
  contentType: text("content_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  uploadedById: integer("uploaded_by_id")
    .notNull()
    .references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type BuildingDocument = typeof buildingDocumentsTable.$inferSelect;
export type Organization = typeof organizationsTable.$inferSelect;
export type Site = typeof sitesTable.$inferSelect;
export type Building = typeof buildingsTable.$inferSelect;
export type Floor = typeof floorsTable.$inferSelect;
export type Room = typeof roomsTable.$inferSelect;
export type Workplace = typeof workplacesTable.$inferSelect;

export type RoomDossierHistory = typeof roomDossierHistoryTable.$inferSelect;
