import {
  pgTable,
  text,
  serial,
  integer,
  boolean,
  real,
} from "drizzle-orm/pg-core";

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
  floorFinish: text("floor_finish"),
  capacity: integer("capacity"),
  bookable: boolean("bookable").notNull().default(false),
  facilities: text("facilities").array().notNull().default([]),
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

export type Organization = typeof organizationsTable.$inferSelect;
export type Site = typeof sitesTable.$inferSelect;
export type Building = typeof buildingsTable.$inferSelect;
export type Floor = typeof floorsTable.$inferSelect;
export type Room = typeof roomsTable.$inferSelect;
export type Workplace = typeof workplacesTable.$inferSelect;
