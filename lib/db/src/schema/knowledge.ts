import { pgTable, text, serial, timestamp, jsonb } from "drizzle-orm/pg-core";

export const knowledgeArticlesTable = pgTable("knowledge_articles", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  category: text("category").notNull(),
  tags: jsonb("tags").notNull().default([]),
  ticketCategoryIds: jsonb("ticket_category_ids").notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type KnowledgeArticle = typeof knowledgeArticlesTable.$inferSelect;
