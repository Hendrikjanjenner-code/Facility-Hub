import { Router, type IRouter } from "express";
import {
  db,
  bouwdelenTable,
  conditiemetingenTable,
  mjopTakenTable,
  kostenKengetallenTable,
  mjopScenariosTable,
  buildingsTable,
  floorsTable,
  roomsTable,
  usersTable,
  ticketsTable,
  ticketCategoriesTable,
  notificationsTable,
  type Bouwdeel,
  type MjopTaak,
  type Gebrek,
} from "@workspace/db";
import { eq, and, desc, ilike, or, sql, notInArray, inArray, type SQL } from "drizzle-orm";
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
for (const prefix of ["/bouwdelen", "/mjop", "/mjop-taken"]) {
  router.use(prefix, requireAuth, requireRole(...MJOP_ROLES));
}
const VALID_TASK_TYPES = ["inspectie", "onderhoud", "vervanging", "renovatie"];
const VALID_TASK_STATUSES = ["gepland", "in_uitvoering", "afgerond"];
const VALID_ERNST = ["licht", "serieus", "ernstig"];
const VALID_OMVANG = ["< 2%", "2-10%", "10-30%", "30-70%", "> 70%"];
const VALID_INTENSITEIT = ["laag", "midden", "hoog"];
const VALID_SCENARIO_TYPES = ["noodzakelijk", "hoog"];
const SLA_HOURS: Record<string, number> = { P1: 4, P2: 8, P3: 24, P4: 72 };

// NEN 2767 score afleiding op basis van gebreken
function deriveScore(gebreken: Gebrek[]): number | null {
  if (!gebreken.length) return null;
  const ernstVal: Record<string, number> = { licht: 1, serieus: 2, ernstig: 3 };
  const omvangVal: Record<string, number> = {
    "< 2%": 1, "2-10%": 2, "10-30%": 3, "30-70%": 4, "> 70%": 5,
  };
  const intensiteitVal: Record<string, number> = { laag: 1, midden: 2, hoog: 3 };
  let maxZ = 0;
  for (const g of gebreken) {
    const e = ernstVal[g.ernst] ?? 1;
    const o = omvangVal[g.omvang ?? "< 2%"] ?? 1;
    const i = intensiteitVal[g.intensiteit ?? "midden"] ?? 2;
    const z = e * o * i;
    if (z > maxZ) maxZ = z;
  }
  if (maxZ <= 1) return 1;
  if (maxZ <= 3) return 2;
  if (maxZ <= 8) return 3;
  if (maxZ <= 18) return 4;
  if (maxZ <= 30) return 5;
  return 6;
}

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
    nlSfbCode: r.b.nlSfbCode,
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
  if (typeof q.nlSfbCode === "string" && q.nlSfbCode)
    conditions.push(eq(bouwdelenTable.nlSfbCode, q.nlSfbCode));
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
        nlSfbCode: data.nlSfbCode ?? null,
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

