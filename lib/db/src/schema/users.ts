import { pgTable, text, serial } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull(), // eindgebruiker | servicedesk | facilitair_manager | cateraar | receptie | beheerder | leverancier
  department: text("department"),
  avatarColor: text("avatar_color"),
  /** inapp_only | email | all  — standaard "email" (huidig gedrag behouden) */
  notificationPreference: text("notification_preference").notNull().default("all"),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
