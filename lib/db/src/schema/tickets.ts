import {
  pgTable,
  text,
  serial,
  integer,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";
import { roomsTable } from "./vastgoed";
import { usersTable } from "./users";
import { assetsTable } from "./assets";

export const ticketCategoriesTable = pgTable("ticket_categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  defaultPriority: text("default_priority").notNull(), // P1..P4
  routeToRole: text("route_to_role").notNull(),
  formFields: jsonb("form_fields").notNull().default([]),
});

export const ticketsTable = pgTable("tickets", {
  id: serial("id").primaryKey(),
  number: text("number").notNull().unique(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  status: text("status").notNull().default("nieuw"), // nieuw | in_behandeling | wacht_op_info | ingepland | gereed | gesloten
  priority: text("priority").notNull(), // P1..P4
  categoryId: integer("category_id")
    .notNull()
    .references(() => ticketCategoriesTable.id),
  roomId: integer("room_id").references(() => roomsTable.id),
  assetId: integer("asset_id").references(() => assetsTable.id),
  reporterId: integer("reporter_id")
    .notNull()
    .references(() => usersTable.id),
  assigneeId: integer("assignee_id").references(() => usersTable.id),
  formData: jsonb("form_data"),
  slaDueAt: timestamp("sla_due_at", { withTimezone: true }),
  plannedAt: timestamp("planned_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const ticketCommentsTable = pgTable("ticket_comments", {
  id: serial("id").primaryKey(),
  ticketId: integer("ticket_id")
    .notNull()
    .references(() => ticketsTable.id),
  authorId: integer("author_id")
    .notNull()
    .references(() => usersTable.id),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const ticketSatisfactionTable = pgTable("ticket_satisfaction", {
  id: serial("id").primaryKey(),
  ticketId: integer("ticket_id")
    .notNull()
    .unique()
    .references(() => ticketsTable.id),
  score: integer("score").notNull(), // 1..5
  comment: text("comment"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type TicketCategory = typeof ticketCategoriesTable.$inferSelect;
export type Ticket = typeof ticketsTable.$inferSelect;
export type TicketComment = typeof ticketCommentsTable.$inferSelect;
export type TicketSatisfaction = typeof ticketSatisfactionTable.$inferSelect;
