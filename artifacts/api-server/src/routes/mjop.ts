import { Router, type IRouter } from "express";
import {
  db,
  bouwdelenTable,
  conditiemetingenTable,
  mjopTakenTable,
  buildingsTable,
  floorsTable,
  roomsTable,
  usersTable,
  ticketsTable,
  ticketCategoriesTable,
  type Bouwdeel,
  type MjopTaak,
  type Gebrek,
} from "@workspace/db";
import { eq, and, desc, ilike, or, sql, notInArray, type SQL } from "drizzle-orm";
import {
  CreateBouwdeelBody,
  CreateConditiemetingBody,
  CreateMjopTaakBody,
  UpdateMjopTaakBody,
} from "@workspace/api-zod";
import { requireAuth, requireRole, TICKET_MANAGER_ROLES } from "../lib/auth";
import { notify } from "../lib/notify";

const MJOP_ROLES = ["facilitair_manager", "beheerder"];

const router: IRouter = Router();
// De volledige MJOP-module (inclusief lezen) is voorbehouden aan de MJOP-rollen.
// Let op: pad-gescoped, anders blokkeert deze guard ook routers die later
// geregistreerd worden (storage, kennisbank, sleutelbeheer, ...).
for (const prefix of ["/bouwdelen", "/mjop", "/mjop-taken"]) {
  router.use(prefix, requireAuth, requireRole(...MJOP_ROLES));
}
const VALID_TASK_TYPES = ["inspectie", "onderhoud", "vervanging", "renovatie"];
const VALID_TASK_STATUSES = ["gepland", "in_uitvoering", "afgerond"];
const VALID_ERNST = ["licht", "serieus", "ernstig"];
const SLA_HOURS: Record<string, number> = { P1: 4, P2: 8, P3: 24, P4: 72 };

const latestScoreSql = sql<number | null>`(
  select cm.score from ${conditiemetingenTable} cm
  where cm.bouwdeel_id = ${bouwdelenTable.id}
  order by cm.measured_at desc limit 1
)`;
const latestDateSql = sql<string | null>`(
  select to_char(cm.measured_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  from ${conditiemetingenTable} cm
  where cm.bouwdeel_id = ${bouwdelenTable.id}
  order by cm.measured_at desc limit 1
)`;
const openTakenSql = sql<number>`(
  select count(*)::int from ${mjopTakenTable} mt
  where mt.bouwdeel_id = ${bouwdelenTable.id} and mt.status != 'afgerond'
)`;

function serializeBouwdeel(r: {
  b: Bouwdeel;
  buildingName: string | null;
  floorName: string | null;
  roomName: string | null;
  laatsteScore: number | null;
  laatsteMetingDatum: string | null;
  openTaken: number;
}) {
  return {
    id: r.b.id,
    code: r.b.code,
    name: r.b.name,
    category: r.b.category,
    buildingId: r.b.buildingId,
    buildingName: r.buildingName,
    floorId: r.b.floorId,
    floorName: r.floorName,
    roomId: r.b.roomId,
    roomName: r.roomName,
    material: r.b.material,
    installYear: r.b.installYear,
    expectedLifespanYears: r.b.expectedLifespanYears,
    replacementCost: r.b.replacementCost,
    notes: r.b.notes,
    laatsteScore: r.laatsteScore,
    laatsteMetingDatum: r.laatsteMetingDatum,
    openTaken: r.openTaken,
  };
}

async function fetchBouwdelen(where?: SQL): Promise<unknown[]> {
  const rows = await db
    .select({
      b: bouwdelenTable,
      buildingName: buildingsTable.name,
      floorName: floorsTable.name,
      roomName: roomsTable.name,
      laatsteScore: latestScoreSql,
      laatsteMetingDatum: latestDateSql,
      openTaken: openTakenSql,
    })
    .from(bouwdelenTable)
    .leftJoin(buildingsTable, eq(bouwdelenTable.buildingId, buildingsTable.id))
    .leftJoin(floorsTable, eq(bouwdelenTable.floorId, floorsTable.id))
    .leftJoin(roomsTable, eq(bouwdelenTable.roomId, roomsTable.id))
    .where(where)
    .orderBy(bouwdelenTable.code);
  return rows.map(serializeBouwdeel);
}

