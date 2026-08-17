import { Router, type IRouter } from "express";
import {
  db,
  meterReadingsTable,
  wasteRegistrationsTable,
  buildingsTable,
  usersTable,
} from "@workspace/db";
import { eq, and, desc, gte, lte, lt, type SQL } from "drizzle-orm";
import {
  CreateMeterReadingBody,
  ImportMeterReadingsBody,
  CreateWasteRegistrationBody,
  CreateMeterReadingBody as UpdateMeterReadingBody,
} from "@workspace/api-zod";
import { requireAuth, requireRole } from "../lib/auth";
const router: IRouter = Router();
router.use(requireAuth);
const SUSTAIN_ROLES = ["facilitair_manager", "beheerder", "servicedesk"] as const;
router.use("/meter-readings", requireRole(...SUSTAIN_ROLES));
router.use("/waste-registrations", requireRole(...SUSTAIN_ROLES));
router.use("/sustainability", requireRole(...SUSTAIN_ROLES));

const METER_TYPES = ["elektriciteit", "gas", "water"];
const WASTE_CATEGORIES = ["restafval", "papier", "gft", "plastic", "glas", "chemisch"];

function readingBaseQuery() {
  return db
    .select({
      reading: meterReadingsTable,
      buildingName: buildingsTable.name,
      registeredByName: usersTable.name,
    })
    .from(meterReadingsTable)
    .leftJoin(buildingsTable, eq(meterReadingsTable.buildingId, buildingsTable.id))
    .leftJoin(usersTable, eq(meterReadingsTable.registeredById, usersTable.id));
}

function serializeReading(r: {
  reading: typeof meterReadingsTable.$inferSelect;
  buildingName: string | null;
  registeredByName: string | null;
}) {
  return {
    id: r.reading.id,
    buildingId: r.reading.buildingId,
    buildingName: r.buildingName,
    meterType: r.reading.meterType,
    readingDate: r.reading.readingDate,
    value: r.reading.value,
    unit: r.reading.unit,
    source: r.reading.source,
    registeredById: r.reading.registeredById,
    registeredByName: r.registeredByName,
  };
}

router.get("/meter-readings", async (req, res): Promise<void> => {
  const conditions: SQL[] = [];
  if (typeof req.query.buildingId === "string" && req.query.buildingId)
    conditions.push(eq(wasteRegistrationsTable.buildingId, Number(req.query.buildingId)));
  const rows = await wasteBaseQuery()
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(wasteRegistrationsTable.registrationDate));
  res.json(rows.map(serializeWaste));
});

router.post("/waste-registrations", async (req, res): Promise<void> => {
  const parsed = CreateWasteRegistrationBody.safeParse(req.body);
  if (!parsed.success || !WASTE_CATEGORIES.includes(parsed.data.category)) {
    res.status(400).json({ message: "Ongeldige invoer" });
    return;
  }
  const d = parsed.data;
  const [created] = await db
    .insert(wasteRegistrationsTable)
    .values({
      buildingId: d.buildingId,
      registrationDate: d.registrationDate,
      category: d.category,
      weightKg: d.weightKg,
      registeredById: req.currentUser!.id,
    })
    .returning();
  const [row] = await wasteBaseQuery().where(eq(wasteRegistrationsTable.id, created!.id));
  res.status(201).json(serializeWaste(row!));
});

router.post("/meter-readings/import", async (req, res): Promise<void> => {
  const parsed = ImportMeterReadingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Ongeldige invoer" });
    return;
  }
  let imported = 0;
  let skipped = 0;
  for (const row of parsed.data.rows) {
    const validDate = /^\d{4}-\d{2}-\d{2}$/.test(row.readingDate);
    if (!METER_TYPES.includes(row.meterType) || !validDate || !(row.value >= 0)) {
      skipped++;
      continue;
    }
    await db.insert(meterReadingsTable).values({
      buildingId: row.buildingId,
      meterType: row.meterType,
      readingDate: row.readingDate,
      value: row.value,
      unit: row.unit,
      source: "csv_import",
      registeredById: req.currentUser!.id,
    });
    imported++;
  }
  res.status(201).json({
    imported,
    skipped,
    message: `${imported} meterstanden geïmporteerd, ${skipped} rijen overgeslagen.`,
  });
});

