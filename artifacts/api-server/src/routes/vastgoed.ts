import { Router, type IRouter } from "express";
import {
  db,
  organizationsTable,
  sitesTable,
  buildingsTable,
  floorsTable,
  roomsTable,
  workplacesTable,
  roomDossierHistoryTable,
  assetsTable,
  ticketsTable,
  buildingDocumentsTable,
  conditiemetingenTable,
  usersTable,
  bouwdelenTable,
  mjopTakenTable,
  mjopScenariosTable,
  meterReadingsTable,
  wasteRegistrationsTable,
  reservationsTable,
  keysTable,
  keyDoorsTable,
} from "@workspace/db";
import { eq, and, gte, gt, sql, inArray, notInArray, desc, ne, type SQL } from "drizzle-orm";
import {
  UpdateRoomDossierBody,
  CreateBuildingDocumentBody,
} from "@workspace/api-zod";
import { requireAuth, requireRole, TICKET_MANAGER_ROLES } from "../lib/auth";
import { ObjectStorageService } from "../lib/objectStorage";
import { isObjectPathReferenced } from "../lib/storageRefs";

// Beheer van het gebouwdossier (dossier-edits, documenten) is voorbehouden
// aan facilitair manager en beheerder. Documenten kunnen huurcontracten
// bevatten en zijn dus ook alleen voor deze rollen zichtbaar.
export const VASTGOED_MANAGE_ROLES = ["facilitair_manager", "beheerder"];

const router: IRouter = Router();
router.use(requireAuth);

function serializeRoom(redactCounts: boolean, r: {
  room: typeof roomsTable.$inferSelect;
  floorName: string | null;
  buildingId: number | null;
  buildingName: string | null;
  siteName: string | null;
  assetCount?: number | null;
  openTicketCount?: number | null;
}) {
  return {
    id: r.room.id,
    name: r.room.name,
    code: r.room.code,
    floorId: r.room.floorId,
    floorName: r.floorName,
    buildingId: r.buildingId,
    buildingName: r.buildingName,
    siteName: r.siteName,
    functionType: r.room.functionType,
    areaM2: r.room.areaM2,
    areaVvoM2: r.room.areaVvoM2,
    areaBvoM2: r.room.areaBvoM2,
    department: r.room.department,
    floorFinish: r.room.floorFinish,
    capacity: r.room.capacity,
    bookable: r.room.bookable,
    facilities: r.room.facilities,
    assetCount: redactCounts ? 0 : (r.assetCount ?? 0),
    openTicketCount: redactCounts ? 0 : (r.openTicketCount ?? 0),
    updatedAt: r.room.updatedAt.toISOString(),
  };
}

const assetCountSql = sql<number>`(select count(*)::int from ${assetsTable} where ${assetsTable.roomId} = ${roomsTable.id})`;
const openTicketCountSql = sql<number>`(select count(*)::int from ${ticketsTable} where ${ticketsTable.roomId} = ${roomsTable.id} and ${notInArray(ticketsTable.status, ["gereed", "gesloten"])})`;

async function selectRoomRow(id: number) {
  const [row] = await db
    .select({
      room: roomsTable,
      floorName: floorsTable.name,
      buildingId: buildingsTable.id,
      buildingName: buildingsTable.name,
      siteName: sitesTable.name,
      assetCount: assetCountSql,
      openTicketCount: openTicketCountSql,
    })
    .from(roomsTable)
    .leftJoin(floorsTable, eq(roomsTable.floorId, floorsTable.id))
    .leftJoin(buildingsTable, eq(floorsTable.buildingId, buildingsTable.id))
    .leftJoin(sitesTable, eq(buildingsTable.siteId, sitesTable.id))
    .where(eq(roomsTable.id, id));
  return row;
}

