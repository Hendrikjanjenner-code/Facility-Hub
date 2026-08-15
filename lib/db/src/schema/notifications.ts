import {
  pgTable,
  text,
  serial,
  integer,
  timestamp,
  boolean,
  unique,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const notificationsTable = pgTable(
  "notifications",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id),
    title: text("title").notNull(),
    body: text("body").notNull(),
    kind: text("kind").notNull(), // ticket | reservering | bezoeker | systeem | contract | contract_urgent
    linkPath: text("link_path"),
    read: boolean("read").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /**
     * Optionele stabiele sleutel voor idempotente inserts via ON CONFLICT DO NOTHING.
     * Formaat: "<domein>:<id>:<drempel>" — bijv. "contract:42:expiring" of "contract:42:urgent"
     */
    referenceKey: text("reference_key"),
  },
  (t) => [unique("notifications_user_reference_key").on(t.userId, t.referenceKey)],
);

export type Notification = typeof notificationsTable.$inferSelect;