router.get("/bouwdelen", async (req, res): Promise<void> => {
  const conditions: SQL[] = [];
  const q = req.query;
  if (typeof q.buildingId === "string" && q.buildingId)
    conditions.push(eq(bouwdelenTable.buildingId, Number(q.buildingId)));
  if (typeof q.category === "string" && q.category)
    conditions.push(eq(bouwdelenTable.category, q.category));
  if (typeof q.search === "string" && q.search) {
    const s = `%${q.search}%`;
    const cond = or(
      ilike(bouwdelenTable.name, s),
      ilike(bouwdelenTable.code, s),
    );
    if (cond) conditions.push(cond);
  }
  res.json(
    await fetchBouwdelen(conditions.length ? and(...conditions) : undefined),
  );
});

router.post(
  "/bouwdelen",
  requireRole(...MJOP_ROLES),
  async (req, res): Promise<void> => {
    const parsed = CreateBouwdeelBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Ongeldige invoer" });
      return;
    }
    const data = parsed.data;
    const [building] = await db
      .select()
      .from(buildingsTable)
      .where(eq(buildingsTable.id, data.buildingId));
    if (!building) {
      res.status(400).json({ message: "Onbekend gebouw" });
      return;
    }
    const [created] = await db
      .insert(bouwdelenTable)
      .values({
        code: data.code,
        name: data.name,
        category: data.category,
        buildingId: data.buildingId,
        floorId: data.floorId ?? null,
        roomId: data.roomId ?? null,
        material: data.material ?? null,
        installYear: data.installYear,
        expectedLifespanYears: data.expectedLifespanYears,
        replacementCost: data.replacementCost,
        notes: data.notes ?? null,
      })
      .returning();
    const [full] = await fetchBouwdelen(eq(bouwdelenTable.id, created!.id));
    res.status(201).json(full);
  },
);

router.get("/bouwdelen/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ message: "Ongeldig id" });
    return;
  }
  const [row] = await fetchBouwdelen(eq(bouwdelenTable.id, id));
  if (!row) {
    res.status(404).json({ message: "Bouwdeel niet gevonden" });
    return;
  }
  res.json(row);
});

router.get(
  "/bouwdelen/:id/conditiemetingen",
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      res.status(400).json({ message: "Ongeldig id" });
      return;
    }
    const rows = await db
      .select({
        m: conditiemetingenTable,
        inspectorName: usersTable.name,
      })
      .from(conditiemetingenTable)
      .leftJoin(usersTable, eq(conditiemetingenTable.inspectorId, usersTable.id))
      .where(eq(conditiemetingenTable.bouwdeelId, id))
      .orderBy(desc(conditiemetingenTable.measuredAt));
    res.json(
      rows.map((r) => ({
        id: r.m.id,
        bouwdeelId: r.m.bouwdeelId,
        inspectorId: r.m.inspectorId,
        inspectorName: r.inspectorName,
        score: r.m.score,
        toelichting: r.m.toelichting,
        gebreken: r.m.gebreken ?? [],
        measuredAt: r.m.measuredAt.toISOString(),
      })),
    );
  },
);

router.post(
  "/bouwdelen/:id/conditiemetingen",
  requireRole(...MJOP_ROLES),
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    const parsed = CreateConditiemetingBody.safeParse(req.body);
    if (Number.isNaN(id) || !parsed.success) {
      res.status(400).json({ message: "Ongeldige invoer" });
      return;
    }
    const [bouwdeel] = await db
      .select()
      .from(bouwdelenTable)
      .where(eq(bouwdelenTable.id, id));
    if (!bouwdeel) {
      res.status(404).json({ message: "Bouwdeel niet gevonden" });
      return;
    }
    const data = parsed.data;
    const gebreken: Gebrek[] = (data.gebreken ?? []).map((g) => ({
      description: g.description,
      ernst: VALID_ERNST.includes(g.ernst) ? g.ernst : "licht",
      omvang: g.omvang ?? null,
      photoPath: g.photoPath ?? null,
    }));
    const user = req.currentUser!;
    const [created] = await db
      .insert(conditiemetingenTable)
      .values({
        bouwdeelId: id,
        inspectorId: user.id,
        score: data.score,
        toelichting: data.toelichting ?? null,
        gebreken,
      })
      .returning();
    res.status(201).json({
      id: created!.id,
      bouwdeelId: created!.bouwdeelId,
      inspectorId: created!.inspectorId,
      inspectorName: user.name,
      score: created!.score,
      toelichting: created!.toelichting,
      gebreken: created!.gebreken ?? [],
      measuredAt: created!.measuredAt.toISOString(),
    });
  },
);