function serializeConditiemeting(r: {
  m: typeof conditiemetingenTable.$inferSelect;
  inspectorName: string | null;
}) {
  return {
    id: r.m.id,
    bouwdeelId: r.m.bouwdeelId,
    inspectorId: r.m.inspectorId,
    inspectorName: r.inspectorName,
    score: r.m.score,
    scoreAfgeleid: r.m.scoreAfgeleid,
    scoreOverride: r.m.scoreOverride,
    toelichting: r.m.toelichting,
    gebreken: r.m.gebreken ?? [],
    measuredAt: r.m.measuredAt.toISOString(),
  };
}

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
    res.json(rows.map(serializeConditiemeting));
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
      omvang: VALID_OMVANG.includes(g.omvang ?? "") ? (g.omvang ?? null) : null,
      intensiteit: VALID_INTENSITEIT.includes(g.intensiteit ?? "")
        ? (g.intensiteit ?? null)
        : null,
      photoPath: g.photoPath ?? null,
    }));

    const scoreAfgeleid = deriveScore(gebreken);
    const scoreOverride =
      data.scoreOverride != null &&
      data.scoreOverride >= 1 &&
      data.scoreOverride <= 6
        ? data.scoreOverride
        : null;
    // Effectieve score: override heeft voorrang, anders afgeleid; bij geen gebreken + geen override: 1
    const score = scoreOverride ?? scoreAfgeleid ?? 1;

    const user = req.currentUser!;
    const [created] = await db
      .insert(conditiemetingenTable)
      .values({
        bouwdeelId: id,
        inspectorId: user.id,
        score,
        scoreAfgeleid,
        scoreOverride,
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
      scoreAfgeleid: created!.scoreAfgeleid,
      scoreOverride: created!.scoreOverride,
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
  const taken = await db.select().from(mjopTakenTable);
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

// ── Kostenbibliotheek ────────────────────────────────────────────────────────

router.get("/mjop/kengetallen", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(kostenKengetallenTable)
    .orderBy(kostenKengetallenTable.category, kostenKengetallenTable.name);
  res.json(
    rows.map((r) => ({
      id: r.id,
      name: r.name,
      category: r.category,
      nlSfbCode: r.nlSfbCode,
      unit: r.unit,
      pricePerUnit: r.pricePerUnit,
      notes: r.notes,
      createdAt: r.createdAt.toISOString(),
    })),
  );
});

router.post(
  "/mjop/kengetallen",
  requireRole(...MJOP_ROLES),
  async (req, res): Promise<void> => {
    const { name, category, nlSfbCode, unit, pricePerUnit, notes } = req.body as Record<string, unknown>;
    if (
      typeof name !== "string" || !name.trim() ||
      typeof category !== "string" || !category.trim() ||
      typeof unit !== "string" || !unit.trim() ||
      typeof pricePerUnit !== "number" || pricePerUnit < 0
    ) {
      res.status(400).json({ message: "Ongeldige invoer" });
      return;
    }
    const [created] = await db
      .insert(kostenKengetallenTable)
      .values({
        name: name.trim(),
        category: category.trim(),
        nlSfbCode: typeof nlSfbCode === "string" ? nlSfbCode : null,
        unit: unit.trim(),
        pricePerUnit,
        notes: typeof notes === "string" ? notes : null,
      })
      .returning();
    res.status(201).json({
      id: created!.id,
      name: created!.name,
      category: created!.category,
      nlSfbCode: created!.nlSfbCode,
      unit: created!.unit,
      pricePerUnit: created!.pricePerUnit,
      notes: created!.notes,
      createdAt: created!.createdAt.toISOString(),
    });
  },
);

router.patch(
  "/mjop/kengetallen/:id",
  requireRole(...MJOP_ROLES),
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      res.status(400).json({ message: "Ongeldig id" });
      return;
    }
    const [existing] = await db
      .select()
      .from(kostenKengetallenTable)
      .where(eq(kostenKengetallenTable.id, id));
    if (!existing) {
      res.status(404).json({ message: "Kengetal niet gevonden" });
      return;
    }
    const body = req.body as Record<string, unknown>;
    const update: Partial<typeof kostenKengetallenTable.$inferInsert> = {};
    if (typeof body.name === "string" && body.name.trim()) update.name = body.name.trim();
    if (typeof body.category === "string" && body.category.trim()) update.category = body.category.trim();
    if ("nlSfbCode" in body) update.nlSfbCode = typeof body.nlSfbCode === "string" ? body.nlSfbCode : null;
    if (typeof body.unit === "string" && body.unit.trim()) update.unit = body.unit.trim();
    if (typeof body.pricePerUnit === "number") update.pricePerUnit = body.pricePerUnit;
    if ("notes" in body) update.notes = typeof body.notes === "string" ? body.notes : null;
    const [updated] = await db
      .update(kostenKengetallenTable)
      .set(update)
      .where(eq(kostenKengetallenTable.id, id))
      .returning();
    res.json({
      id: updated!.id,
      name: updated!.name,
      category: updated!.category,
      nlSfbCode: updated!.nlSfbCode,
      unit: updated!.unit,
      pricePerUnit: updated!.pricePerUnit,
      notes: updated!.notes,
      createdAt: updated!.createdAt.toISOString(),
    });
  },
);

