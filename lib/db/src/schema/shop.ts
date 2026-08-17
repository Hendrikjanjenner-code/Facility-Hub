import {
  pgTable,
  text,
  serial,
  integer,
  real,
  timestamp,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { suppliersTable } from "./contracts";

export const shopProductsTable = pgTable("shop_products", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category").notNull(), // kantoorartikelen | ict | meubilair | facilitair | overig
  price: real("price").notNull(),
  unit: text("unit").notNull().default("stuk"),
  stock: integer("stock").notNull().default(0),
  minStock: integer("min_stock").notNull().default(0),
  active: integer("active").notNull().default(1), // 1 = actief, 0 = inactief
  supplierId: integer("supplier_id").references(() => suppliersTable.id), // gekoppelde leverancier
});

export const budgetsTable = pgTable("budgets", {
  id: serial("id").primaryKey(),
  department: text("department").notNull(),
  year: integer("year").notNull(),
  amount: real("amount").notNull(),
  overBudgetPolicy: text("over_budget_policy").notNull().default("markeren"), // "markeren" | "blokkeren"
});

export const shopOrdersTable = pgTable("shop_orders", {
  id: serial("id").primaryKey(),
  number: text("number").notNull().unique(),
  requesterId: integer("requester_id")
    .notNull()
    .references(() => usersTable.id),
  department: text("department").notNull(),
  status: text("status").notNull().default("ingediend"), // ingediend | goedgekeurd | afgekeurd | besteld | geleverd
  totalAmount: real("total_amount").notNull(),
  budgetExceeded: integer("budget_exceeded").notNull().default(0), // 1 = bestelling overschrijdt restbudget op moment van indienen
  approverId: integer("approver_id").references(() => usersTable.id),
  decisionNote: text("decision_note"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  // Orderkoppeling leverancier
  supplierId: integer("supplier_id").references(() => suppliersTable.id),
  supplierStatus: text("supplier_status"), // null | 'verstuurd' | 'verwerkt'
  sentToSupplierAt: timestamp("sent_to_supplier_at", { withTimezone: true }),
});

export const shopOrderLinesTable = pgTable("shop_order_lines", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id")
    .notNull()
    .references(() => shopOrdersTable.id),
  productId: integer("product_id")
    .notNull()
    .references(() => shopProductsTable.id),
  quantity: integer("quantity").notNull(),
  unitPrice: real("unit_price").notNull(),
});

/** Goedkeuringsdrempel: bestellingen op/onder dit bedrag worden direct goedgekeurd. */
export const approvalThresholdTable = pgTable("approval_threshold", {
  id: serial("id").primaryKey(),
  thresholdAmount: real("threshold_amount").notNull().default(0), // 0 = altijd manager-goedkeuring
});
export type ShopProduct = typeof shopProductsTable.$inferSelect;
export type Budget = typeof budgetsTable.$inferSelect;
export type ShopOrder = typeof shopOrdersTable.$inferSelect;
export type ShopOrderLine = typeof shopOrderLinesTable.$inferSelect;
