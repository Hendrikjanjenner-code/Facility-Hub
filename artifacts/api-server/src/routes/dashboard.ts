import { Router, type IRouter } from "express";
import {
  db,
  ticketsTable,
  reservationsTable,
  visitorsTable,
  assetsTable,
  roomsTable,
  usersTable,
  bouwdelenTable,
  conditiemetingenTable,
} from "@workspace/db";
import { eq, and, or, desc, notInArray, sql } from "drizzle-orm";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();
router.use(requireAuth);

const OPEN_STATUSES = ["nieuw", "in_behandeling", "wacht_op_info", "ingepland"];
const MJOP_ROLES = ["facilitair_manager", "beheerder"];

function todayStr(): string {
  const now = new Date();
  const tz = new Intl.DateTimeFormat("nl-NL", {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => tz.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

// Module/role matrix for global (cross-user) visibility
const TICKET_ALL_ROLES = ["servicedesk", "facilitair_manager", "beheerder"];
const VISITOR_ALL_ROLES = ["receptie", "facilitair_manager", "beheerder"];
const RESERVATION_ALL_ROLES = [
  "servicedesk",
  "facilitair_manager",
  "beheerder",
  "receptie",
  "cateraar",
];

router.get("/dashboard/summary", async (req, res): Promise<void> => {
  const user = req.currentUser!;
  const today = todayStr();
  const ticketAll = TICKET_ALL_ROLES.includes(user.role);
  const ownTicketCond = or(
    eq(ticketsTable.reporterId, user.id),
    eq(ticketsTable.assigneeId, user.id),
  )!;
  const openCond = ticketAll
    ? notInArray(ticketsTable.status, ["gereed", "gesloten"])
    : and(
        notInArray(ticketsTable.status, ["gereed", "gesloten"]),
        ownTicketCond,
      )!;
  const visitorScope = VISITOR_ALL_ROLES.includes(user.role)
    ? undefined
    : eq(visitorsTable.hostId, user.id);
  const assetAccess = ticketAll;

  const [
    openTickets,
    byStatus,
    byPriority,
    slaAtRisk,
    reservationsToday,
    workplaceToday,
    visitorsExpected,
    visitorsPresent,
    myOpen,
    myResToday,
    assetCount,
    roomCount,
    mjopSlechteConditie,
    mjopBijnaEol,
  ] = await Promise.all([
    db.select({ c: sql<number>`count(*)::int` }).from(ticketsTable).where(openCond),
    db
      .select({ key: ticketsTable.status, count: sql<number>`count(*)::int` })
      .from(ticketsTable)
      .where(ticketAll ? undefined : ownTicketCond)
      .groupBy(ticketsTable.status),
    db
      .select({ key: ticketsTable.priority, count: sql<number>`count(*)::int` })
      .from(ticketsTable)
      .where(openCond)
      .groupBy(ticketsTable.priority),
    db
      .select({ c: sql<number>`count(*)::int` })
      .from(ticketsTable)
      .where(
        and(
          openCond,
          sql`${ticketsTable.slaDueAt} < now() + interval '4 hours'`,
        ),
      ),
    db
      .select({ c: sql<number>`count(*)::int` })
      .from(reservationsTable)
      .where(
        and(
          eq(reservationsTable.date, today),
          eq(reservationsTable.kind, "room"),
          notInArray(reservationsTable.status, ["geannuleerd"]),
        ),
      ),
    db
      .select({ c: sql<number>`count(*)::int` })
      .from(reservationsTable)
      .where(
        and(
          eq(reservationsTable.date, today),
          eq(reservationsTable.kind, "workplace"),
          notInArray(reservationsTable.status, ["geannuleerd"]),
        ),
      ),
    db
      .select({ c: sql<number>`count(*)::int` })
      .from(visitorsTable)
      .where(and(eq(visitorsTable.visitDate, today), visitorScope)),
    db
      .select({ c: sql<number>`count(*)::int` })
      .from(visitorsTable)
      .where(and(eq(visitorsTable.status, "aanwezig"), visitorScope)),
    db
      .select({ c: sql<number>`count(*)::int` })
      .from(ticketsTable)
      .where(
        and(
          openCond,
          user.role === "leverancier" || user.role === "servicedesk"
            ? eq(ticketsTable.assigneeId, user.id)
            : eq(ticketsTable.reporterId, user.id),
        ),
      ),
    db
      .select({ c: sql<number>`count(*)::int` })
      .from(reservationsTable)
      .where(
        and(
          eq(reservationsTable.date, today),
          eq(reservationsTable.userId, user.id),
          notInArray(reservationsTable.status, ["geannuleerd"]),
        ),
      ),
    assetAccess
      ? db.select({ c: sql<number>`count(*)::int` }).from(assetsTable)
      : Promise.resolve([{ c: 0 }]),
    db.select({ c: sql<number>`count(*)::int` }).from(roomsTable),
    // MJOP: bouwdelen with poor condition (latest score >= 4) — only for MJOP roles
    MJOP_ROLES.includes(user.role)
      ? db
          .select({ c: sql<number>`count(*)::int` })
          .from(bouwdelenTable)
          .where(
            sql`(
              select cm.score from ${conditiemetingenTable} cm
              where cm.bouwdeel_id = ${bouwdelenTable.id}
              order by cm.measured_at desc limit 1
            ) >= 4`,
          )
      : Promise.resolve([{ c: 0 }]),
    // MJOP: bouwdelen near end of life (within 5 years)
    MJOP_ROLES.includes(user.role)
      ? db
          .select({ c: sql<number>`count(*)::int` })
          .from(bouwdelenTable)
          .where(
            sql`${bouwdelenTable.installYear} + ${bouwdelenTable.expectedLifespanYears} <= extract(year from now())::int + 5`,
          )
      : Promise.resolve([{ c: 0 }]),
  ]);

  res.json({
    openTickets: openTickets[0]?.c ?? 0,
    ticketsByStatus: byStatus,
    ticketsByPriority: byPriority,
    slaAtRisk: slaAtRisk[0]?.c ?? 0,
    reservationsToday: reservationsToday[0]?.c ?? 0,
    workplaceBookingsToday: workplaceToday[0]?.c ?? 0,
    visitorsExpectedToday: visitorsExpected[0]?.c ?? 0,
    visitorsPresent: visitorsPresent[0]?.c ?? 0,
    myOpenTickets: myOpen[0]?.c ?? 0,
    myReservationsToday: myResToday[0]?.c ?? 0,
    assetCount: assetCount[0]?.c ?? 0,
    roomCount: roomCount[0]?.c ?? 0,
    mjopSlechteConditie: mjopSlechteConditie[0]?.c ?? 0,
    mjopBijnaEol: mjopBijnaEol[0]?.c ?? 0,
  });
});

router.get("/dashboard/activity", async (req, res): Promise<void> => {
  const user = req.currentUser!;
  // Each feed source follows its own module's visibility matrix
  const ticketScope = TICKET_ALL_ROLES.includes(user.role)
    ? undefined
    : or(
        eq(ticketsTable.reporterId, user.id),
        eq(ticketsTable.assigneeId, user.id),
      );
  const reservationScope = RESERVATION_ALL_ROLES.includes(user.role)
    ? undefined
    : eq(reservationsTable.userId, user.id);
  const visitorScope = VISITOR_ALL_ROLES.includes(user.role)
    ? undefined
    : eq(visitorsTable.hostId, user.id);
  const [tickets, reservations, visitors] = await Promise.all([
    db
      .select({
        id: ticketsTable.id,
        number: ticketsTable.number,
        title: ticketsTable.title,
        status: ticketsTable.status,
        priority: ticketsTable.priority,
        createdAt: ticketsTable.createdAt,
        reporterName: usersTable.name,
      })
      .from(ticketsTable)
      .leftJoin(usersTable, eq(ticketsTable.reporterId, usersTable.id))
      .where(ticketScope)
      .orderBy(desc(ticketsTable.createdAt))
      .limit(8),
    db
      .select({
        id: reservationsTable.id,
        title: reservationsTable.title,
        date: reservationsTable.date,
        startTime: reservationsTable.startTime,
        createdAt: reservationsTable.createdAt,
        userName: usersTable.name,
        roomName: roomsTable.name,
      })
      .from(reservationsTable)
      .leftJoin(usersTable, eq(reservationsTable.userId, usersTable.id))
      .leftJoin(roomsTable, eq(reservationsTable.roomId, roomsTable.id))
      .where(reservationScope)
      .orderBy(desc(reservationsTable.createdAt))
      .limit(6),
    db
      .select()
      .from(visitorsTable)
      .where(visitorScope)
      .orderBy(desc(visitorsTable.createdAt))
      .limit(6),
  ]);

  const items = [
    ...tickets.map((t) => ({
      id: `ticket-${t.id}`,
      kind: "ticket",
      title: `${t.number} · ${t.title}`,
      subtitle: `Gemeld door ${t.reporterName ?? "onbekend"} · ${t.priority}`,
      linkPath: `/meldingen/${t.id}`,
      timestamp: t.createdAt.toISOString(),
    })),
    ...reservations.map((r) => ({
      id: `reservering-${r.id}`,
      kind: "reservering",
      title: r.roomName ? `${r.roomName} gereserveerd` : r.title,
      subtitle: `${r.userName ?? "Onbekend"} · ${r.date} ${r.startTime}`,
      linkPath: `/reserveringen/${r.id}`,
      timestamp: r.createdAt.toISOString(),
    })),
    ...visitors.map((v) => ({
      id: `bezoeker-${v.id}`,
      kind: "bezoeker",
      title: `Bezoeker: ${v.name}`,
      subtitle: `${v.company ?? "Particulier"} · ${v.visitDate} ${v.expectedArrival}`,
      linkPath: "/bezoekers",
      timestamp: v.createdAt.toISOString(),
    })),
  ]
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 15);

  res.json(items);
});

export default router;
