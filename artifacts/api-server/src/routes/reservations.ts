import { Router, type IRouter } from "express";
import {
  db,
  reservationsTable,
  cateringItemsTable,
  cateringOrderLinesTable,
  roomsTable,
  workplacesTable,
  floorsTable,
  buildingsTable,
  usersTable,
  type Reservation,
} from "@workspace/db";
import { eq, and, sql, type SQL } from "drizzle-orm";
import {
  CreateReservationBody,
  UpdateReservationBody,
} from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";

/** Roles that may see all reservation details (incl. titles and names). */
const RES_VIEW_ALL_ROLES = [
  "facilitair_manager",
  "beheerder",
  "receptie",
  "cateraar",
  "servicedesk",
];
import { notify, notifyRole } from "../lib/notify";

const router: IRouter = Router();
router.use(requireAuth);

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const RES_MANAGER_ROLES = ["facilitair_manager", "beheerder", "receptie"];
const VALID_RES_STATUSES = [
  "bevestigd",
  "ingecheckt",
  "uitgecheckt",
  "geannuleerd",
];

async function hasConflict(
  opts: {
    kind: string;
    roomId: number | null;
    workplaceId: number | null;
    date: string;
    startTime: string;
    endTime: string;
    setupBufferMin: number;
    cleanupBufferMin: number;
    excludeId?: number;
  },
  executor: Pick<typeof db, "select"> = db,
): Promise<boolean> {
  const resourceCond =
    opts.kind === "room"
      ? eq(reservationsTable.roomId, opts.roomId!)
      : eq(reservationsTable.workplaceId, opts.workplaceId!);
  const existing = await executor
    .select()
    .from(reservationsTable)
    .where(and(eq(reservationsTable.date, opts.date), resourceCond));
  const newStart = toMinutes(opts.startTime) - opts.setupBufferMin;
  const newEnd = toMinutes(opts.endTime) + opts.cleanupBufferMin;
  return existing.some((r) => {
    if (r.status === "geannuleerd" || r.id === opts.excludeId) return false;
    const s = toMinutes(r.startTime) - r.setupBufferMin;
    const e = toMinutes(r.endTime) + r.cleanupBufferMin;
    return newStart < e && s < newEnd;
  });
}

async function serializeReservations(
  rows: Reservation[],
  viewer?: { id: number; role: string },
) {
  const seeAll = !viewer || RES_VIEW_ALL_ROLES.includes(viewer.role);
  const ids = rows.map((r) => r.id);
  const lines = ids.length
    ? await db
        .select({
          line: cateringOrderLinesTable,
          itemName: cateringItemsTable.name,
        })
        .from(cateringOrderLinesTable)
        .leftJoin(
          cateringItemsTable,
          eq(cateringOrderLinesTable.cateringItemId, cateringItemsTable.id),
        )
    : [];
  const [rooms, workplaces, users, floors, buildings] = await Promise.all([
    db.select().from(roomsTable),
    db.select().from(workplacesTable),
    db.select().from(usersTable),
    db.select().from(floorsTable),
    db.select().from(buildingsTable),
  ]);
  const roomById = new Map(rooms.map((r) => [r.id, r]));
  const wpById = new Map(workplaces.map((w) => [w.id, w]));
  const userById = new Map(users.map((u) => [u.id, u]));
  const floorById = new Map(floors.map((f) => [f.id, f]));
  const buildingById = new Map(buildings.map((b) => [b.id, b]));

  function buildingNameFor(floorId: number | undefined): string | null {
    if (floorId == null) return null;
    const floor = floorById.get(floorId);
    if (!floor) return null;
    return buildingById.get(floor.buildingId)?.name ?? null;
  }

  return rows.map((r) => {
    const room = r.roomId != null ? roomById.get(r.roomId) : undefined;
    const wp = r.workplaceId != null ? wpById.get(r.workplaceId) : undefined;
    // Redact other users' details for non-privileged viewers (occupancy stays visible for the planbord)
    const own = seeAll || r.userId === viewer!.id;
    return {
      id: r.id,
      kind: r.kind,
      roomId: r.roomId,
      roomName: room?.name ?? null,
      workplaceId: r.workplaceId,
      workplaceName: wp?.name ?? null,
      buildingName: buildingNameFor(room?.floorId ?? wp?.floorId),
      userId: own ? r.userId : 0,
      userName: own ? (userById.get(r.userId)?.name ?? null) : null,
      title: own ? r.title : "Bezet",
      date: r.date,
      startTime: r.startTime,
      endTime: r.endTime,
      attendees: r.attendees,
      setupBufferMin: r.setupBufferMin,
      cleanupBufferMin: r.cleanupBufferMin,
      status: r.status,
      cateringOrders: (own ? lines : [])
        .filter((l) => l.line.reservationId === r.id)
        .map((l) => ({
          id: l.line.id,
          cateringItemId: l.line.cateringItemId,
          itemName: l.itemName,
          quantity: l.line.quantity,
          unitPrice: l.line.unitPrice,
        })),
      createdAt: r.createdAt.toISOString(),
    };
  });
}

