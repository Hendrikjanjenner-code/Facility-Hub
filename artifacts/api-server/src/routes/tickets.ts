import { Router, type IRouter } from "express";
import {
  db,
  ticketsTable,
  ticketCategoriesTable,
  ticketCommentsTable,
  usersTable,
  roomsTable,
  floorsTable,
  buildingsTable,
  assetsTable,
  mjopTakenTable,
  notificationsTable,
  type Ticket,
} from "@workspace/db";
import { eq, desc, and, ilike, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  CreateTicketBody,
  UpdateTicketBody,
  CreateTicketCommentBody,
} from "@workspace/api-zod";
import { requireAuth, TICKET_MANAGER_ROLES } from "../lib/auth";
import { notify } from "../lib/notify";
const router: IRouter = Router();
router.use(requireAuth);

const SLA_HOURS: Record<string, number> = { P1: 4, P2: 8, P3: 24, P4: 72 };

const VALID_STATUSES = [
  "nieuw",
  "in_behandeling",
  "wacht_op_info",
  "ingepland",
  "gereed",
  "gesloten",
];
const VALID_PRIORITIES = ["P1", "P2", "P3", "P4"];

function canViewTicket(
  user: { id: number; role: string },
  t: { reporterId: number; assigneeId: number | null },
): boolean {
  if (TICKET_MANAGER_ROLES.includes(user.role)) return true;
  return t.reporterId === user.id || t.assigneeId === user.id;
}

const reporter = alias(usersTable, "reporter");
const assignee = alias(usersTable, "assignee");

async function fetchTickets(where?: SQL): Promise<unknown[]> {
  const rows = await db
    .select({
      t: ticketsTable,
      categoryName: ticketCategoriesTable.name,
      roomName: roomsTable.name,
      buildingName: buildingsTable.name,
      assetName: assetsTable.name,
      reporterName: reporter.name,
      assigneeName: assignee.name,
    })
    .from(ticketsTable)
    .leftJoin(
      ticketCategoriesTable,
      eq(ticketsTable.categoryId, ticketCategoriesTable.id),
    )
    .leftJoin(roomsTable, eq(ticketsTable.roomId, roomsTable.id))
    .leftJoin(floorsTable, eq(roomsTable.floorId, floorsTable.id))
    .leftJoin(buildingsTable, eq(floorsTable.buildingId, buildingsTable.id))
    .leftJoin(assetsTable, eq(ticketsTable.assetId, assetsTable.id))
    .leftJoin(reporter, eq(ticketsTable.reporterId, reporter.id))
    .leftJoin(assignee, eq(ticketsTable.assigneeId, assignee.id))
    .where(where)
    .orderBy(desc(ticketsTable.createdAt));

  return rows.map((r) => serializeTicket(r.t, r));
}

function serializeTicket(
  t: Ticket,
  extra: {
    categoryName: string | null;
    roomName: string | null;
    buildingName: string | null;
    assetName: string | null;
    reporterName: string | null;
    assigneeName: string | null;
  },
) {
  return {
    id: t.id,
    number: t.number,
    title: t.title,
    description: t.description,
    status: t.status,
    priority: t.priority,
    categoryId: t.categoryId,
    categoryName: extra.categoryName,
    roomId: t.roomId,
    roomName: extra.roomName,
    buildingName: extra.buildingName,
    assetId: t.assetId,
    assetName: extra.assetName,
    reporterId: t.reporterId,
    reporterName: extra.reporterName,
    assigneeId: t.assigneeId,
    assigneeName: extra.assigneeName,
    formData: t.formData ?? null,
    slaDueAt: t.slaDueAt?.toISOString() ?? null,
    plannedAt: t.plannedAt?.toISOString() ?? null,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

router.get("/tickets", async (req, res): Promise<void> => {
  const conditions: SQL[] = [];
  const q = req.query;
  if (typeof q.status === "string" && q.status)
    conditions.push(eq(ticketsTable.status, q.status));
  if (typeof q.priority === "string" && q.priority)
    conditions.push(eq(ticketsTable.priority, q.priority));
  if (typeof q.category === "string" && q.category)
    conditions.push(eq(ticketCategoriesTable.name, q.category));
  if (typeof q.assigneeId === "string" && q.assigneeId)
    conditions.push(eq(ticketsTable.assigneeId, Number(q.assigneeId)));
  if (typeof q.reporterId === "string" && q.reporterId)
    conditions.push(eq(ticketsTable.reporterId, Number(q.reporterId)));
  if (typeof q.search === "string" && q.search) {
    const s = `%${q.search}%`;
    const searchCond = or(
      ilike(ticketsTable.title, s),
      ilike(ticketsTable.description, s),
      ilike(ticketsTable.number, s),
    );
    if (searchCond) conditions.push(searchCond);
  }
  // Non-managers only see tickets they reported or are assigned to
  const user = req.currentUser!;
  if (!TICKET_MANAGER_ROLES.includes(user.role)) {
    const ownCond = or(
      eq(ticketsTable.reporterId, user.id),
      eq(ticketsTable.assigneeId, user.id),
    );
    if (ownCond) conditions.push(ownCond);
  }
  const where = conditions.length ? and(...conditions) : undefined;
  res.json(await fetchTickets(where));
});

router.get("/tickets/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ message: "Ongeldig id" });
    return;
  }
  const [raw] = await db
    .select()
    .from(ticketsTable)
    .where(eq(ticketsTable.id, id));
  if (!raw) {
    res.status(404).json({ message: "Melding niet gevonden" });
    return;
  }
  if (!canViewTicket(req.currentUser!, raw)) {
    res.status(403).json({ message: "Geen toegang tot deze melding" });
    return;
  }
  const [ticket] = await db
    .select()
    .from(ticketsTable)
    .where(eq(ticketsTable.id, id));
  res.json(ticket);
});