router.delete(
  "/mjop/kengetallen/:id",
  requireRole(...MJOP_ROLES),
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      res.status(400).json({ message: "Ongeldig id" });
      return;
    }
    const [existing] = await db
      .select()
      .from(kostenKengetallenTable)
      .where(eq(kostenKengetallenTable.id, id));
    if (!existing) {
      res.status(404).json({ message: "Kengetal niet gevonden" });
      return;
    }
    await db.delete(kostenKengetallenTable).where(eq(kostenKengetallenTable.id, id));
    res.status(204).end();
  },
);

// ── Scenarioplanning ─────────────────────────────────────────────────────────

router.get("/mjop/scenarios", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(mjopScenariosTable)
    .orderBy(mjopScenariosTable.createdAt);
  res.json(
    rows.map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      description: r.description,
      buildingId: r.buildingId,
      isActive: r.isActive,
      createdAt: r.createdAt.toISOString(),
    })),
  );
});

router.post(
  "/mjop/scenarios",
  requireRole(...MJOP_ROLES),
  async (req, res): Promise<void> => {
    const { name, type, description, buildingId, isActive } = req.body as Record<string, unknown>;
    if (
      typeof name !== "string" || !name.trim() ||
      typeof type !== "string" || !VALID_SCENARIO_TYPES.includes(type)
    ) {
      res.status(400).json({ message: "Ongeldige invoer" });
      return;
    }
    const [created] = await db
      .insert(mjopScenariosTable)
      .values({
        name: name.trim(),
        type,
        description: typeof description === "string" ? description : null,
        buildingId: typeof buildingId === "number" ? buildingId : null,
        isActive: isActive === true,
      })
      .returning();
    res.status(201).json({
      id: created!.id,
      name: created!.name,
      type: created!.type,
      description: created!.description,
      buildingId: created!.buildingId,
      isActive: created!.isActive,
      createdAt: created!.createdAt.toISOString(),
    });
  },
);

router.patch(
  "/mjop/scenarios/:id",
  requireRole(...MJOP_ROLES),
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      res.status(400).json({ message: "Ongeldig id" });
      return;
    }
    const [existing] = await db
      .select()
      .from(mjopScenariosTable)
      .where(eq(mjopScenariosTable.id, id));
    if (!existing) {
      res.status(404).json({ message: "Scenario niet gevonden" });
      return;
    }
    const body = req.body as Record<string, unknown>;
    const update: Partial<typeof mjopScenariosTable.$inferInsert> = {};
    if (typeof body.name === "string" && body.name.trim()) update.name = body.name.trim();
    if (typeof body.type === "string" && VALID_SCENARIO_TYPES.includes(body.type)) update.type = body.type;
    if ("description" in body) update.description = typeof body.description === "string" ? body.description : null;
    if ("buildingId" in body) update.buildingId = typeof body.buildingId === "number" ? body.buildingId : null;
    if (typeof body.isActive === "boolean") {
      update.isActive = body.isActive;
      // Als dit scenario actief wordt, deactiveer de rest van hetzelfde type
      if (body.isActive) {
        await db
          .update(mjopScenariosTable)
          .set({ isActive: false })
          .where(and(eq(mjopScenariosTable.type, existing.type), sql`id != ${id}`));
      }
    }
    const [updated] = await db
      .update(mjopScenariosTable)
      .set(update)
      .where(eq(mjopScenariosTable.id, id))
      .returning();
    res.json({
      id: updated!.id,
      name: updated!.name,
      type: updated!.type,
      description: updated!.description,
      buildingId: updated!.buildingId,
      isActive: updated!.isActive,
      createdAt: updated!.createdAt.toISOString(),
    });
  },
);