// Task #16: correctie van een meterstand
router.patch("/meter-readings/:id", requireRole(...SUSTAIN_ROLES), async (req, res): Promise<void> => {
  const id = Number(req.params.id);

  const body = req.body as { readingDate?: unknown; value?: unknown };
  const updates: Partial<typeof meterReadingsTable.$inferInsert> = {};
  if (typeof body.readingDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.readingDate))
    updates.readingDate = body.readingDate;
  const v = Number(body.value);
  if (!Number.isNaN(v) && v >= 0) updates.value = v;
  if (Object.keys(updates).length === 0) {
    res.status(400).json({ message: "Geen geldige velden opgegeven" });
    return;
  }
  const [updatedRow] = await db
    .update(meterReadingsTable)
    .set(updates)
    .where(eq(meterReadingsTable.id, id))
    .returning();
  if (!updatedRow) {
    res.status(404).json({ message: "Meterstand niet gevonden" });
    return;
  }
  const [row] = await readingBaseQuery().where(eq(meterReadingsTable.id, id));
  res.json(serializeReading(row!));
});

// Task #16: verwijderen van een meterstand
router.delete("/meter-readings/:id", requireRole(...SUSTAIN_ROLES), async (req, res): Promise<void> => {
  const id = Number(req.params.id);

  const body = req.body as { readingDate?: unknown; value?: unknown };

  const [deleted] = await db
    .delete(meterReadingsTable)
    .where(eq(meterReadingsTable.id, id))
    .returning();
  if (!deleted) {
    res.status(404).json({ message: "Meterstand niet gevonden" });
    return;
  }
  res.status(204).end();
});

function wasteBaseQuery() {
  return db
    .select({
      waste: wasteRegistrationsTable,
      buildingName: buildingsTable.name,
      registeredByName: usersTable.name,
    })
    .from(wasteRegistrationsTable)
    .leftJoin(buildingsTable, eq(wasteRegistrationsTable.buildingId, buildingsTable.id))
    .leftJoin(usersTable, eq(wasteRegistrationsTable.registeredById, usersTable.id));
}

function serializeWaste(r: {
  waste: typeof wasteRegistrationsTable.$inferSelect;
  buildingName: string | null;
  registeredByName: string | null;
}) {
  return {
    id: r.waste.id,
    buildingId: r.waste.buildingId,
    buildingName: r.buildingName,
    registrationDate: r.waste.registrationDate,
    category: r.waste.category,
    weightKg: r.waste.weightKg,
    registeredById: r.waste.registeredById,
    registeredByName: r.registeredByName,
  };
}

router.get("/waste-registrations", async (req, res): Promise<void> => {
  const conditions: SQL[] = [];
  if (typeof req.query.buildingId === "string" && req.query.buildingId)
    conditions.push(eq(wasteRegistrationsTable.buildingId, Number(req.query.buildingId)));
  const rows = await wasteBaseQuery()
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(wasteRegistrationsTable.registrationDate));
  res.json(rows.map(serializeWaste));
});

router.post("/waste-registrations", async (req, res): Promise<void> => {
  const parsed = CreateWasteRegistrationBody.safeParse(req.body);
  if (!parsed.success || !WASTE_CATEGORIES.includes(parsed.data.category)) {
    res.status(400).json({ message: "Ongeldige invoer" });
    return;
  }
  const d = parsed.data;
  const [created] = await db
    .insert(wasteRegistrationsTable)
    .values({
      buildingId: d.buildingId,
      registrationDate: d.registrationDate,
      category: d.category,
      weightKg: d.weightKg,
      registeredById: req.currentUser!.id,
    })
    .returning();
  const [row] = await wasteBaseQuery().where(eq(wasteRegistrationsTable.id, created!.id));
  res.status(201).json(serializeWaste(row!));
});

