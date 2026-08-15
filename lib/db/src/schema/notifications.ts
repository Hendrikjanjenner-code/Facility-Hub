import {
  pgTable,
  text,
  serial,
  integer,
  timestamp,
  boolean,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const notificationsTable = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id),
  title: text("title").notNull(),
  body: text("body").notNull(),
  kind: text("kind").notNull(), // ticket | reservering | bezoeker | systeem
  linkPath: text("link_path"),
  read: boolean("read").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Notification = typeof notificationsTable.$inferSelect;