router.get("/rooms", async (req, res): Promise<void> => {
  const conditions: SQL[] = [];
  const q = req.query;
  if (typeof q.floorId === "string" && q.floorId)
    conditions.push(eq(roomsTable.floorId, Number(q.floorId)));
  if (typeof q.buildingId === "string" && q.buildingId)
    conditions.push(eq(floorsTable.buildingId, Number(q.buildingId)));
  if (typeof q.bookable === "string" && q.bookable)
    conditions.push(eq(roomsTable.bookable, q.bookable === "true"));
  if (typeof q.minCapacity === "string" && q.minCapacity)
    conditions.push(gte(roomsTable.capacity, Number(q.minCapacity)));

  const rows = await db
    .select({
      room: roomsTable,
      floorName: floorsTable.name,
      buildingId: buildingsTable.id,
      buildingName: buildingsTable.name,
      siteName: sitesTable.name,
      assetCount: assetCountSql,
      openTicketCount: openTicketCountSql,
    })
    .from(roomsTable)
    .leftJoin(floorsTable, eq(roomsTable.floorId, floorsTable.id))
    .leftJoin(buildingsTable, eq(floorsTable.buildingId, buildingsTable.id))
    .leftJoin(sitesTable, eq(buildingsTable.siteId, sitesTable.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(roomsTable.code);

  const redact = !TICKET_MANAGER_ROLES.includes(req.currentUser!.role);
  res.json(rows.map((r) => serializeRoom(redact, r)));
});

router.get("/rooms/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ message: "Ongeldig id" });
    return;
  }
  const row = await selectRoomRow(id);
  if (!row) {
    res.status(404).json({ message: "Ruimte niet gevonden" });
    return;
  }
  const redact = !TICKET_MANAGER_ROLES.includes(req.currentUser!.role);
  res.json(serializeRoom(redact, row));
});

// Velden van het ruimtedossier die via PATCH gewijzigd kunnen worden.
const DOSSIER_FIELDS = [
  "functionType",
  "floorFinish",
  "areaM2",
  "areaVvoM2",
  "areaBvoM2",
  "department",
  "capacity",
  "bookable",
] as const;
type DossierField = (typeof DOSSIER_FIELDS)[number];
type DossierChange = {
  field: DossierField;
  from: string | number | boolean | null;
  to: string | number | boolean | null;
};

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function applyDossierUpdateTx(
  tx: DbTransaction,
  roomId: number,
  current: typeof roomsTable.$inferSelect,
  updates: Partial<Record<DossierField, string | number | boolean | null>>,
  changedById: number,
  isUndo: boolean,
): Promise<DossierChange[]> {
  const changes: DossierChange[] = [];
  const set: Record<string, string | number | boolean | null | Date> = {};
  for (const field of DOSSIER_FIELDS) {
    if (!(field in updates)) continue;
    const to = updates[field] ?? null;
    const from = (current[field] ?? null) as string | number | boolean | null;
    if (from === to) continue;
    set[field] = to;
    changes.push({ field, from, to });
  }
  if (changes.length === 0) return changes;
  set.updatedAt = new Date();
  await tx.update(roomsTable).set(set).where(eq(roomsTable.id, roomId));
  await tx.insert(roomDossierHistoryTable).values({ roomId, changedById, changes, isUndo });
  return changes;
}
router.patch(
  "/rooms/:id/dossier",
  requireRole(...VASTGOED_MANAGE_ROLES),
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) { res.status(400).json({ message: "Ongeldig id" }); return; }
    const parsed = UpdateRoomDossierBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ message: "Ongeldige invoer" }); return; }
    const d = parsed.data;
    const clientTs = new Date(d.updatedAt);
    if (Number.isNaN(clientTs.getTime())) {
      res.status(400).json({ message: "Ongeldige updatedAt" }); return;
    }
    const outcome = await db.transaction(async (tx) => {
      const [current] = await tx.select().from(roomsTable).where(eq(roomsTable.id, id)).for("update");
      if (!current) return { status: 404 as const };
      if (current.updatedAt.getTime() !== clientTs.getTime()) return { status: 409 as const, conflictId: id };
      const updates: Partial<Record<DossierField, string | number | null>> = {};
      for (const field of DOSSIER_FIELDS) {
        const v = (d as Record<string, unknown>)[field];
        if (v !== undefined) updates[field] = v as string | number | null;
      }
      await applyDossierUpdateTx(tx, id, current, updates, req.currentUser!.id, false);
      return { status: 200 as const };
    });
    if (outcome.status === 404) { res.status(404).json({ message: "Ruimte niet gevonden" }); return; }
    const row = await selectRoomRow(id);
    if (!row) { res.status(404).json({ message: "Ruimte niet gevonden" }); return; }
    res.status(outcome.status).json(serializeRoom(false, row));
  },
);

