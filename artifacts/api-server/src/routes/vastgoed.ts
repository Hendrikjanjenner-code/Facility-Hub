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
  usersTable,
} from "@workspace/db";
import { eq, and, gte, sql, notInArray, desc, type SQL } from "drizzle-orm";
import {
  UpdateRoomDossierBody,
  CreateBuildingDocumentBody,
} from "@workspace/api-zod";
import { requireAuth, requireRole, TICKET_MANAGER_ROLES } from "../lib/auth";
import { ObjectStorageService } from "../lib/objectStorage";
import { isObjectPathReferenced } from "../lib/storageRefs";

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
    updatedAt: r.room.updatedAt?.toISOString() ?? new Date().toISOString(),
  };
}

const assetCountSql = sql<number>`(select count(*)::int from ${assetsTable} where ${assetsTable.roomId} = ${roomsTable.id})`;
const openTicketCountSql = sql<number>`(select count(*)::int from ${ticketsTable} where ${ticketsTable.roomId} = ${roomsTable.id} and ${notInArray(ticketsTable.status, ["gereed", "gesloten"])})`;

const roomSelectCols = {
  room: roomsTable,
  floorName: floorsTable.name,
  buildingId: buildingsTable.id,
  buildingName: buildingsTable.name,
  siteName: sitesTable.name,
  assetCount: assetCountSql,
  openTicketCount: openTicketCountSql,
} as const;

async function fetchRoom(id: number) {
  return db
    .select(roomSelectCols)
    .from(roomsTable)
    .leftJoin(floorsTable, eq(roomsTable.floorId, floorsTable.id))
    .leftJoin(buildingsTable, eq(floorsTable.buildingId, buildingsTable.id))
    .leftJoin(sitesTable, eq(buildingsTable.siteId, sitesTable.id))
    .where(eq(roomsTable.id, id));
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
    .select(roomSelectCols)
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
  if (Number.isNaN(id)) { res.status(400).json({ message: "Ongeldig id" }); return; }
  const [row] = await fetchRoom(id);
  if (!row) { res.status(404).json({ message: "Ruimte niet gevonden" }); return; }
  res.json(serializeRoom(false, row));
});

router.patch(
  "/rooms/:id",
  requireRole(...VASTGOED_MANAGE_ROLES),
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) { res.status(400).json({ message: "Ongeldig id" }); return; }
    const parsed = UpdateRoomDossierBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ message: "Ongeldige invoer" }); return; }
    const d = parsed.data;
    const [existing] = await db.select({ id: roomsTable.id }).from(roomsTable).where(eq(roomsTable.id, id));
    if (!existing) { res.status(404).json({ message: "Ruimte niet gevonden" }); return; }
    const now = new Date();
    const patch = {
      ...(d.functionType !== undefined ? { functionType: d.functionType } : {}),
      ...(d.floorFinish !== undefined ? { floorFinish: d.floorFinish ?? null } : {}),
      ...(d.areaM2 !== undefined ? { areaM2: d.areaM2 } : {}),
      ...(d.areaVvoM2 !== undefined ? { areaVvoM2: d.areaVvoM2 ?? null } : {}),
      ...(d.areaBvoM2 !== undefined ? { areaBvoM2: d.areaBvoM2 ?? null } : {}),
      ...(d.department !== undefined ? { department: d.department ?? null } : {}),
      ...(d.capacity !== undefined ? { capacity: d.capacity ?? null } : {}),
      updatedAt: now,
    };
    if (d.updatedAt) {
      const clientTs = new Date(d.updatedAt);
      const patched = await db
        .update(roomsTable)
        .set(patch)
        .where(and(eq(roomsTable.id, id), eq(roomsTable.updatedAt, clientTs)))
        .returning({ id: roomsTable.id });
      if (!patched.length) {
        const [current] = await fetchRoom(id);
        res.status(409).json({
          message: "Iemand anders heeft deze ruimte zojuist bewerkt. Ververs de pagina.",
          current: current ? serializeRoom(false, current) : null,
        });
        return;
      }
    } else {
      await db.update(roomsTable).set(patch).where(eq(roomsTable.id, id));
    }
    const [row] = await fetchRoom(id);
    res.json(serializeRoom(false, row!));
  },
);