router.delete(
  "/mjop/scenarios/:id",
  requireRole(...MJOP_ROLES),
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      res.status(400).json({ message: "Ongeldig id" });
      return;
    }
    const [existing] = await db
      .select()
      .from(mjopScenariosTable)
      .where(eq(mjopScenariosTable.id, id));
    if (!existing) {
      res.status(404).json({ message: "Scenario niet gevonden" });
      return;
    }
    await db.delete(mjopScenariosTable).where(eq(mjopScenariosTable.id, id));
    res.status(204).end();
  },
);

/**
 * Meerjarenbegroting voor een scenario.
 * Berekent per bouwdeel wanneer vervanging nodig is op basis van:
 *  - type "noodzakelijk": score >= 5 OF voorbij einde levensduur
 *  - type "hoog": score >= 3 OF >= 80% van levensduur bereikt
 * Horizon: huidig jaar t/m huidig jaar + 15
 */
router.get("/mjop/scenarios/:id/begroting", async (req, res): Promise<void> => {
  const scenarioId = Number(req.params.id);
  if (Number.isNaN(scenarioId)) {
    res.status(400).json({ message: "Ongeldig id" });
    return;
  }
  const [scenario] = await db
    .select()
    .from(mjopScenariosTable)
    .where(eq(mjopScenariosTable.id, scenarioId));
  if (!scenario) {
    res.status(404).json({ message: "Scenario niet gevonden" });
    return;
  }

  // Haal alle bouwdelen op (gefilterd op gebouw indien scenario gebouw-specifiek is)
  const bdWhere = scenario.buildingId
    ? eq(bouwdelenTable.buildingId, scenario.buildingId)
    : undefined;
  const bouwdelen = await db
    .select({
      b: bouwdelenTable,
      buildingName: buildingsTable.name,
    })
    .from(bouwdelenTable)
    .leftJoin(buildingsTable, eq(bouwdelenTable.buildingId, buildingsTable.id))
    .where(bdWhere);

  // Laatste conditiescore per bouwdeel
  const scores = await db
    .select({
      bouwdeelId: conditiemetingenTable.bouwdeelId,
      score: conditiemetingenTable.score,
    })
    .from(conditiemetingenTable)
    .where(sql`measured_at = (
      select max(c2.measured_at) from ${conditiemetingenTable} c2
      where c2.bouwdeel_id = ${conditiemetingenTable.bouwdeelId}
    )`);
  const scoreMap = new Map(scores.map((s) => [s.bouwdeelId, s.score]));

  const currentYear = new Date().getFullYear();
  const horizon = currentYear + 15;

  type TaakEntry = {
    bouwdeelId: number;
    bouwdeelCode: string;
    bouwdeelName: string;
    buildingName: string | null;
    taskType: string;
    cost: number;
    reason: string;
  };
  const byYear = new Map<number, TaakEntry[]>();
  for (let y = currentYear; y <= horizon; y++) byYear.set(y, []);

  for (const { b, buildingName } of bouwdelen) {
    const endOfLife = b.installYear + b.expectedLifespanYears;
    const latestScore = scoreMap.get(b.id) ?? null;

    let vervangingJaar: number | null = null;
    let reason = "";

    if (scenario.type === "noodzakelijk") {
      // Vervang alleen als score >= 5 of al voorbij einde levensduur
      if (endOfLife <= horizon) {
        if (endOfLife < currentYear) {
          vervangingJaar = currentYear; // al over tijd
          reason = "Einde levensduur overschreden";
        } else {
          vervangingJaar = endOfLife;
          reason = "Einde nominale levensduur";
        }
      }
      if (latestScore !== null && latestScore >= 5) {
        const urgentJaar = Math.max(currentYear, endOfLife - 3);
        if (vervangingJaar === null || urgentJaar < vervangingJaar) {
          vervangingJaar = urgentJaar;
          reason = `Slechte conditie (score ${latestScore})`;
        }
      }
    } else {
      // type "hoog": vervang bij score >= 3 of bij 80% levensduur
      const hoogJaar = b.installYear + Math.round(b.expectedLifespanYears * 0.8);
      const targetJaar = Math.max(currentYear, hoogJaar);
      if (targetJaar <= horizon) {
        vervangingJaar = targetJaar;
        reason = "80% levensduur bereikt (instandhouding hoog niveau)";
      }
      if (latestScore !== null && latestScore >= 3) {
        const urgentJaar = Math.max(currentYear, targetJaar - 2);
        if (vervangingJaar === null || urgentJaar < vervangingJaar) {
          vervangingJaar = urgentJaar;
          reason = `Conditie matig (score ${latestScore}), vroegtijdige vervanging`;
        }
      }
    }

    if (vervangingJaar !== null && byYear.has(vervangingJaar)) {
      byYear.get(vervangingJaar)!.push({
        bouwdeelId: b.id,
        bouwdeelCode: b.code,
        bouwdeelName: b.name,
        buildingName,
        taskType: "vervanging",
        cost: b.replacementCost,
        reason,
      });
    }
  }

  const result = [...byYear.entries()]
    .filter(([, taken]) => taken.length > 0)
    .map(([year, taken]) => ({
      year,
      totalCost: taken.reduce((s, t) => s + t.cost, 0),
      taken,
    }))
    .sort((a, b) => a.year - b.year);

  res.json(result);
});