router.get("/reservations", async (req, res): Promise<void> => {
  const conditions: SQL[] = [];
  const q = req.query;
  if (typeof q.date === "string" && q.date)
    conditions.push(eq(reservationsTable.date, q.date));
  if (typeof q.roomId === "string" && q.roomId)
    conditions.push(eq(reservationsTable.roomId, Number(q.roomId)));
  if (typeof q.userId === "string" && q.userId)
    conditions.push(eq(reservationsTable.userId, Number(q.userId)));
  if (typeof q.kind === "string" && q.kind)
    conditions.push(eq(reservationsTable.kind, q.kind));
  const rows = await db
    .select()
    .from(reservationsTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(reservationsTable.date, reservationsTable.startTime);
  res.json(await serializeReservations(rows, req.currentUser!));
});

router.get("/reservations/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ message: "Ongeldig id" });
    return;
  }
  const rows = await db
    .select()
    .from(reservationsTable)
    .where(eq(reservationsTable.id, id));
  if (!rows.length) {
    res.status(404).json({ message: "Reservering niet gevonden" });
    return;
  }
  const viewer = req.currentUser!;
  if (rows[0]!.userId !== viewer.id && !RES_VIEW_ALL_ROLES.includes(viewer.role)) {
    res.status(403).json({ message: "Geen toegang tot deze reservering" });
    return;
  }
  const [out] = await serializeReservations(rows, viewer);
  res.json(out);
});