router.get("/floors/:id/plan", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) { res.status(400).json({ message: "Ongeldig id" }); return; }
  const [floor] = await db
    .select({ id: floorsTable.id, name: floorsTable.name, level: floorsTable.level, buildingId: buildingsTable.id, buildingName: buildingsTable.name })
    .from(floorsTable)
    .innerJoin(buildingsTable, eq(floorsTable.buildingId, buildingsTable.id))
    .where(eq(floorsTable.id, id));
  if (!floor) { res.status(404).json({ message: "Verdieping niet gevonden" }); return; }
  const rooms = await db.select().from(roomsTable).where(eq(roomsTable.floorId, id)).orderBy(roomsTable.code);
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
      areaVvoM2: r.areaVvoM2,
      department: r.department,
      capacity: r.capacity,
      bookable: r.bookable,
      updatedAt: r.updatedAt?.toISOString() ?? new Date().toISOString(),
    })),
  });
});

router.get("/buildings/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) { res.status(400).json({ message: "Ongeldig id" }); return; }
  const [building] = await db.select({ id: buildingsTable.id }).from(buildingsTable).where(eq(buildingsTable.id, id));
  if (!building) { res.status(404).json({ message: "Gebouw niet gevonden" }); return; }
  const floors = await db.select().from(floorsTable).where(eq(floorsTable.buildingId, id)).orderBy(floorsTable.level);
  const [stats] = await db
    .select({ roomCount: sql<number>`count(*)::int`, totalAreaM2: sql<number>`coalesce(sum(${roomsTable.areaM2}), 0)::float` })
    .from(roomsTable)
    .innerJoin(floorsTable, eq(roomsTable.floorId, floorsTable.id))
    .where(eq(floorsTable.buildingId, id));
  res.json({
    ...building,
    floorCount: floors.length,
    roomCount: stats?.roomCount ?? 0,
    totalAreaM2: stats?.totalAreaM2 ?? 0,
    floors: floors.map((f) => ({ id: f.id, name: f.name, level: f.level, roomCount: 0 })),
  });
});

router.get("/buildings/:id/documents", requireRole(...VASTGOED_MANAGE_ROLES), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) { res.status(400).json({ message: "Ongeldig id" }); return; }
  const rows = await db
    .select({ doc: buildingDocumentsTable, uploadedByName: usersTable.name })
    .from(buildingDocumentsTable)
    .leftJoin(usersTable, eq(buildingDocumentsTable.uploadedById, usersTable.id))
    .where(eq(buildingDocumentsTable.buildingId, id))
    .orderBy(desc(buildingDocumentsTable.createdAt));
  res.json(rows.map((r) => ({
    id: r.doc.id, buildingId: r.doc.buildingId, title: r.doc.title, category: r.doc.category,
    objectPath: r.doc.objectPath, contentType: r.doc.contentType, sizeBytes: r.doc.sizeBytes,
    uploadedByName: r.uploadedByName, createdAt: r.doc.createdAt.toISOString(),
  })));
});