/**
 * Geprioriteerd onderhoudsadvies voor een scenario.
 * Berekent per bouwdeel een urgentieniveau en advies op basis van:
 *  - conditiescore (NEN 2767)
 *  - resterende levensduur
 *  - scenario-type (noodzakelijk / hoog)
 *
 * Urgentieniveaus:
 *  kritiek  — einde levensduur al voorbij, of score ≥ 5
 *  hoog     — binnen 3 jaar einde levensduur, of score ≥ 4
 *  gemiddeld— binnen 5 jaar einde levensduur, of score ≥ 3 (scenario "hoog")
 *  laag     — 80% levensduur bereikt maar nog geen directe noodzaak (alleen scenario "hoog")
 *
 * Resultaat gesorteerd op urgentie (kritiek eerst) en daarna op doeljaar.
 */
router.get("/mjop/scenarios/:id/advies", async (req, res): Promise<void> => {
  const scenarioId = Number(req.params.id);
  if (Number.isNaN(scenarioId)) {
    res.status(400).json({ message: "Ongeldig id" });
    return;
  }
  const [scenario] = await db
    .select()
    .from(mjopScenariosTable)
    .where(eq(mjopScenariosTable.id, scenarioId));
  if (!scenario) {
    res.status(404).json({ message: "Scenario niet gevonden" });
    return;
  }

  const bdWhere = scenario.buildingId
    ? eq(bouwdelenTable.buildingId, scenario.buildingId)
    : undefined;
  const bouwdelen = await db
    .select({ b: bouwdelenTable, buildingName: buildingsTable.name })
    .from(bouwdelenTable)
    .leftJoin(buildingsTable, eq(bouwdelenTable.buildingId, buildingsTable.id))
    .where(bdWhere);

  const scores = await db
    .select({
      bouwdeelId: conditiemetingenTable.bouwdeelId,
      score: conditiemetingenTable.score,
    })
    .from(conditiemetingenTable)
    .where(
      sql`measured_at = (
        select max(c2.measured_at) from ${conditiemetingenTable} c2
        where c2.bouwdeel_id = ${conditiemetingenTable.bouwdeelId}
      )`,
    );
  const scoreMap = new Map(scores.map((s) => [s.bouwdeelId, s.score]));

  const currentYear = new Date().getFullYear();

  type AdviesItem = {
    bouwdeelId: number;
    bouwdeelCode: string;
    bouwdeelName: string;
    buildingName: string | null;
    latestScore: number | null;
    installYear: number;
    expectedLifespanYears: number;
    endOfLife: number;
    replacementCost: number;
    urgencyLevel: "kritiek" | "hoog" | "gemiddeld" | "laag";
    advies: string;
    targetYear: number | null;
    reason: string;
  };

  const URGENCY_ORDER = { kritiek: 0, hoog: 1, gemiddeld: 2, laag: 3 };
  const items: AdviesItem[] = [];

  for (const { b, buildingName } of bouwdelen) {
    const endOfLife = b.installYear + b.expectedLifespanYears;
    const latestScore = scoreMap.get(b.id) ?? null;
    const yearsLeft = endOfLife - currentYear;

    let urgencyLevel: AdviesItem["urgencyLevel"] | null = null;
    let advies = "";
    let targetYear: number | null = null;
    let reason = "";

    if (scenario.type === "noodzakelijk") {
      if (endOfLife < currentYear || (latestScore !== null && latestScore >= 5)) {
        urgencyLevel = "kritiek";
        if (latestScore !== null && latestScore >= 5 && endOfLife >= currentYear) {
          targetYear = Math.max(currentYear, endOfLife - 3);
          reason = `Slechte conditie (NEN 2767 score ${latestScore})`;
        } else {
          targetYear = currentYear;
          reason =
            endOfLife < currentYear
              ? `Einde levensduur overschreden (${endOfLife})`
              : `Slechte conditie (NEN 2767 score ${latestScore})`;
        }
        advies = `Vervangen in ${targetYear}`;
      } else if (yearsLeft <= 3 || (latestScore !== null && latestScore >= 4)) {
        urgencyLevel = "hoog";
        targetYear = endOfLife;
        reason =
          yearsLeft <= 3
            ? `Einde levensduur over ${yearsLeft} jaar (${endOfLife})`
            : `Conditie matig-slecht (NEN 2767 score ${latestScore})`;
        advies = `Vervanging gepland ${endOfLife}`;
      }
      // noodzakelijk: geen advies bij lagere urgentie
    } else {
      // scenario "hoog"
      const hoogJaar = b.installYear + Math.round(b.expectedLifespanYears * 0.8);
      if (endOfLife < currentYear || (latestScore !== null && latestScore >= 5)) {
        urgencyLevel = "kritiek";
        targetYear = currentYear;
        reason =
          endOfLife < currentYear
            ? `Einde levensduur overschreden (${endOfLife})`
            : `Slechte conditie (NEN 2767 score ${latestScore})`;
        advies = `Vervangen in ${targetYear}`;
      } else if (yearsLeft <= 3 || (latestScore !== null && latestScore >= 4)) {
        urgencyLevel = "hoog";
        targetYear = endOfLife;
        reason =
          yearsLeft <= 3
            ? `Einde levensduur over ${yearsLeft} jaar`
            : `Conditie matig-slecht (NEN 2767 score ${latestScore})`;
        advies = `Vervanging gepland ${endOfLife}`;
      } else if (yearsLeft <= 5 || (latestScore !== null && latestScore >= 3)) {
        urgencyLevel = "gemiddeld";
        targetYear = endOfLife;
        reason =
          latestScore !== null && latestScore >= 3
            ? `Conditie matig (NEN 2767 score ${latestScore}), preventief onderhoud aanbevolen`
            : `Einde levensduur over ${yearsLeft} jaar`;
        advies = "Preventief onderhoud aanbevolen";
      } else if (hoogJaar <= currentYear + 5) {
        urgencyLevel = "laag";
        targetYear = Math.max(currentYear, hoogJaar);
        reason = `80% levensduur bereikt in ${hoogJaar} (instandhouding hoog niveau)`;
        advies = `Inspectie aanbevolen in ${targetYear}`;
      }
    }

    if (urgencyLevel) {
      items.push({
        bouwdeelId: b.id,
        bouwdeelCode: b.code,
        bouwdeelName: b.name,
        buildingName,
        latestScore,
        installYear: b.installYear,
        expectedLifespanYears: b.expectedLifespanYears,
        endOfLife,
        replacementCost: b.replacementCost,
        urgencyLevel,
        advies,
        targetYear,
        reason,
      });
    }
  }

  items.sort((a, b) => {
    const uDiff = URGENCY_ORDER[a.urgencyLevel] - URGENCY_ORDER[b.urgencyLevel];
    if (uDiff !== 0) return uDiff;
    return (a.targetYear ?? 9999) - (b.targetYear ?? 9999);
  });

  res.json(items);
});