router.get(
  "/rooms/:id/dossier-history",
  requireRole(...VASTGOED_MANAGE_ROLES),
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) { res.status(400).json({ message: "Ongeldig id" }); return; }
    const rows = await db
      .select({ entry: roomDossierHistoryTable, changedByName: usersTable.name })
      .from(roomDossierHistoryTable)
      .leftJoin(usersTable, eq(roomDossierHistoryTable.changedById, usersTable.id))
      .where(eq(roomDossierHistoryTable.roomId, id))
      .orderBy(desc(roomDossierHistoryTable.changedAt), desc(roomDossierHistoryTable.id));
    res.json(rows.map((r) => ({
      id: r.entry.id,
      roomId: r.entry.roomId,
      changedByName: r.changedByName,
      changedAt: r.entry.changedAt.toISOString(),
      isUndo: r.entry.isUndo,
      changes: r.entry.changes as DossierChange[],
    })));
  },
);

router.post(
  "/rooms/:id/dossier-history/undo",
  requireRole(...VASTGOED_MANAGE_ROLES),
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) { res.status(400).json({ message: "Ongeldig id" }); return; }
    const outcome = await db.transaction(async (tx) => {
      const [current] = await tx.select().from(roomsTable).where(eq(roomsTable.id, id)).for("update");
      if (!current) return { status: 404 as const, message: "Ruimte niet gevonden" };
      const [last] = await tx
        .select().from(roomDossierHistoryTable)
        .where(eq(roomDossierHistoryTable.roomId, id))
        .orderBy(desc(roomDossierHistoryTable.changedAt), desc(roomDossierHistoryTable.id))
        .limit(1);
      if (!last) return { status: 404 as const, message: "Geen wijzigingen om ongedaan te maken" };
      if (last.isUndo) return { status: 409 as const, message: "Laatste wijziging is al ongedaan gemaakt" };
      const updates: Partial<Record<DossierField, string | number | boolean | null>> = {};
      for (const c of last.changes as DossierChange[]) updates[c.field] = c.from;
      await applyDossierUpdateTx(tx, id, current, updates, req.currentUser!.id, true);
      return { status: 200 as const };
    });
    if (outcome.status !== 200) { res.status(outcome.status).json({ message: outcome.message }); return; }
    const row = await selectRoomRow(id);
    res.json(serializeRoom(false, row!));
  },
);

