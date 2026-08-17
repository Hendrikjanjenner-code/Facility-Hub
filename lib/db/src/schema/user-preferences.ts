import { pgTable, serial, integer, text, unique } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const userPreferencesTable = pgTable(
  "user_preferences",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    value: text("value").notNull(),
  },
  (t) => [unique("user_preferences_user_key").on(t.userId, t.key)],
);

export type UserPreference = typeof userPreferencesTable.$inferSelect;