router.post("/reservations", async (req, res): Promise<void> => {
  const parsed = CreateReservationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Ongeldige invoer" });
    return;
  }
  const data = parsed.data;
  const user = req.currentUser!;

  if (data.kind === "room" && data.roomId == null) {
    res.status(400).json({ message: "Kies een ruimte" });
    return;
  }
  if (data.kind === "workplace" && data.workplaceId == null) {
    res.status(400).json({ message: "Kies een werkplek" });
    return;
  }

  if (!["room", "workplace"].includes(data.kind)) {
    res.status(400).json({ message: "Ongeldig type reservering" });
    return;
  }
  if (!DATE_RE.test(data.date) || !TIME_RE.test(data.startTime) || !TIME_RE.test(data.endTime)) {
    res.status(400).json({ message: "Ongeldige datum of tijd" });
    return;
  }
  const setup = Math.min(Math.max(data.setupBufferMin ?? 0, 0), 240);
  const cleanup = Math.min(Math.max(data.cleanupBufferMin ?? 0, 0), 240);
  if (data.attendees != null && (data.attendees < 1 || data.attendees > 1000)) {
    res.status(400).json({ message: "Ongeldig aantal deelnemers" });
    return;
  }
  if (toMinutes(data.endTime) <= toMinutes(data.startTime)) {
    res.status(400).json({ message: "Eindtijd moet na begintijd liggen" });
    return;
  }

  // Validate the booked resource before conflict checks
  if (data.kind === "room") {
    const [bookedRoom] = await db
      .select()
      .from(roomsTable)
      .where(eq(roomsTable.id, data.roomId!));
    if (!bookedRoom) {
      res.status(404).json({ message: "Ruimte niet gevonden" });
      return;
    }
    if (!bookedRoom.bookable) {
      res.status(400).json({ message: "Deze ruimte is niet boekbaar" });
      return;
    }
    if (
      bookedRoom.capacity != null &&
      data.attendees != null &&
      data.attendees > bookedRoom.capacity
    ) {
      res.status(400).json({
        message: `Deze ruimte heeft plaats voor maximaal ${bookedRoom.capacity} personen`,
      });
      return;
    }
  } else {
    const [bookedWp] = await db
      .select()
      .from(workplacesTable)
      .where(eq(workplacesTable.id, data.workplaceId!));
    if (!bookedWp) {
      res.status(404).json({ message: "Werkplek niet gevonden" });
      return;
    }
  }

  // Atomic check-and-insert: an advisory lock on the resource+date serializes
  // concurrent bookings so two requests cannot both pass the conflict check.
  const lockKey = `${data.kind}:${data.roomId ?? data.workplaceId}:${data.date}`;
  let created: Reservation | undefined;
  try {
    created = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${lockKey}))`);
      const conflict = await hasConflict(
        {
          kind: data.kind,
          roomId: data.roomId ?? null,
          workplaceId: data.workplaceId ?? null,
          date: data.date,
          startTime: data.startTime,
          endTime: data.endTime,
          setupBufferMin: setup,
          cleanupBufferMin: cleanup,
        },
        tx,
      );
      if (conflict) return undefined;
      const [row] = await tx
        .insert(reservationsTable)
        .values({
          kind: data.kind,
          roomId: data.roomId ?? null,
          workplaceId: data.workplaceId ?? null,
          userId: user.id,
          title: data.title,
          date: data.date,
          startTime: data.startTime,
          endTime: data.endTime,
          attendees: data.attendees ?? null,
          setupBufferMin: setup,
          cleanupBufferMin: cleanup,
        })
        .returning();
      return row;
    });
  } catch (err) {
    req.log.error({ err }, "Reservation transaction failed");
    res.status(500).json({ message: "Reservering kon niet worden opgeslagen" });
    return;
  }
  if (!created) {
    res.status(409).json({
      message:
        "Dit tijdslot is niet beschikbaar (inclusief setup- en schoonmaakbuffer).",
    });
    return;
  }

  let hadCatering = false;
  if (data.cateringOrders?.length) {
    const items = await db.select().from(cateringItemsTable);
    const priceById = new Map(items.map((i) => [i.id, i.price]));
    for (const line of data.cateringOrders) {
      if (!priceById.has(line.cateringItemId) || line.quantity < 1) continue;
      hadCatering = true;
      await db.insert(cateringOrderLinesTable).values({
        reservationId: created!.id,
        cateringItemId: line.cateringItemId,
        quantity: line.quantity,
        unitPrice: priceById.get(line.cateringItemId)!,
      });
    }
  }

  await notify(
    user.id,
    "Reservering bevestigd",
    `"${data.title}" op ${data.date} van ${data.startTime} tot ${data.endTime}.`,
    "reservering",
    `/reserveringen/${created!.id}`,
  );
  if (hadCatering) {
    await notifyRole(
      "cateraar",
      "Nieuwe cateringbestelling",
      `Bij reservering "${data.title}" op ${data.date} is catering besteld.`,
      "reservering",
      `/reserveringen/${created!.id}`,
    );
  }

  const rows = await db
    .select()
    .from(reservationsTable)
    .where(eq(reservationsTable.id, created!.id));
  const [out] = await serializeReservations(rows);
  res.status(201).json(out);
});

router.patch("/reservations/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const parsed = UpdateReservationBody.safeParse(req.body);
  if (Number.isNaN(id) || !parsed.success) {
    res.status(400).json({ message: "Ongeldige invoer" });
    return;
  }
  const [existing] = await db
    .select()
    .from(reservationsTable)
    .where(eq(reservationsTable.id, id));
  if (!existing) {
    res.status(404).json({ message: "Reservering niet gevonden" });
    return;
  }
  const user = req.currentUser!;
  if (existing.userId !== user.id && !RES_MANAGER_ROLES.includes(user.role)) {
    res.status(403).json({ message: "Geen toegang om deze reservering te wijzigen" });
    return;
  }
  if (parsed.data.status && !VALID_RES_STATUSES.includes(parsed.data.status)) {
    res.status(400).json({ message: "Ongeldige status" });
    return;
  }
  const newStartTime = parsed.data.startTime ?? existing.startTime;
  const newEndTime = parsed.data.endTime ?? existing.endTime;
  if (!TIME_RE.test(newStartTime) || !TIME_RE.test(newEndTime)) {
    res.status(400).json({ message: "Ongeldige tijd" });
    return;
  }
  if (toMinutes(newEndTime) <= toMinutes(newStartTime)) {
    res.status(400).json({ message: "Eindtijd moet na begintijd liggen" });
    return;
  }
  const update: Partial<typeof reservationsTable.$inferInsert> = {};
  if (parsed.data.status) update.status = parsed.data.status;
  if (parsed.data.startTime) update.startTime = parsed.data.startTime;
  if (parsed.data.endTime) update.endTime = parsed.data.endTime;
  if (parsed.data.title) update.title = parsed.data.title;

  const timesChanged = !!(parsed.data.startTime || parsed.data.endTime);
  const lockKey = `${existing.kind}:${existing.roomId ?? existing.workplaceId}:${existing.date}`;
  const ok = await db.transaction(async (tx) => {
    if (timesChanged) {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${lockKey}))`);
      const conflict = await hasConflict(
        {
          kind: existing.kind,
          roomId: existing.roomId,
          workplaceId: existing.workplaceId,
          date: existing.date,
          startTime: newStartTime,
          endTime: newEndTime,
          setupBufferMin: existing.setupBufferMin,
          cleanupBufferMin: existing.cleanupBufferMin,
          excludeId: existing.id,
        },
        tx,
      );
      if (conflict) return false;
    }
    await tx
      .update(reservationsTable)
      .set(update)
      .where(eq(reservationsTable.id, id));
    return true;
  });
  if (!ok) {
    res.status(409).json({ message: "Dit tijdslot is niet beschikbaar." });
    return;
  }
  const rows = await db
    .select()
    .from(reservationsTable)
    .where(eq(reservationsTable.id, id));
  const [out] = await serializeReservations(rows, user);
  res.json(out);
});

