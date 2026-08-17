import { Router, type IRouter } from "express";
import {
  db,
  organizationsTable,
  sitesTable,
  buildingsTable,
  floorsTable,
  roomsTable,
  assetsTable,
  ticketsTable,
  buildingDocumentsTable,
  conditiemetingenTable,
  usersTable,
  roomDossierHistoryTable,
} from "@workspace/db";
import { eq, and, gte, sql, notInArray, desc, ne, type SQL } from "drizzle-orm";
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
] as const;
type DossierField = (typeof DOSSIER_FIELDS)[number];
type DossierChange = {
  field: DossierField;
  from: string | number | null;
  to: string | number | null;
};

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function applyDossierUpdateTx(
  tx: DbTransaction,
  roomId: number,
  current: typeof roomsTable.$inferSelect,
  updates: Partial<Record<DossierField, string | number | null>>,
  changedById: number,
  isUndo: boolean,
): Promise<DossierChange[]> {
  const changes: DossierChange[] = [];
  const set: Record<string, string | number | null | Date> = {};
  for (const field of DOSSIER_FIELDS) {
    if (!(field in updates)) continue;
    const to = updates[field] ?? null;
    const from = (current[field] ?? null) as string | number | null;
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
      if (current.updatedAt.getTime() !== clientTs.getTime()) return { status: 409 as const };
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
      const updates: Partial<Record<DossierField, string | number | null>> = {};
      for (const c of last.changes as DossierChange[]) updates[c.field] = c.from;
      await applyDossierUpdateTx(tx, id, current, updates, req.currentUser!.id, true);
      return { status: 200 as const };
    });
    if (outcome.status !== 200) { res.status(outcome.status).json({ message: outcome.message }); return; }
    const row = await selectRoomRow(id);
    res.json(serializeRoom(false, row!));
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