/** Undo a specific history entry (only its fields; skips fields changed afterwards). */
router.post(
  "/rooms/:id/dossier-history/:entryId/undo",
  requireRole(...VASTGOED_MANAGE_ROLES),
  async (req, res): Promise<void> => {
    const roomId = Number(req.params.id);
    const entryId = Number(req.params.entryId);
    if (Number.isNaN(roomId) || Number.isNaN(entryId)) {
      res.status(400).json({ message: "Ongeldig id" }); return;
    }

    const result = await db.transaction(async (tx) => {
      // Lock the room first so any concurrent PATCH is serialized before we
      // read history. This guarantees the "changed later" detection is accurate.
      const [current] = await tx.select().from(roomsTable).where(eq(roomsTable.id, roomId)).for("update");
      if (!current) return { status: 404 as const, message: "Ruimte niet gevonden" };

      const [entry] = await tx
        .select()
        .from(roomDossierHistoryTable)
        .where(and(eq(roomDossierHistoryTable.id, entryId), eq(roomDossierHistoryTable.roomId, roomId)));
      if (!entry) return { status: 404 as const, message: "Wijzigingsregel niet gevonden" };
      if (entry.isUndo) return { status: 409 as const, message: "Een terugdraaiing kan zelf niet worden teruggedraaid" };

      // Detect fields changed in later entries (read while holding the room lock)
      const laterEntries = await tx
        .select()
        .from(roomDossierHistoryTable)
        .where(and(eq(roomDossierHistoryTable.roomId, roomId), gt(roomDossierHistoryTable.id, entryId)));
      const changedLater = new Set<string>();
      for (const later of laterEntries) {
        for (const c of (later.changes as DossierChange[])) changedLater.add(c.field);
      }

      const changes = entry.changes as DossierChange[];
      const skippedFields: string[] = [];
      const updates: Partial<Record<DossierField, string | number | boolean | null>> = {};
      for (const c of changes) {
        if (changedLater.has(c.field)) {
          skippedFields.push(c.field);
        } else {
          updates[c.field as DossierField] = c.from;
        }
      }

      const appliedChanges =
        Object.keys(updates).length > 0
          ? await applyDossierUpdateTx(tx, roomId, current, updates, req.currentUser!.id, true)
          : [];

      // applyDossierUpdateTx skips the history insert when no values actually
      // changed (e.g. all fields were already reverted by an earlier undo).
      // Always record the undo attempt so the history stays complete.
      if (appliedChanges.length === 0) {
        await tx.insert(roomDossierHistoryTable).values({
          roomId,
          changedById: req.currentUser!.id,
          changes: [],
          isUndo: true,
        });
      }

      return { status: 200 as const, skippedFields };
    });

    if (result.status !== 200) {
      res.status(result.status).json({ message: (result as { message: string }).message }); return;
    }
    const row = await selectRoomRow(roomId);
    res.json({ room: serializeRoom(false, row!), skippedFields: result.skippedFields });
  },
);
router.get("/floors/:id/plan", async (req, res): Promise<void> => {
    const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ message: "Ongeldig id" });
    return;
  }
  const [floor] = await db
    .select({
      id: floorsTable.id,
      name: floorsTable.name,
      level: floorsTable.level,
      buildingId: buildingsTable.id,
      buildingName: buildingsTable.name,
    })
    .from(floorsTable)
    .innerJoin(buildingsTable, eq(floorsTable.buildingId, buildingsTable.id))
    .where(eq(floorsTable.id, id));
  if (!floor) {
    res.status(404).json({ message: "Verdieping niet gevonden" });
    return;
  }
  const rooms = await db
    .select()
    .from(roomsTable)
    .where(eq(roomsTable.floorId, id))
    .orderBy(roomsTable.code);
  res.json({
    floorId: floor.id,
    floorName: floor.name,
    level: floor.level,
    buildingId: floor.buildingId,
    buildingName: floor.buildingName,
    rooms: rooms.map((r) => ({
      id: r.id,
      name: r.name,
      code: r.code,
      functionType: r.functionType,
      areaM2: r.areaM2,
      department: r.department,
      capacity: r.capacity,
      bookable: r.bookable,
      updatedAt: r.updatedAt ? r.updatedAt.toISOString() : null,
    })),
  });
});

router.get("/buildings/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ message: "Ongeldig id" });
    return;
  }
  const [building] = await db
    .select()
    .from(buildingsTable)
    .where(eq(buildingsTable.id, id));
  if (!building) {
    res.status(404).json({ message: "Gebouw niet gevonden" });
    return;
  }
  const floors = await db
    .select()
    .from(floorsTable)
    .where(eq(floorsTable.buildingId, id))
    .orderBy(floorsTable.level);
  const [stats] = await db
    .select({
      roomCount: sql<number>`count(*)::int`,
      totalAreaM2: sql<number>`coalesce(sum(${roomsTable.areaM2}), 0)::float`,
    })
    .from(roomsTable)
    .innerJoin(floorsTable, eq(roomsTable.floorId, floorsTable.id))
    .where(eq(floorsTable.buildingId, id));
  res.json({
    ...building,
    floorCount: floors.length,
    roomCount: stats?.roomCount ?? 0,
    totalAreaM2: stats?.totalAreaM2 ?? 0,
    floors: floors.map((f) => ({
      id: f.id,
      name: f.name,
      level: f.level,
      roomCount: 0,
    })),
  });
});

router.get(
  "/buildings/:id/documents",
  requireRole(...VASTGOED_MANAGE_ROLES),
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      res.status(400).json({ message: "Ongeldig id" });
      return;
    }
    const rows = await db
      .select({
        doc: buildingDocumentsTable,
        uploadedByName: usersTable.name,
      })
      .from(buildingDocumentsTable)
      .leftJoin(usersTable, eq(buildingDocumentsTable.uploadedById, usersTable.id))
      .where(eq(buildingDocumentsTable.buildingId, id))
      .orderBy(desc(buildingDocumentsTable.createdAt));
    res.json(
      rows.map((r) => ({
        id: r.doc.id,
        buildingId: r.doc.buildingId,
        title: r.doc.title,
        category: r.doc.category,
        objectPath: r.doc.objectPath,
        contentType: r.doc.contentType,
        sizeBytes: r.doc.sizeBytes,
        uploadedByName: r.uploadedByName,
        createdAt: r.doc.createdAt.toISOString(),
      })),
    );
  },
);

