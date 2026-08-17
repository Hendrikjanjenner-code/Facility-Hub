import { Router, type IRouter } from "express";
import {
  db,
  ticketSatisfactionTable,
  ticketsTable,
  ticketCategoriesTable,
} from "@workspace/db";
import { eq, sql, desc } from "drizzle-orm";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();
router.use(requireAuth);

const REPORT_ROLES = ["facilitair_manager", "beheerder"];

// Submit satisfaction (reporter only, once per ticket)
router.post("/tickets/:id/satisfaction", async (req, res): Promise<void> => {
  const ticketId = Number(req.params.id);
  if (Number.isNaN(ticketId)) {
    res.status(400).json({ message: "Ongeldig id" });
    return;
  }
  const [ticket] = await db
    .select()
    .from(ticketsTable)
    .where(eq(ticketsTable.id, ticketId));
  if (!ticket) {
    res.status(404).json({ message: "Melding niet gevonden" });
    return;
  }
  const user = req.currentUser!;
  if (ticket.reporterId !== user.id) {
    res.status(403).json({ message: "Alleen de melder kan een beoordeling achterlaten" });
    return;
  }
  if (ticket.status !== "gesloten") {
    res.status(400).json({ message: "Beoordelingen kunnen alleen worden ingediend bij gesloten meldingen" });
    return;
  }

  const score = Number(req.body?.score);
  if (!Number.isInteger(score) || score < 1 || score > 5) {
    res.status(400).json({ message: "Score moet een getal zijn tussen 1 en 5" });
    return;
  }
  const comment =
    typeof req.body?.comment === "string" ? req.body.comment.trim() || null : null;

  // Check if already submitted
  const [existing] = await db
    .select()
    .from(ticketSatisfactionTable)
    .where(eq(ticketSatisfactionTable.ticketId, ticketId));
  if (existing) {
    res.status(409).json({ message: "Er is al een beoordeling ingediend voor deze melding" });
    return;
  }

  const [created] = await db
    .insert(ticketSatisfactionTable)
    .values({ ticketId, score, comment })
    .returning();

  res.status(201).json({
    id: created!.id,
    ticketId: created!.ticketId,
    score: created!.score,
    comment: created!.comment ?? null,
    createdAt: created!.createdAt.toISOString(),
  });
});

// Get existing satisfaction for a ticket
router.get("/tickets/:id/satisfaction/mine", async (req, res): Promise<void> => {
  const ticketId = Number(req.params.id);
  if (Number.isNaN(ticketId)) {
    res.status(400).json({ message: "Ongeldig id" });
    return;
  }
  const user = req.currentUser!;
  const [ticket] = await db
    .select()
    .from(ticketsTable)
    .where(eq(ticketsTable.id, ticketId));
  if (!ticket || ticket.reporterId !== user.id) {
    res.status(404).json({ message: "Niet gevonden" });
    return;
  }
  const [sat] = await db
    .select()
    .from(ticketSatisfactionTable)
    .where(eq(ticketSatisfactionTable.ticketId, ticketId));
  if (!sat) {
    res.status(404).json({ message: "Nog geen beoordeling" });
    return;
  }
  res.json({
    id: sat.id,
    ticketId: sat.ticketId,
    score: sat.score,
    comment: sat.comment ?? null,
    createdAt: sat.createdAt.toISOString(),
  });
});

// Aggregate report (managers only)
router.get("/satisfaction/report", async (req, res): Promise<void> => {
  const user = req.currentUser!;
  if (!REPORT_ROLES.includes(user.role)) {
    res.status(403).json({ message: "Geen toegang" });
    return;
  }

  const [closedRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(ticketsTable)
    .where(eq(ticketsTable.status, "gesloten"));

  const [totalRow] = await db
    .select({ count: sql<number>`count(*)::int`, avg: sql<number>`round(avg(score)::numeric, 2)` })
    .from(ticketSatisfactionTable);

  const byScore = await db
    .select({ key: sql<string>`score::text`, count: sql<number>`count(*)::int` })
    .from(ticketSatisfactionTable)
    .groupBy(ticketSatisfactionTable.score)
    .orderBy(ticketSatisfactionTable.score);

  const recent = await db
    .select({
      sat: ticketSatisfactionTable,
      ticketNumber: ticketsTable.number,
      ticketTitle: ticketsTable.title,
    })
    .from(ticketSatisfactionTable)
    .leftJoin(ticketsTable, eq(ticketSatisfactionTable.ticketId, ticketsTable.id))
    .orderBy(desc(ticketSatisfactionTable.createdAt))
    .limit(20);

  // Per-category breakdown: closed tickets count and satisfaction responses count
  const byCategory = await db
    .select({
      categoryId: ticketCategoriesTable.id,
      categoryName: ticketCategoriesTable.name,
      closedCount: sql<number>`count(case when ${ticketsTable.status} = 'gesloten' then 1 end)::int`,
      // Only count responses for tickets that are currently closed, so rate stays ≤ 100% even if a ticket was reopened after a response was submitted
      responseCount: sql<number>`count(case when ${ticketsTable.status} = 'gesloten' then ${ticketSatisfactionTable.id} end)::int`,
    })
    .from(ticketCategoriesTable)
    .leftJoin(
      ticketsTable,
      eq(ticketsTable.categoryId, ticketCategoriesTable.id),
    )
    .leftJoin(
      ticketSatisfactionTable,
      eq(ticketSatisfactionTable.ticketId, ticketsTable.id),
    )
    .groupBy(ticketCategoriesTable.id, ticketCategoriesTable.name)
    .orderBy(ticketCategoriesTable.name);

  const closedTickets = closedRow?.count ?? 0;
  const totalResponses = totalRow?.count ?? 0;
  const responseRate =
    closedTickets > 0 ? Math.round((totalResponses / closedTickets) * 100) : 0;

  res.json({
    totalResponses,
    averageScore: Number(totalRow?.avg ?? 0),
    closedTickets,
    responseRate,
    byScore,
    byCategory: byCategory.map((row) => ({
      categoryId: row.categoryId,
      categoryName: row.categoryName,
      closedTickets: row.closedCount,
      responses: row.responseCount,
      responseRate:
        row.closedCount > 0
          ? Math.round((row.responseCount / row.closedCount) * 100)
          : 0,
    })),
    recentResponses: recent.map((r) => ({
      ticketId: r.sat.ticketId,
      ticketNumber: r.ticketNumber ?? "",
      ticketTitle: r.ticketTitle ?? "",
      score: r.sat.score,
      comment: r.sat.comment ?? null,
      submittedAt: r.sat.createdAt.toISOString(),
    })),
  });
});

export default router;
