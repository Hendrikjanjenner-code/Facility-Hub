import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

/**
 * Outbox-tabel voor e-mailbezorging bij contract-verloopmeldingen.
 *
 * Een rij wordt atomisch samen met de bijbehorende notificatie aangemaakt
 * (db.transaction). De processor verzendt de e-mail daarna asynchroon en
 * markeert de rij met sentAt wanneer bezorging slaagt.
 *
 * Retry-strategie: onbeperkte pogingen met exponentieel backoff (zie
 * emailRetryBackoffMs in contracts.ts). Er is geen harde pogingslimiet —
 * een langdurige SMTP-storing strandt een e-mail nooit permanent.
 */
export const emailQueueTable = pgTable("email_queue", {
  id: serial("id").primaryKey(),

  /**
   * Stabiele idempotentiesleutel — gelijk aan de referenceKey van de
   * bijbehorende notificatie (bijv. "contract:42:urgent:2025-03-31").
   * UNIQUE-index voorkomt dubbele wachtrij-items bij gelijktijdige runs.
   */
  referenceKey: text("reference_key").notNull().unique(),

  // Ontvanger
  toEmail: text("to_email").notNull(),
  toName: text("to_name").notNull(),

  // E-mailinhoud
  contractName: text("contract_name").notNull(),
  endDate: text("end_date").notNull(),
  supplierName: text("supplier_name").notNull(),
  daysUntilEnd: integer("days_until_end").notNull(),
  contractsUrl: text("contracts_url").notNull(),

  // Bezorgstatus
  attempts: integer("attempts").notNull().default(0),
  lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
  sentAt: timestamp("sent_at", { withTimezone: true }),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