router.post(
  "/buildings/:id/documents",
  requireRole(...VASTGOED_MANAGE_ROLES),
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      res.status(400).json({ message: "Ongeldig id" });
      return;
    }
    const parsed = CreateBuildingDocumentBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Ongeldige invoer" });
      return;
    }
    if (!parsed.data.objectPath.startsWith("/objects/uploads/")) {
      res.status(400).json({ message: "Ongeldig objectpad" });
      return;
    }
    const [building] = await db
      .select({ id: buildingsTable.id })
      .from(buildingsTable)
      .where(eq(buildingsTable.id, id));
    if (!building) {
      res.status(404).json({ message: "Gebouw niet gevonden" });
      return;
    }

    // Idempotentie: als het document-record al bestaat voor dit objectPath
    // (bv. de vorige request slaagde maar de client verloor het antwoord),
    // geef het bestaande record terug in plaats van een duplicaat aan te maken.
    const [existingDoc] = await db
      .select({
        doc: buildingDocumentsTable,
        uploadedByName: usersTable.name,
      })
      .from(buildingDocumentsTable)
      .leftJoin(usersTable, eq(buildingDocumentsTable.uploadedById, usersTable.id))
      .where(eq(buildingDocumentsTable.objectPath, parsed.data.objectPath))
      .limit(1);
    if (existingDoc) {
      res.status(200).json({
        id: existingDoc.doc.id,
        buildingId: existingDoc.doc.buildingId,
        title: existingDoc.doc.title,
        category: existingDoc.doc.category,
        objectPath: existingDoc.doc.objectPath,
        contentType: existingDoc.doc.contentType,
        sizeBytes: existingDoc.doc.sizeBytes,
        uploadedByName: existingDoc.uploadedByName,
        createdAt: existingDoc.doc.createdAt.toISOString(),
      });
      return;
    }

    let doc: typeof buildingDocumentsTable.$inferSelect;
    try {
      const [inserted] = await db
        .insert(buildingDocumentsTable)
        .values({
          buildingId: id,
          title: parsed.data.title,
          category: parsed.data.category,
          objectPath: parsed.data.objectPath,
          contentType: parsed.data.contentType,
          sizeBytes: parsed.data.sizeBytes,
          uploadedById: req.currentUser!.id,
        })
        .returning();
      doc = inserted!;
    } catch (err) {
      req.log.error(
        { err, objectPath: parsed.data.objectPath },
        "Document-record aanmaken mislukt na geslaagde upload",
      );
      // Het geüploade bestand blijft tijdelijk als wees-object in storage
      // staan. De periodieke opruimroutine verwijdert het na 24 uur.
      // De client kan het opslaan opnieuw proberen zonder het bestand
      // opnieuw te uploaden.
      res.status(500).json({
        message:
          "Het bestand is geüpload maar kon niet worden opgeslagen als document. " +
          "Gebruik de knop 'Opnieuw proberen' om het opslaan te herhalen.",
      });
      return;
    }
    res.status(201).json({
      id: doc.id,
      buildingId: doc.buildingId,
      title: doc.title,
      category: doc.category,
      objectPath: doc.objectPath,
      contentType: doc.contentType,
      sizeBytes: doc.sizeBytes,
      uploadedByName: req.currentUser!.name,
      createdAt: doc.createdAt.toISOString(),
    });
  },
);