/**
 * Genereer jaarplan voor een scenario.
 * Maakt mjop_taken aan voor het opgegeven jaar op basis van de begrotingsberekening.
 * Slaat bouwdelen over die al een taak hebben voor dat jaar vanuit dit scenario.
 */
router.post(
  "/mjop/scenarios/:id/jaarplan",
  requireRole(...MJOP_ROLES),
  async (req, res): Promise<void> => {
    const scenarioId = Number(req.params.id);
    if (Number.isNaN(scenarioId)) {
      res.status(400).json({ message: "Ongeldig id" });
      return;
    }
    const [scenario] = await db
      .select()
      .from(mjopScenariosTable)
      .where(eq(mjopScenariosTable.id, scenarioId));
    if (!scenario) {
      res.status(404).json({ message: "Scenario niet gevonden" });
      return;
    }

    const rawJaar = req.body?.jaar;
    const targetJaar = typeof rawJaar === "number" && rawJaar > 2000
      ? rawJaar
      : new Date().getFullYear() + 1;

    // Haal bouwdelen op
    const bdWhere = scenario.buildingId
      ? eq(bouwdelenTable.buildingId, scenario.buildingId)
      : undefined;
    const bouwdelen = await db
      .select({ b: bouwdelenTable, buildingName: buildingsTable.name })
      .from(bouwdelenTable)
      .leftJoin(buildingsTable, eq(bouwdelenTable.buildingId, buildingsTable.id))
      .where(bdWhere);

    // Laatste conditiescore per bouwdeel
    const scores = await db
      .select({ bouwdeelId: conditiemetingenTable.bouwdeelId, score: conditiemetingenTable.score })
      .from(conditiemetingenTable)
      .where(sql`measured_at = (
        select max(c2.measured_at) from ${conditiemetingenTable} c2
        where c2.bouwdeel_id = ${conditiemetingenTable.bouwdeelId}
      )`);
    const scoreMap = new Map(scores.map((s) => [s.bouwdeelId, s.score]));

    // Zoek bestaande taken voor dit jaar+scenario om duplicaten te voorkomen
    const allBdIds = bouwdelen.map(({ b }) => b.id);
    const existingTaken = allBdIds.length
      ? await db
          .select({ bouwdeelId: mjopTakenTable.bouwdeelId })
          .from(mjopTakenTable)
          .where(
            and(
              eq(mjopTakenTable.plannedYear, targetJaar),
              eq(mjopTakenTable.scenarioId, scenarioId),
              inArray(mjopTakenTable.bouwdeelId, allBdIds),
            ),
          )
      : [];
    const bestaandeBdIds = new Set(existingTaken.map((t) => t.bouwdeelId));

    const currentYear = new Date().getFullYear();
    const toCreate: (typeof mjopTakenTable.$inferInsert)[] = [];

    for (const { b } of bouwdelen) {
      if (bestaandeBdIds.has(b.id)) continue; // Sla over: al een taak voor dit jaar

      const endOfLife = b.installYear + b.expectedLifespanYears;
      const latestScore = scoreMap.get(b.id) ?? null;
      let vervangingJaar: number | null = null;
      let reason = "";

      if (scenario.type === "noodzakelijk") {
        if (endOfLife < currentYear) {
          vervangingJaar = currentYear;
          reason = "Einde levensduur overschreden";
        } else if (endOfLife <= currentYear + 15) {
          vervangingJaar = endOfLife;
          reason = "Einde nominale levensduur";
        }
        if (latestScore !== null && latestScore >= 5) {
          const urgentJaar = Math.max(currentYear, endOfLife - 3);
          if (vervangingJaar === null || urgentJaar < vervangingJaar) {
            vervangingJaar = urgentJaar;
            reason = `Slechte conditie (score ${latestScore})`;
          }
        }
      } else {
        const hoogJaar = b.installYear + Math.round(b.expectedLifespanYears * 0.8);
        const targetH = Math.max(currentYear, hoogJaar);
        if (targetH <= currentYear + 15) {
          vervangingJaar = targetH;
          reason = "80% levensduur bereikt (instandhouding hoog niveau)";
        }
        if (latestScore !== null && latestScore >= 3) {
          const urgentJaar = Math.max(currentYear, (vervangingJaar ?? targetH) - 2);
          if (vervangingJaar === null || urgentJaar < vervangingJaar) {
            vervangingJaar = urgentJaar;
            reason = `Conditie matig (score ${latestScore}), vroegtijdige vervanging`;
          }
        }
      }

      if (vervangingJaar === targetJaar) {
        toCreate.push({
          bouwdeelId: b.id,
          title: `[${scenario.name}] Vervanging ${b.name}`,
          description: reason,
          taskType: "vervanging",
          plannedYear: targetJaar,
          estimatedCost: b.replacementCost,
          status: "gepland",
          scenarioId,
        });
      }
    }

    if (!toCreate.length) {
      res.json({ aangemaakt: 0, taken: [], message: "Geen vervangingen gepland voor dit jaar in dit scenario." });
      return;
    }

    const created = await db.insert(mjopTakenTable).values(toCreate).returning();
    res.status(201).json({ aangemaakt: created.length, taken: created });
  },
);