function serializeTaak(r: {
  t: MjopTaak;
  bouwdeelName: string | null;
  bouwdeelCode: string | null;
  buildingName: string | null;
  ticketNumber: string | null;
}) {
  return {
    id: r.t.id,
    bouwdeelId: r.t.bouwdeelId,
    bouwdeelName: r.bouwdeelName,
    bouwdeelCode: r.bouwdeelCode,
    buildingName: r.buildingName,
    title: r.t.title,
    description: r.t.description,
    taskType: r.t.taskType,
    plannedYear: r.t.plannedYear,
    estimatedCost: r.t.estimatedCost,
    status: r.t.status,
    ticketId: r.t.ticketId,
    ticketNumber: r.ticketNumber,
    createdAt: r.t.createdAt.toISOString(),
  };
}

async function fetchTaken(where?: SQL): Promise<unknown[]> {
  const rows = await db
    .select({
      t: mjopTakenTable,
      bouwdeelName: bouwdelenTable.name,
      bouwdeelCode: bouwdelenTable.code,
      buildingName: buildingsTable.name,
      ticketNumber: ticketsTable.number,
    })
    .from(mjopTakenTable)
    .leftJoin(bouwdelenTable, eq(mjopTakenTable.bouwdeelId, bouwdelenTable.id))
    .leftJoin(buildingsTable, eq(bouwdelenTable.buildingId, buildingsTable.id))
    .leftJoin(ticketsTable, eq(mjopTakenTable.ticketId, ticketsTable.id))
    .where(where)
    .orderBy(mjopTakenTable.plannedYear, mjopTakenTable.id);
  return rows.map(serializeTaak);
}

router.get("/mjop-taken", async (req, res): Promise<void> => {
  const conditions: SQL[] = [];
  const q = req.query;
  if (typeof q.year === "string" && q.year)
    conditions.push(eq(mjopTakenTable.plannedYear, Number(q.year)));
  if (typeof q.status === "string" && q.status)
    conditions.push(eq(mjopTakenTable.status, q.status));
  if (typeof q.bouwdeelId === "string" && q.bouwdeelId)
    conditions.push(eq(mjopTakenTable.bouwdeelId, Number(q.bouwdeelId)));
  res.json(await fetchTaken(conditions.length ? and(...conditions) : undefined));
});

router.post(
  "/mjop-taken",
  requireRole(...MJOP_ROLES),
  async (req, res): Promise<void> => {
    const parsed = CreateMjopTaakBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Ongeldige invoer" });
      return;
    }
    const data = parsed.data;
    if (!VALID_TASK_TYPES.includes(data.taskType)) {
      res.status(400).json({ message: "Ongeldig taaktype" });
      return;
    }
    const [bouwdeel] = await db
      .select()
      .from(bouwdelenTable)
      .where(eq(bouwdelenTable.id, data.bouwdeelId));
    if (!bouwdeel) {
      res.status(400).json({ message: "Onbekend bouwdeel" });
      return;
    }
    const [created] = await db
      .insert(mjopTakenTable)
      .values({
        bouwdeelId: data.bouwdeelId,
        title: data.title,
        description: data.description ?? null,
        taskType: data.taskType,
        plannedYear: data.plannedYear,
        estimatedCost: data.estimatedCost,
      })
      .returning();
    const [full] = await fetchTaken(eq(mjopTakenTable.id, created!.id));
    res.status(201).json(full);
  },
);

router.patch(
  "/mjop-taken/:id",
  requireRole(...MJOP_ROLES),
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    const parsed = UpdateMjopTaakBody.safeParse(req.body);
    if (Number.isNaN(id) || !parsed.success) {
      res.status(400).json({ message: "Ongeldige invoer" });
      return;
    }
    const data = parsed.data;
    if (data.taskType && !VALID_TASK_TYPES.includes(data.taskType)) {
      res.status(400).json({ message: "Ongeldig taaktype" });
      return;
    }
    if (data.status && !VALID_TASK_STATUSES.includes(data.status)) {
      res.status(400).json({ message: "Ongeldige status" });
      return;
    }
    const [existing] = await db
      .select()
      .from(mjopTakenTable)
      .where(eq(mjopTakenTable.id, id));
    if (!existing) {
      res.status(404).json({ message: "MJOP-taak niet gevonden" });
      return;
    }
    const update: Partial<typeof mjopTakenTable.$inferInsert> = {};
    if (data.title) update.title = data.title;
    if (data.description !== undefined) update.description = data.description;
    if (data.taskType) update.taskType = data.taskType;
    if (data.plannedYear) update.plannedYear = data.plannedYear;
    if (data.estimatedCost !== undefined)
      update.estimatedCost = data.estimatedCost;
    if (data.status) update.status = data.status;
    await db.update(mjopTakenTable).set(update).where(eq(mjopTakenTable.id, id));
    const [full] = await fetchTaken(eq(mjopTakenTable.id, id));
    res.json(full);
  },
);