router.get("/workplaces", async (req, res): Promise<void> => {
  const q = req.query;
  const conditions: SQL[] = [];
  if (typeof q.floorId === "string" && q.floorId)
    conditions.push(eq(workplacesTable.floorId, Number(q.floorId)));
  const workplaces = await db
    .select({
      wp: workplacesTable,
      floorName: floorsTable.name,
      buildingId: floorsTable.buildingId,
    })
    .from(workplacesTable)
    .leftJoin(floorsTable, eq(workplacesTable.floorId, floorsTable.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(workplacesTable.code);
  const buildings = await db.select().from(buildingsTable);
  const buildingById = new Map(buildings.map((b) => [b.id, b]));

  let bookedByWp = new Map<number, string | null>();
  if (typeof q.date === "string" && q.date) {
    const bookings = await db
      .select({
        workplaceId: reservationsTable.workplaceId,
        userName: usersTable.name,
        status: reservationsTable.status,
      })
      .from(reservationsTable)
      .leftJoin(usersTable, eq(reservationsTable.userId, usersTable.id))
      .where(
        and(
          eq(reservationsTable.date, q.date),
          eq(reservationsTable.kind, "workplace"),
        ),
      );
    bookedByWp = new Map(
      bookings
        .filter((b) => b.status !== "geannuleerd" && b.workplaceId != null)
        .map((b) => [b.workplaceId!, b.userName]),
    );
  }
  const dateGiven = typeof q.date === "string" && !!q.date;
  const viewer = req.currentUser!;
  const seeNames = RES_VIEW_ALL_ROLES.includes(viewer.role);
  res.json(
    workplaces.map((w) => ({
      id: w.wp.id,
      name: w.wp.name,
      code: w.wp.code,
      floorId: w.wp.floorId,
      floorName: w.floorName,
      buildingName:
        w.buildingId != null
          ? (buildingById.get(w.buildingId)?.name ?? null)
          : null,
      zone: w.wp.zone,
      features: w.wp.features,
      available: dateGiven ? !bookedByWp.has(w.wp.id) : null,
      bookedByName: seeNames ? (bookedByWp.get(w.wp.id) ?? null) : null,
    })),
  );
});

router.get("/catering-items", async (_req, res): Promise<void> => {
  const items = await db
    .select()
    .from(cateringItemsTable)
    .orderBy(cateringItemsTable.category, cateringItemsTable.name);
  res.json(items);
});

export default router;
