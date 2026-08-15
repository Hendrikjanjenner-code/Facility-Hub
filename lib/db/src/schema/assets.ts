import { pgTable, text, serial, integer, date } from "drizzle-orm/pg-core";
import { roomsTable } from "./vastgoed";

export const assetsTable = pgTable("assets", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  code: text("code").notNull().unique(),
  category: text("category").notNull(),
  brand: text("brand"),
  model: text("model"),
  serialNumber: text("serial_number"),
  roomId: integer("room_id").references(() => roomsTable.id),
  status: text("status").notNull().default("in_gebruik"), // in_gebruik | in_onderhoud | defect | afgeschreven
  purchaseDate: date("purchase_date", { mode: "string" }),
});

export type Asset = typeof assetsTable.$inferSelect;