router.delete(
  "/building-documents/:id",
  requireRole(...VASTGOED_MANAGE_ROLES),
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      res.status(400).json({ message: "Ongeldig id" });
      return;
    }

    const [existing] = await db
      .select({ id: buildingDocumentsTable.id, objectPath: buildingDocumentsTable.objectPath })
      .from(buildingDocumentsTable)
      .where(eq(buildingDocumentsTable.id, id));
    if (!existing) {
      res.status(404).json({ message: "Document niet gevonden" });
      return;
    }
    await db
      .delete(buildingDocumentsTable)
      .where(eq(buildingDocumentsTable.id, id));

    // Verwijder het bestand uit object storage alleen als geen enkel ander record
    // er nog naar verwijst (gecentraliseerde cross-table check).
    try {
      if (!(await isObjectPathReferenced(existing.objectPath))) {
    const storageService = new ObjectStorageService();
        await storageService.deleteObject(existing.objectPath);
      }
    } catch (err) {
      req.log.warn(
        { err, objectPath: existing.objectPath },
        "Kon bijbehorend object niet verwijderen uit storage; wees-bestand mogelijk achtergebleven",
      );
    }

    res.status(204).end();
  },
);

router.delete(
  "/buildings/:id",
  requireRole(...VASTGOED_MANAGE_ROLES),
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      res.status(400).json({ message: "Ongeldig id" });
      return;
    }

    // Controleer of het gebouw bestaat.
    const [existing] = await db
      .select({ id: buildingsTable.id })
      .from(buildingsTable)
      .where(eq(buildingsTable.id, id));
    if (!existing) {
      res.status(404).json({ message: "Gebouw niet gevonden" });
      return;
    }

    // Haal alle gekoppelde documenten op vóór verwijdering.
    const docs = await db
      .select({ id: buildingDocumentsTable.id, objectPath: buildingDocumentsTable.objectPath })
      .from(buildingDocumentsTable)
      .where(eq(buildingDocumentsTable.buildingId, id));

    // Verwijder DB-records: documenten eerst (FK-beperking), dan het gebouw zelf.
    if (docs.length > 0) {
      await db
        .delete(buildingDocumentsTable)
        .where(eq(buildingDocumentsTable.buildingId, id));
    }
    await db.delete(buildingsTable).where(eq(buildingsTable.id, id));

    // Ruim storage-bestanden op (best effort).
    // Omdat de document-rijen al verwijderd zijn, controleert isObjectPathReferenced
    // nu alleen nog contract-documenten en MJOP-inspectiefoto's.
    const storageService = new ObjectStorageService();
    for (const doc of docs) {
      try {
        if (!(await isObjectPathReferenced(doc.objectPath))) {
          await storageService.deleteObject(doc.objectPath);
          req.log.info(
            { objectPath: doc.objectPath, buildingId: id, documentId: doc.id },
            "Storage-bestand verwijderd bij verwijdering gebouw",
          );
        }
      } catch (err) {
        req.log.warn(
          { err, objectPath: doc.objectPath, buildingId: id, documentId: doc.id },
          "Kon bijbehorend object niet verwijderen uit storage; wees-bestand mogelijk achtergebleven",
        );
      }
    }

    res.status(204).end();
  },
);

router.get("/floors/:id/dossier-history", requireRole(...VASTGOED_MANAGE_ROLES), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) { res.status(400).json({ message: "Ongeldig id" }); return; }
  const [floor] = await db.select({ id: floorsTable.id }).from(floorsTable).where(eq(floorsTable.id, id));
  if (!floor) { res.status(404).json({ message: "Verdieping niet gevonden" }); return; }
  const rows = await db
    .select({
      id: roomDossierHistoryTable.id,
      roomId: roomDossierHistoryTable.roomId,
      roomName: roomsTable.name,
      roomCode: roomsTable.code,
      changedByName: usersTable.name,
      changedAt: roomDossierHistoryTable.changedAt,
      isUndo: roomDossierHistoryTable.isUndo,
      changes: roomDossierHistoryTable.changes,
    })
    .from(roomDossierHistoryTable)
    .innerJoin(roomsTable, eq(roomDossierHistoryTable.roomId, roomsTable.id))
    .leftJoin(usersTable, eq(roomDossierHistoryTable.changedById, usersTable.id))
    .where(eq(roomsTable.floorId, id))
    .orderBy(desc(roomDossierHistoryTable.changedAt))
    .limit(50);
  res.json(rows.map((r) => ({
    id: r.id,
    roomId: r.roomId,
    roomName: r.roomName,
    roomCode: r.roomCode,
    changedByName: r.changedByName ?? null,
    changedAt: r.changedAt.toISOString(),
    isUndo: r.isUndo,
    changes: r.changes,
  })));
});