router.post("/tickets", async (req, res): Promise<void> => {
  const parsed = CreateTicketBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Ongeldige invoer" });
    return;
  }
  const data = parsed.data;
  const user = req.currentUser!;

  const [category] = await db
    .select()
    .from(ticketCategoriesTable)
    .where(eq(ticketCategoriesTable.id, data.categoryId));
  if (!category) {
    res.status(400).json({ message: "Onbekende categorie" });
    return;
  }

  const priority =
    data.priority && ["P1", "P2", "P3", "P4"].includes(data.priority)
      ? data.priority
      : category.defaultPriority;
  const slaDueAt = new Date(
    Date.now() + (SLA_HOURS[priority] ?? 24) * 3600 * 1000,
  );

  // Automatic routing: assign to first user with the category's route role
  const [routee] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.role, category.routeToRole))
    .limit(1);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(ticketsTable);
  const number = `GC-${new Date().getFullYear()}-${String(count + 1001).slice(-4)}`;

  const [created] = await db
    .insert(ticketsTable)
    .values({
      number,
      title: data.title,
      description: data.description,
      priority,
      status: "nieuw",
      categoryId: data.categoryId,
      roomId: data.roomId ?? null,
      assetId: data.assetId ?? null,
      reporterId: user.id,
      assigneeId: routee?.id ?? null,
      formData: data.formData ?? null,
      slaDueAt,
    })
    .returning();

  if (routee && routee.id !== user.id) {
    await notify(
      routee.id,
      `Nieuwe melding ${number}`,
      `${data.title} (${priority}) is aan jou toegewezen.`,
      "ticket",
      `/meldingen/${created!.id}`,
    );
  }
  await notify(
    user.id,
    `Melding ${number} aangemaakt`,
    `Je melding "${data.title}" is geregistreerd met prioriteit ${priority}.`,
    "ticket",
    `/meldingen/${created!.id}`,
  );

  const [full] = await fetchTickets(eq(ticketsTable.id, created!.id));
  res.status(201).json(full);
});

const STATUS_LABELS: Record<string, string> = {
  nieuw: "Nieuw",
  in_behandeling: "In behandeling",
  wacht_op_info: "Wacht op info",
  ingepland: "Ingepland",
  gereed: "Gereed",
  gesloten: "Gesloten",
};

