import {
  pgTable,
  text,
  serial,
  integer,
  date,
  real,
  timestamp,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const suppliersTable = pgTable("suppliers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(), // techniek | schoonmaak | catering | groenvoorziening | beveiliging | overig
  contactName: text("contact_name"),
  email: text("email"),
  phone: text("phone"),
  kvkNumber: text("kvk_number"),
  userId: integer("user_id").references(() => usersTable.id), // gekoppeld account met rol leverancier
});

export const contractsTable = pgTable("contracts", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  supplierId: integer("supplier_id")
    .notNull()
    .references(() => suppliersTable.id),
  category: text("category").notNull(),
  description: text("description"),
  startDate: date("start_date", { mode: "string" }).notNull(),
  endDate: date("end_date", { mode: "string" }).notNull(),
  noticePeriodDays: integer("notice_period_days").notNull().default(90),
  annualValue: real("annual_value"),
  status: text("status").notNull().default("actief"), // actief | verlopen | opgezegd
  ownerId: integer("owner_id").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** Digitale kluis: PDF-documenten gekoppeld aan een contract. */
export const contractDocumentsTable = pgTable("contract_documents", {
  id: serial("id").primaryKey(),
  contractId: integer("contract_id")
    .notNull()
    .references(() => contractsTable.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  objectPath: text("object_path").notNull(),
  uploadedById: integer("uploaded_by_id").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** Leveranciersbeoordeling: jaarlijkse score (1–5) per leverancier. */
export const supplierReviewsTable = pgTable("supplier_reviews", {
  id: serial("id").primaryKey(),
  supplierId: integer("supplier_id")
    .notNull()
    .references(() => suppliersTable.id, { onDelete: "cascade" }),
  reviewerId: integer("reviewer_id").references(() => usersTable.id),
  year: integer("year").notNull(),
  score: integer("score").notNull(), // 1–5
  comment: text("comment"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Supplier = typeof suppliersTable.$inferSelect;
export type Contract = typeof contractsTable.$inferSelect;
export type ContractDocument = typeof contractDocumentsTable.$inferSelect;
export type SupplierReview = typeof supplierReviewsTable.$inferSelect;
