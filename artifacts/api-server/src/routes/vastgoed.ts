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
} from "@workspace/db";
import { eq, and, gte, sql, notInArray, type SQL } from "drizzle-orm";
import { requireAuth, TICKET_MANAGER_ROLES } from "../lib/auth";

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
    floorFinish: r.room.floorFinish,
    capacity: r.room.capacity,
    bookable: r.room.bookable,
    facilities: r.room.facilities,
    assetCount: redactCounts ? 0 : (r.assetCount ?? 0),
    openTicketCount: redactCounts ? 0 : (r.openTicketCount ?? 0),
  };
}

const assetCountSql = sql<number>`(select count(*)::int from ${assetsTable} where ${assetsTable.roomId} = ${roomsTable.id})`;
const openTicketCountSql = sql<number>`(select count(*)::int from ${ticketsTable} where ${ticketsTable.roomId} = ${roomsTable.id} and ${notInArray(ticketsTable.status, ["gereed", "gesloten"])})`;

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
  if (!row) {
    res.status(404).json({ message: "Ruimte niet gevonden" });
    return;
  }
  res.json(
    serializeRoom(!TICKET_MANAGER_ROLES.includes(req.currentUser!.role), row),
  );
});

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