router.patch("/tickets/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const parsed = UpdateTicketBody.safeParse(req.body);
  if (Number.isNaN(id) || !parsed.success) {
    res.status(400).json({ message: "Ongeldige invoer" });
    return;
  }
  const data = parsed.data;
  const [existing] = await db
    .select()
    .from(ticketsTable)
    .where(eq(ticketsTable.id, id));
  if (!existing) {
    res.status(404).json({ message: "Melding niet gevonden" });
    return;
  }

  const editor = req.currentUser!;
  const isManager = TICKET_MANAGER_ROLES.includes(editor.role);
  const isAssignee = existing.assigneeId === editor.id;
  if (!isManager && !isAssignee) {
    res.status(403).json({ message: "Geen toegang om deze melding te wijzigen" });
    return;
  }
  if (!isManager) {
    // Assignees (e.g. leveranciers) may only update the status
    const keys = Object.keys(data).filter((k) => data[k as keyof typeof data] !== undefined);
    if (keys.some((k) => k !== "status")) {
      res.status(403).json({ message: "Alleen de status mag worden gewijzigd" });
      return;
    }
  }
  if (data.status && !VALID_STATUSES.includes(data.status)) {
    res.status(400).json({ message: "Ongeldige status" });
    return;
  }
  if (data.priority && !VALID_PRIORITIES.includes(data.priority)) {
    res.status(400).json({ message: "Ongeldige prioriteit" });
    return;
  }

  const update: Partial<typeof ticketsTable.$inferInsert> = {};
  if (data.status) update.status = data.status;
  if (data.priority) {
    update.priority = data.priority;
    update.slaDueAt = new Date(
      existing.createdAt.getTime() +
        (SLA_HOURS[data.priority] ?? 24) * 3600 * 1000,
    );
  }
  if (data.assigneeId !== undefined) update.assigneeId = data.assigneeId;
  if (data.plannedAt !== undefined)
    update.plannedAt = data.plannedAt ? new Date(data.plannedAt) : null;
  if (data.title) update.title = data.title;
  if (data.description) update.description = data.description;

  // Update the ticket and (when closing) auto-complete linked MJOP tasks atomically.
  // RETURNING ensures we only notify for rows actually transitioned in this request
  // (prevents duplicate alerts from concurrent ticket-close requests).
  // Notification rows are inserted inside the same transaction so a failure rolls everything back.
  await db.transaction(async (tx) => {
    await tx.update(ticketsTable).set(update).where(eq(ticketsTable.id, id));

    if (shouldFinishMjopTasks(data.status, existing.status)) {
      const completedTaken = await finishLinkedMjopTasks(tx, id);

      if (completedTaken.length > 0) {
        // Resolve beheerder recipients inside the transaction for atomicity
        const beheerders = await tx
          .select({ id: usersTable.id })
          .from(usersTable)
          .where(eq(usersTable.role, "beheerder"));

        for (const taak of completedTaken) {
          for (const u of beheerders) {
            await tx.insert(notificationsTable).values({
              userId: u.id,
              title: `MJOP-taak automatisch afgerond`,
              body: `"${taak.title}" is automatisch afgerond via melding ${existing.number}.`,
              kind: "mjop",
              linkPath: `/mjop/bouwdelen/${taak.bouwdeelId}`,
            });
          }
        }
      }
    }
  });

  const user = req.currentUser!;
  if (data.status && data.status !== existing.status && existing.reporterId !== user.id) {
    await notify(
      existing.reporterId,
      `Melding ${existing.number} bijgewerkt`,
      `Status gewijzigd naar "${STATUS_LABELS[data.status] ?? data.status}".`,
      "ticket",
      `/meldingen/${id}`,
    );
  }

  // Stuur een tevredenheidsverzoek wanneer de melding wordt gesloten.
  // De referenceKey zorgt dat dit bij heropenen + opnieuw sluiten slechts één keer verstuurd wordt.
  if (data.status === "gesloten") {
    await notify(
      existing.reporterId,
      `Hoe tevreden bent u? – ${existing.number}`,
      `Melding "${existing.title}" is gesloten. Laat uw beoordeling achter.`,
      "satisfaction",
      `/meldingen/${id}?beoordelen=1`,
      `satisfaction:${id}`,
    );
  }
  if (
    data.assigneeId != null &&
    data.assigneeId !== existing.assigneeId &&
    data.assigneeId !== user.id
  ) {
    await notify(
      data.assigneeId,
      `Melding ${existing.number} toegewezen`,
      `"${existing.title}" is aan jou toegewezen.`,
      "ticket",
      `/meldingen/${id}`,
    );
  }

  const [full] = await fetchTickets(eq(ticketsTable.id, id));
  res.json(full);
});