router.post("/buildings/:id/documents", requireRole(...VASTGOED_MANAGE_ROLES), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) { res.status(400).json({ message: "Ongeldig id" }); return; }
  const parsed = CreateBuildingDocumentBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Ongeldige invoer" }); return; }
  if (!parsed.data.objectPath.startsWith("/objects/uploads/")) { res.status(400).json({ message: "Ongeldig objectpad" }); return; }
  const [building] = await db.select({ id: buildingsTable.id }).from(buildingsTable).where(eq(buildingsTable.id, id));
  if (!building) { res.status(404).json({ message: "Gebouw niet gevonden" }); return; }

  // Idempotentie: als het document-record al bestaat voor dit objectPath, geef het bestaande record terug.
  const [existing] = await db
    .select({ id: buildingDocumentsTable.id })
    .from(buildingDocumentsTable)
    .where(eq(buildingDocumentsTable.objectPath, parsed.data.objectPath));
  if (existing) {
    const [full] = await db
      .select({ doc: buildingDocumentsTable, uploadedByName: usersTable.name })
      .from(buildingDocumentsTable)
      .leftJoin(usersTable, eq(buildingDocumentsTable.uploadedById, usersTable.id))
      .where(eq(buildingDocumentsTable.id, existing.id));
    res.status(200).json({
      id: full!.doc.id, buildingId: full!.doc.buildingId, title: full!.doc.title, category: full!.doc.category,
      objectPath: full!.doc.objectPath, contentType: full!.doc.contentType, sizeBytes: full!.doc.sizeBytes,
      uploadedByName: full!.uploadedByName, createdAt: full!.doc.createdAt.toISOString(),
    });
    return;
  }

  let doc: typeof buildingDocumentsTable.$inferSelect;
  try {
    const [inserted] = await db
      .insert(buildingDocumentsTable)
      .values({
        buildingId: id, title: parsed.data.title, category: parsed.data.category,
        objectPath: parsed.data.objectPath, contentType: parsed.data.contentType,
        sizeBytes: parsed.data.sizeBytes, uploadedById: req.currentUser!.id,
      })
      .returning();
    doc = inserted!;
  } catch (err) {
    req.log.error({ err, objectPath: parsed.data.objectPath }, "Document-record aanmaken mislukt na geslaagde upload");
    res.status(500).json({ message: "Het bestand is geüpload maar kon niet worden opgeslagen als document. Gebruik de knop 'Opnieuw proberen' om het opslaan te herhalen." });
    return;
  }
  res.status(201).json({
    id: doc.id, buildingId: doc.buildingId, title: doc.title, category: doc.category,
    objectPath: doc.objectPath, contentType: doc.contentType, sizeBytes: doc.sizeBytes,
    uploadedByName: req.currentUser!.name, createdAt: doc.createdAt.toISOString(),
  });
});

router.delete("/building-documents/:id", requireRole(...VASTGOED_MANAGE_ROLES), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) { res.status(400).json({ message: "Ongeldig id" }); return; }
  const [existing] = await db
    .select({ id: buildingDocumentsTable.id, objectPath: buildingDocumentsTable.objectPath })
    .from(buildingDocumentsTable)
    .where(eq(buildingDocumentsTable.id, id));
  if (!existing) { res.status(404).json({ message: "Document niet gevonden" }); return; }
  await db.delete(buildingDocumentsTable).where(eq(buildingDocumentsTable.id, id));
  try {
    if (!(await isObjectPathReferenced(existing.objectPath))) {
      const storageService = new ObjectStorageService();
      await storageService.deleteObject(existing.objectPath);
    }
  } catch (err) {
    req.log.warn({ err, objectPath: existing.objectPath }, "Kon bijbehorend object niet verwijderen uit storage");
  }
  res.status(204).end();
});

router.get("/structure", async (_req, res): Promise<void> => {
  const [orgs, sites, buildings, floors, roomCounts] = await Promise.all([
    db.select().from(organizationsTable),
    db.select().from(sitesTable),
    db.select().from(buildingsTable),
    db.select().from(floorsTable).orderBy(floorsTable.level),
    db.select({ floorId: roomsTable.floorId, count: sql<number>`count(*)::int` }).from(roomsTable).groupBy(roomsTable.floorId),
  ]);
  const countByFloor = new Map(roomCounts.map((r) => [r.floorId, r.count]));
  res.json(orgs.map((o) => ({
    id: o.id,
    name: o.name,
    sites: sites.filter((s) => s.organizationId === o.id).map((s) => ({
      id: s.id, name: s.name, city: s.city,
      buildings: buildings.filter((b) => b.siteId === s.id).map((b) => ({
        id: b.id, name: b.name, address: b.address,
        floors: floors.filter((f) => f.buildingId === b.id).map((f) => ({
          id: f.id, name: f.name, level: f.level, roomCount: countByFloor.get(f.id) ?? 0,
        })),
      })),
    })),
  })));
});

export default router;