router.delete(
  "/sites/:id",
  requireRole(...VASTGOED_MANAGE_ROLES),
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) { res.status(400).json({ message: "Ongeldig id" }); return; }

    const [site] = await db.select({ id: sitesTable.id }).from(sitesTable).where(eq(sitesTable.id, id));
    if (!site) { res.status(404).json({ message: "Locatie niet gevonden" }); return; }

    // 1. Verzamel alle building-, floor- en room-IDs onder deze locatie
    const buildings = await db
      .select({ id: buildingsTable.id })
      .from(buildingsTable)
      .where(eq(buildingsTable.siteId, id));
    const buildingIds = buildings.map((b) => b.id);

    if (buildingIds.length > 0) {
      const floors = await db
        .select({ id: floorsTable.id })
        .from(floorsTable)
        .where(inArray(floorsTable.buildingId, buildingIds));
      const floorIds = floors.map((f) => f.id);

      const rooms = floorIds.length > 0
        ? await db.select({ id: roomsTable.id }).from(roomsTable).where(inArray(roomsTable.floorId, floorIds))
        : [];
      const roomIds = rooms.map((r) => r.id);

      // 2. Verzamel alle te verwijderen storage-paden VÓÓR de DB-verwijdering.
      //    isObjectPathReferenced controleert building_documents én conditiemetingen (JSONB),
      //    dus de rijen moeten al weg zijn voordat we de check uitvoeren.

      // 2a. Building-document paden
      const docs = await db
        .select({ id: buildingDocumentsTable.id, objectPath: buildingDocumentsTable.objectPath })
        .from(buildingDocumentsTable)
        .where(inArray(buildingDocumentsTable.buildingId, buildingIds));
      const docPaths = docs.map((d) => d.objectPath);

      // 2b. Conditiemeting-fotopaden uit JSONB (best effort: lege array bij fout)
      const bouwdelen = await db
        .select({ id: bouwdelenTable.id })
        .from(bouwdelenTable)
        .where(inArray(bouwdelenTable.buildingId, buildingIds));
      const bouwdeelIds = bouwdelen.map((b) => b.id);

      let conditionPhotoPaths: string[] = [];
      if (bouwdeelIds.length > 0) {
        const rows = await db.execute<{ photo_path: string }>(sql`
          SELECT DISTINCT elem->>'photoPath' AS photo_path
          FROM ${conditiemetingenTable},
               jsonb_array_elements(${conditiemetingenTable.gebreken}) AS elem
          WHERE ${conditiemetingenTable.bouwdeelId} = ANY(ARRAY[${sql.join(bouwdeelIds.map((bid) => sql`${bid}`), sql`, `)}]::int[])
            AND elem->>'photoPath' IS NOT NULL
        `);
        conditionPhotoPaths = rows.rows.map((r) => r.photo_path);
      }

      // 3. Verwijder DB-records in de juiste FK-volgorde
      //    3a. MJOP: taken, conditiemetingen, bouwdelen
      if (bouwdeelIds.length > 0) {
        await db.delete(mjopTakenTable).where(inArray(mjopTakenTable.bouwdeelId, bouwdeelIds));
        await db.delete(conditiemetingenTable).where(inArray(conditiemetingenTable.bouwdeelId, bouwdeelIds));
        await db.delete(bouwdelenTable).where(inArray(bouwdelenTable.id, bouwdeelIds));
      }

      // 3b. Building-documents
      await db.delete(buildingDocumentsTable).where(inArray(buildingDocumentsTable.buildingId, buildingIds));

      // 5. MJOP-scenario's: ontkoppel de buildingId (nullable)
      await db
        .update(mjopScenariosTable)
        .set({ buildingId: null })
        .where(inArray(mjopScenariosTable.buildingId, buildingIds));

      // 6. Duurzaamheid: verwijder meterstanden en afvalregistraties (NOT NULL buildingId)
      await db.delete(meterReadingsTable).where(inArray(meterReadingsTable.buildingId, buildingIds));
      await db.delete(wasteRegistrationsTable).where(inArray(wasteRegistrationsTable.buildingId, buildingIds));

      // 7. Ontkoppel sleutel-gerelateerde verwijzingen (nullable)
      await db
        .update(keysTable)
        .set({ buildingId: null })
        .where(inArray(keysTable.buildingId, buildingIds));
      if (roomIds.length > 0) {
        await db.update(keyDoorsTable).set({ roomId: null }).where(inArray(keyDoorsTable.roomId, roomIds));

        // 8. Ontkoppel assets, tickets en reserveringen (nullable roomId/workplaceId)
        await db.update(assetsTable).set({ roomId: null }).where(inArray(assetsTable.roomId, roomIds));
        await db.update(ticketsTable).set({ roomId: null }).where(inArray(ticketsTable.roomId, roomIds));
        await db.update(reservationsTable).set({ roomId: null }).where(inArray(reservationsTable.roomId, roomIds));
      }

      if (floorIds.length > 0) {
        // Ontkoppel werkplek-reserveringen via workplaces
        const workplaces = await db
          .select({ id: workplacesTable.id })
          .from(workplacesTable)
          .where(inArray(workplacesTable.floorId, floorIds));
        const workplaceIds = workplaces.map((w) => w.id);
        if (workplaceIds.length > 0) {
          await db
            .update(reservationsTable)
            .set({ workplaceId: null })
            .where(inArray(reservationsTable.workplaceId, workplaceIds));
        }
      }

      // 9. Verwijder kamer-dossierhistorie, werkplekken, kamers, verdiepingen en gebouwen
      if (roomIds.length > 0) {
        await db.delete(roomDossierHistoryTable).where(inArray(roomDossierHistoryTable.roomId, roomIds));
        await db.delete(roomsTable).where(inArray(roomsTable.id, roomIds));
      }
      if (floorIds.length > 0) {
        await db.delete(workplacesTable).where(inArray(workplacesTable.floorId, floorIds));
        await db.delete(floorsTable).where(inArray(floorsTable.id, floorIds));
      }
      await db.delete(buildingsTable).where(inArray(buildingsTable.id, buildingIds));

      // 10. Verwijder storage-bestanden NADAT alle DB-rijen weg zijn.
      //     isObjectPathReferenced vindt nu geen rijen meer, dus de bestanden worden verwijderd.
      const storageService = new ObjectStorageService();
      const allStoragePaths = [...new Set([...docPaths, ...conditionPhotoPaths])];
      for (const objectPath of allStoragePaths) {
        try {
          if (!(await isObjectPathReferenced(objectPath))) {
            await storageService.deleteObject(objectPath);
            req.log.info({ objectPath, siteId: id }, "Storage-bestand verwijderd bij verwijdering locatie");
          }
        } catch (err) {
          req.log.warn({ err, objectPath, siteId: id }, "Kon storage-bestand niet verwijderen bij verwijdering locatie");
        }
      }
    }

    // 11. Verwijder de locatie zelf
    await db.delete(sitesTable).where(eq(sitesTable.id, id));
    req.log.info({ siteId: id, buildingCount: buildingIds.length }, "Locatie verwijderd");
    res.status(204).end();
  },
);
router.get("/structure", async (_req, res): Promise<void> => {
  const [orgs, sites, buildings, floors, roomCounts] = await Promise.all([
    db.select().from(organizationsTable),
    db.select().from(sitesTable),
    db.select().from(buildingsTable),
    db.select().from(floorsTable).orderBy(floorsTable.level),
    db
      .select({
        floorId: roomsTable.floorId,
        count: sql<number>`count(*)::int`,
      })
      .from(roomsTable)
      .groupBy(roomsTable.floorId),
  ]);
  const countByFloor = new Map(roomCounts.map((r) => [r.floorId, r.count]));
  res.json(
    orgs.map((o) => ({
      id: o.id,
      name: o.name,
      sites: sites
        .filter((s) => s.organizationId === o.id)
        .map((s) => ({
          id: s.id,
          name: s.name,
          city: s.city,
          buildings: buildings
            .filter((b) => b.siteId === s.id)
            .map((b) => ({
              id: b.id,
              name: b.name,
              address: b.address,
              floors: floors
                .filter((f) => f.buildingId === b.id)
                .map((f) => ({
                  id: f.id,
                  name: f.name,
                  level: f.level,
                  roomCount: countByFloor.get(f.id) ?? 0,
                })),
            })),
        })),
    })),
  );
});

export default router;
