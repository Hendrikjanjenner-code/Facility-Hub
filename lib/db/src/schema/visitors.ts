import {
  pgTable,
  text,
  serial,
  integer,
  timestamp,
  date,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const visitorsTable = pgTable("visitors", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  company: text("company"),
  email: text("email"),
  hostId: integer("host_id")
    .notNull()
    .references(() => usersTable.id),
  visitDate: date("visit_date", { mode: "string" }).notNull(),
  expectedArrival: text("expected_arrival").notNull(), // HH:mm
  badgeCode: text("badge_code").notNull(),
  status: text("status").notNull().default("verwacht"), // verwacht | aanwezig | vertrokken
  checkedInAt: timestamp("checked_in_at", { withTimezone: true }),
  checkedOutAt: timestamp("checked_out_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Visitor = typeof visitorsTable.$inferSelect;