// ── Dagelijkse herinnering: slechte conditie zonder MJOP-opvolging ────────────

function isoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/**
 * Dagelijkse check: signaleer bouwdelen met score ≥ 4 en geen open MJOP-taak
 * die al langer dan SLECHTE_CONDITIE_HERINNERING_DAGEN (standaard 14) onopgevolgd zijn.
 * Stuurt een notificatie naar alle facilitair managers; idempotent via weeksleutel.
 */
export async function checkSlechteConditieZonderMjop(): Promise<void> {
  const thresholdDays = Number(
    process.env["SLECHTE_CONDITIE_HERINNERING_DAGEN"] ?? 14,
  );
  const cutoff = new Date(Date.now() - thresholdDays * 86400000);
  const yearWeek = isoWeekKey(new Date());

  // Bouwdelen waarvan de laatste meting score ≥ 4 heeft, de meting ouder is dan
  // de drempelperiode EN er geen openstaande MJOP-taken zijn.
  const candidates = await db
    .select({
      id: bouwdelenTable.id,
      name: bouwdelenTable.name,
      code: bouwdelenTable.code,
      buildingName: buildingsTable.name,
    })
    .from(bouwdelenTable)
    .leftJoin(buildingsTable, eq(bouwdelenTable.buildingId, buildingsTable.id))
    .where(
      sql`
        (select cm.score from ${conditiemetingenTable} cm
         where cm.bouwdeel_id = ${bouwdelenTable.id}
         order by cm.measured_at desc limit 1) >= 4
        AND (select cm.measured_at from ${conditiemetingenTable} cm
             where cm.bouwdeel_id = ${bouwdelenTable.id}
             order by cm.measured_at desc limit 1) <= ${cutoff}
        AND (select count(*)::int from ${mjopTakenTable} mt
             where mt.bouwdeel_id = ${bouwdelenTable.id}
             and mt.status != 'afgerond') = 0
      `,
    );

  if (!candidates.length) return;

  const managers = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.role, "facilitair_manager"));

  if (!managers.length) return;

  for (const bouwdeel of candidates) {
    const linkPath = `/bouwdelen/${bouwdeel.id}`;
    const title = `Bouwdeel zonder MJOP-opvolging: ${bouwdeel.code} — ${bouwdeel.name}`;
    const body =
      `${bouwdeel.name}${bouwdeel.buildingName ? ` (${bouwdeel.buildingName})` : ""} heeft al meer dan ${thresholdDays} dagen een slechte conditiescore (≥ 4) zonder openstaande MJOP-taak.`;

    for (const manager of managers) {
      await db
        .insert(notificationsTable)
        .values({
          userId: manager.id,
          title,
          body,
          kind: "slechte_conditie_herinnering",
          linkPath,
          referenceKey: `bouwdeel:${bouwdeel.id}:slechte_conditie:${yearWeek}`,
        })
        .onConflictDoNothing();
    }
  }
}

export default router;
