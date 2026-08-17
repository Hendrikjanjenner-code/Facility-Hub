import {
  pgTable,
  text,
  serial,
  integer,
  timestamp,
  date,
  real,
  boolean,
} from "drizzle-orm/pg-core";
import { roomsTable, workplacesTable } from "./vastgoed";
import { usersTable } from "./users";

export const cateringItemsTable = pgTable("catering_items", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  price: real("price").notNull(),
  category: text("category").notNull(),
});

export const reservationsTable = pgTable("reservations", {
  id: serial("id").primaryKey(),
  kind: text("kind").notNull(), // room | workplace
  roomId: integer("room_id").references(() => roomsTable.id),
  workplaceId: integer("workplace_id").references(() => workplacesTable.id),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id),
  title: text("title").notNull(),
  date: date("date", { mode: "string" }).notNull(),
  startTime: text("start_time").notNull(), // HH:mm
  endTime: text("end_time").notNull(), // HH:mm
  attendees: integer("attendees"),
  setupBufferMin: integer("setup_buffer_min").notNull().default(0),
  cleanupBufferMin: integer("cleanup_buffer_min").notNull().default(0),
  status: text("status").notNull().default("bevestigd"), // bevestigd | ingecheckt | uitgecheckt | geannuleerd
  cateringDeliveredAt: timestamp("catering_delivered_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const cateringOrderLinesTable = pgTable("catering_order_lines", {
  id: serial("id").primaryKey(),
  reservationId: integer("reservation_id")
    .notNull()
    .references(() => reservationsTable.id),
  cateringItemId: integer("catering_item_id")
    .notNull()
    .references(() => cateringItemsTable.id),
  quantity: integer("quantity").notNull(),
  unitPrice: real("unit_price").notNull(),
});

export type CateringItem = typeof cateringItemsTable.$inferSelect;
export type Reservation = typeof reservationsTable.$inferSelect;
export type CateringOrderLine = typeof cateringOrderLinesTable.$inferSelect;