router.get("/sustainability/report", async (req, res): Promise<void> => {
  const buildingId =
    typeof req.query.buildingId === "string" && req.query.buildingId
      ? Number(req.query.buildingId)
      : null;
  const dateFrom =
    typeof req.query.dateFrom === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.dateFrom)
      ? req.query.dateFrom
      : null;
  const dateTo =
    typeof req.query.dateTo === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.dateTo)
      ? req.query.dateTo
      : null;

  const readingConditions: SQL[] = [];
  if (buildingId) readingConditions.push(eq(meterReadingsTable.buildingId, buildingId));
  if (dateFrom) readingConditions.push(gte(meterReadingsTable.readingDate, dateFrom));
  if (dateTo) readingConditions.push(lte(meterReadingsTable.readingDate, dateTo));

  const readings = await db
    .select()
    .from(meterReadingsTable)
    .where(readingConditions.length ? and(...readingConditions) : undefined)
    .orderBy(meterReadingsTable.readingDate);

  // Verbruik = verschil tussen opeenvolgende cumulatieve standen per gebouw+type.
  const usageByMonth = new Map<string, { usage: number; unit: string }>();
  const grouped = new Map<string, typeof readings>();
  for (const r of readings) {
    const key = `${r.buildingId}|${r.meterType}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(r);
  }

  // Als dateFrom is ingesteld: haal per serie de laatste meterstand vóór dateFrom op als
  // baseline, zodat de eerste verbruiksdelta binnen de periode niet verloren gaat.
  if (dateFrom) {
    for (const [key, series] of grouped.entries()) {
      const [bIdStr, mType] = key.split("|");
      const bIdNum = Number(bIdStr);
      const baselineWhere: SQL[] = [
        eq(meterReadingsTable.buildingId, bIdNum),
        eq(meterReadingsTable.meterType, mType!),
        lt(meterReadingsTable.readingDate, dateFrom),
      ];
      const [baseline] = await db
        .select()
        .from(meterReadingsTable)
        .where(and(...baselineWhere))
        .orderBy(desc(meterReadingsTable.readingDate))
        .limit(1);
      if (baseline) {
        series.unshift(baseline);
      }
    }
  }
  for (const series of grouped.values()) {
    for (let i = 1; i < series.length; i++) {
      const prev = series[i - 1]!;
      const cur = series[i]!;
      const usage = cur.value - prev.value;
      if (usage < 0) continue;
      const month = cur.readingDate.slice(0, 7);
      const usageKey = `${month}|${cur.meterType}`;
      const entry = usageByMonth.get(usageKey) ?? { usage: 0, unit: cur.unit };
      entry.usage += usage;
      usageByMonth.set(usageKey, entry);
    }
  }
  const monthlyUsage = Array.from(usageByMonth.entries())
    .map(([key, v]) => {
      const [month, meterType] = key.split("|");
      return { month: month!, meterType: meterType!, usage: Math.round(v.usage * 100) / 100, unit: v.unit };
    })
    .sort((a, b) => a.month.localeCompare(b.month));

  const wasteConditions: SQL[] = [];
  if (buildingId) wasteConditions.push(eq(wasteRegistrationsTable.buildingId, buildingId));
  if (dateFrom) wasteConditions.push(gte(wasteRegistrationsTable.registrationDate, dateFrom));
  if (dateTo) wasteConditions.push(lte(wasteRegistrationsTable.registrationDate, dateTo));

  const waste = await db
    .select()
    .from(wasteRegistrationsTable)
    .where(wasteConditions.length ? and(...wasteConditions) : undefined);

  const byCategory = new Map<string, number>();
  const byMonthCat = new Map<string, number>();
  for (const w of waste) {
    byCategory.set(w.category, (byCategory.get(w.category) ?? 0) + w.weightKg);
    const key = `${w.registrationDate.slice(0, 7)}|${w.category}`;
    byMonthCat.set(key, (byMonthCat.get(key) ?? 0) + w.weightKg);
  }
  res.json({
    monthlyUsage,
    wasteByCategory: Array.from(byCategory.entries()).map(([category, totalKg]) => ({
      category,
      totalKg: Math.round(totalKg * 10) / 10,
    })),
    wasteByMonth: Array.from(byMonthCat.entries())
      .map(([key, totalKg]) => {
        const [month, category] = key.split("|");
        return { month: month!, category: category!, totalKg: Math.round(totalKg * 10) / 10 };
      })
      .sort((a, b) => a.month.localeCompare(b.month)),
  });
});

export default router;