router.post(
  "/mjop-taken/:id/ticket",
  requireRole(...MJOP_ROLES),
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      res.status(400).json({ message: "Ongeldig id" });
      return;
    }
    const [taak] = await db
      .select()
      .from(mjopTakenTable)
      .where(eq(mjopTakenTable.id, id));
    if (!taak) {
      res.status(404).json({ message: "MJOP-taak niet gevonden" });
      return;
    }
    if (taak.ticketId) {
      res
        .status(409)
        .json({ message: "Deze taak is al omgezet naar een melding" });
      return;
    }
    const [bouwdeel] = await db
      .select()
      .from(bouwdelenTable)
      .where(eq(bouwdelenTable.id, taak.bouwdeelId));

    // Route naar de categorie "Technische storing" indien aanwezig, anders "Overig"
    const categories = await db.select().from(ticketCategoriesTable);
    const category =
      categories.find((c) => c.name === "Technische storing") ??
      categories.find((c) => c.name === "Overig") ??
      categories[0];
    if (!category) {
      res.status(500).json({ message: "Geen meldingscategorie beschikbaar" });
      return;
    }
    const priority = "P3";
    const user = req.currentUser!;
    const [routee] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.role, "servicedesk"))
      .limit(1);
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(ticketsTable);
    const number = `GC-${new Date().getFullYear()}-${String(count + 1001).slice(-4)}`;

    const description = [
      `MJOP-taak: ${taak.title} (${taak.taskType}, gepland ${taak.plannedYear}).`,
      bouwdeel
        ? `Bouwdeel: ${bouwdeel.code} — ${bouwdeel.name}.`
        : null,
      `Geraamde kosten: € ${taak.estimatedCost.toLocaleString("nl-NL")}.`,
      taak.description ? `Toelichting: ${taak.description}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    const [ticket] = await db
      .insert(ticketsTable)
      .values({
        number,
        title: `[MJOP] ${taak.title}`,
        description,
        priority,
        status: "nieuw",
        categoryId: category.id,
        roomId: bouwdeel?.roomId ?? null,
        reporterId: user.id,
        assigneeId: routee?.id ?? null,
        slaDueAt: new Date(Date.now() + (SLA_HOURS[priority] ?? 24) * 3600000),
      })
      .returning();

    await db
      .update(mjopTakenTable)
      .set({ ticketId: ticket!.id, status: "in_uitvoering" })
      .where(eq(mjopTakenTable.id, id));

    if (routee && routee.id !== user.id) {
      await notify(
        routee.id,
        `Nieuwe melding ${number}`,
        `MJOP-taak "${taak.title}" is omgezet naar een melding en aan jou toegewezen.`,
        "ticket",
        `/meldingen/${ticket!.id}`,
      );
    }

    const [full] = await fetchTaken(eq(mjopTakenTable.id, id));
    res.status(201).json(full);
  },
);

router.get("/mjop/jaarplanning", async (_req, res): Promise<void> => {
  const taken = await db
    .select()
    .from(mjopTakenTable)
    .where(notInArray(mjopTakenTable.status, []));
  const byYear = new Map<number, typeof taken>();
  for (const t of taken) {
    const list = byYear.get(t.plannedYear) ?? [];
    list.push(t);
    byYear.set(t.plannedYear, list);
  }
  const years = [...byYear.keys()].sort((a, b) => a - b);
  res.json(
    years.map((year) => {
      const list = byYear.get(year)!;
      const countBy = (key: (t: (typeof list)[number]) => string) => {
        const m = new Map<string, number>();
        for (const t of list) m.set(key(t), (m.get(key(t)) ?? 0) + 1);
        return [...m.entries()].map(([k, count]) => ({ key: k, count }));
      };
      return {
        year,
        taskCount: list.length,
        totalCost: list.reduce((s, t) => s + t.estimatedCost, 0),
        byType: countBy((t) => t.taskType),
        byStatus: countBy((t) => t.status),
      };
    }),
  );
});

export default router;