router.get("/tickets/:id/comments", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ message: "Ongeldig id" });
    return;
  }
  const [parent] = await db
    .select()
    .from(ticketsTable)
    .where(eq(ticketsTable.id, id));
  if (!parent) {
    res.status(404).json({ message: "Melding niet gevonden" });
    return;
  }
  if (!canViewTicket(req.currentUser!, parent)) {
    res.status(403).json({ message: "Geen toegang tot deze melding" });
    return;
  }
  const rows = await db
    .select({
      c: ticketCommentsTable,
      authorName: usersTable.name,
      authorRole: usersTable.role,
    })
    .from(ticketCommentsTable)
    .leftJoin(usersTable, eq(ticketCommentsTable.authorId, usersTable.id))
    .where(eq(ticketCommentsTable.ticketId, id))
    .orderBy(ticketCommentsTable.createdAt);
  res.json(
    rows.map((r) => ({
      id: r.c.id,
      ticketId: r.c.ticketId,
      authorId: r.c.authorId,
      authorName: r.authorName,
      authorRole: r.authorRole,
      body: r.c.body,
      createdAt: r.c.createdAt.toISOString(),
    })),
  );
});

router.post("/tickets/:id/comments", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const parsed = CreateTicketCommentBody.safeParse(req.body);
  if (Number.isNaN(id) || !parsed.success) {
    res.status(400).json({ message: "Ongeldige invoer" });
    return;
  }
  const [ticket] = await db
    .select()
    .from(ticketsTable)
    .where(eq(ticketsTable.id, id));
  if (!ticket) {
    res.status(404).json({ message: "Melding niet gevonden" });
    return;
  }
  const user = req.currentUser!;
  if (!canViewTicket(user, ticket)) {
    res.status(403).json({ message: "Geen toegang tot deze melding" });
    return;
  }
  const [comment] = await db
    .insert(ticketCommentsTable)
    .values({ ticketId: id, authorId: user.id, body: parsed.data.body })
    .returning();

  const targets = new Set<number>();
  if (ticket.reporterId !== user.id) targets.add(ticket.reporterId);
  if (ticket.assigneeId && ticket.assigneeId !== user.id)
    targets.add(ticket.assigneeId);
  for (const target of targets) {
    await notify(
      target,
      `Nieuwe reactie op ${ticket.number}`,
      `${user.name}: ${parsed.data.body.slice(0, 80)}`,
      "ticket",
      `/meldingen/${id}`,
    );
  }

  res.status(201).json({
    id: comment!.id,
    ticketId: comment!.ticketId,
    authorId: comment!.authorId,
    authorName: user.name,
    authorRole: user.role,
    body: comment!.body,
    createdAt: comment!.createdAt.toISOString(),
  });
});

router.get("/ticket-categories", async (_req, res): Promise<void> => {
  const categories = await db
    .select()
    .from(ticketCategoriesTable)
    .orderBy(ticketCategoriesTable.name);
  res.json(
    categories.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      defaultPriority: c.defaultPriority,
      routeToRole: c.routeToRole,
      formFields: c.formFields ?? [],
    })),
  );
});

export default router;

/**
 * Returns true when closing a ticket should finish its linked MJOP tasks.
 * Exported for unit testing.
 */
export function shouldFinishMjopTasks(
  newStatus: string | undefined,
  existingStatus: string,
): boolean {
  if (!newStatus) return false;
  if (newStatus === existingStatus) return false;
  return newStatus === "gereed" || newStatus === "gesloten";
}

/**
 * Marks all linked MJOP tasks that are still active (gepland / in_uitvoering)
 * as afgerond. Tasks already afgerond are left untouched by the WHERE filter.
 * Returns the completed rows so callers can act on them (e.g. send notifications).
 * Exported for unit testing.
 */
export async function finishLinkedMjopTasks(
  tx: { update: typeof db.update },
  ticketId: number,
): Promise<Array<{ id: number; title: string; bouwdeelId: number }>> {
  return tx
    .update(mjopTakenTable)
    .set({ status: "afgerond" })
    .where(
      and(
        eq(mjopTakenTable.ticketId, ticketId),
        or(
          eq(mjopTakenTable.status, "in_uitvoering"),
          eq(mjopTakenTable.status, "gepland"),
        ),
      ),
    )
    .returning({
      id: mjopTakenTable.id,
      title: mjopTakenTable.title,
      bouwdeelId: mjopTakenTable.bouwdeelId,
    });
}
