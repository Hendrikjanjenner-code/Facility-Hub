import {
  pgTable,
  text,
  serial,
  integer,
  real,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { buildingsTable, roomsTable } from "./vastgoed";
import { usersTable } from "./users";
import { ticketsTable } from "./tickets";

// Sleutel- en pasbeheer (Module 3.3)
export const keysTable = pgTable("keys", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  type: text("type").notNull(), // sleutel | pas
  description: text("description").notNull(),
  buildingId: integer("building_id").references(() => buildingsTable.id),
  status: text("status").notNull().default("beschikbaar"), // beschikbaar | uitgegeven | vermist | geblokkeerd
  replacementCost: real("replacement_cost"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Sleutelplan: welke sleutel past op welke deur/cilinder
export const keyDoorsTable = pgTable("key_doors", {
  id: serial("id").primaryKey(),
  keyId: integer("key_id")
    .notNull()
    .references(() => keysTable.id),
  description: text("description").notNull(), // bijv. "Cilinder C-12, hoofdingang"
  roomId: integer("room_id").references(() => roomsTable.id),
});

// Uitgifteregistratie
export const keyIssuesTable = pgTable("key_issues", {
  id: serial("id").primaryKey(),
  keyId: integer("key_id")
    .notNull()
    .references(() => keysTable.id),
  holderId: integer("holder_id")
    .notNull()
    .references(() => usersTable.id),
  issuedById: integer("issued_by_id")
    .notNull()
    .references(() => usersTable.id),
  issuedAt: timestamp("issued_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  dueAt: timestamp("due_at", { withTimezone: true }),
  lastNotifiedAt: timestamp("last_notified_at", { withTimezone: true }),
  returnedAt: timestamp("returned_at", { withTimezone: true }),
  note: text("note"),
}, (t) => [
  // Maximaal één openstaande uitgifte per sleutel (concurrency-guard)
  uniqueIndex("key_issues_open_unique")
    .on(t.keyId)
    .where(sql`${t.returnedAt} IS NULL`),
]);

// Verliesprocedure
export const keyLossReportsTable = pgTable("key_loss_reports", {
  id: serial("id").primaryKey(),
  keyId: integer("key_id")
    .notNull()
    .references(() => keysTable.id),
  reportedById: integer("reported_by_id")
    .notNull()
    .references(() => usersTable.id),
  holderId: integer("holder_id").references(() => usersTable.id),
  chargeAmount: real("charge_amount").notNull().default(0),
  note: text("note"),
  ticketId: integer("ticket_id").references(() => ticketsTable.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Key = typeof keysTable.$inferSelect;
export type KeyDoor = typeof keyDoorsTable.$inferSelect;
export type KeyIssue = typeof keyIssuesTable.$inferSelect;
export type KeyLossReport = typeof keyLossReportsTable.$inferSelect;
