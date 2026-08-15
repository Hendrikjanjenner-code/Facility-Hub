import { Router, type IRouter } from "express";
import {
  db,
  assetsTable,
  roomsTable,
  floorsTable,
  buildingsTable,
  ticketsTable,
} from "@workspace/db";
import { eq, and, or, ilike, sql, notInArray, type SQL } from "drizzle-orm";
import { CreateAssetBody } from "@workspace/api-zod";
import { requireAuth, requireRole } from "../lib/auth";

const router: IRouter = Router();
router.use(requireAuth);
// Asset register is a facility-management module: not for eindgebruiker/cateraar/receptie/leverancier.
// Scope the guard to /assets paths only — this router is mounted at the API root,
// so a bare router.use() would also block requests destined for other routers.
router.use("/assets", requireRole("servicedesk", "facilitair_manager", "beheerder"));

const openTicketCountSql = sql<number>`(select count(*)::int from ${ticketsTable} where ${ticketsTable.assetId} = ${assetsTable.id} and ${notInArray(ticketsTable.status, ["gereed", "gesloten"])})`;

function baseQuery() {
  return db
    .select({
      asset: assetsTable,
      roomName: roomsTable.name,
      buildingName: buildingsTable.name,
      openTicketCount: openTicketCountSql,
    })
    .from(assetsTable)
    .leftJoin(roomsTable, eq(assetsTable.roomId, roomsTable.id))
    .leftJoin(floorsTable, eq(roomsTable.floorId, floorsTable.id))
    .leftJoin(buildingsTable, eq(floorsTable.buildingId, buildingsTable.id));
}

function serialize(r: {
  asset: typeof assetsTable.$inferSelect;
  roomName: string | null;
  buildingName: string | null;
  openTicketCount: number;
}) {
  return {
    id: r.asset.id,
    name: r.asset.name,
    code: r.asset.code,
    category: r.asset.category,
    brand: r.asset.brand,
    model: r.asset.model,
    serialNumber: r.asset.serialNumber,
    roomId: r.asset.roomId,
    roomName: r.roomName,
    buildingName: r.buildingName,
    status: r.asset.status,
    purchaseDate: r.asset.purchaseDate,
    openTicketCount: r.openTicketCount,
  };
}

router.get("/assets", async (req, res): Promise<void> => {
  const conditions: SQL[] = [];
  const q = req.query;
  if (typeof q.roomId === "string" && q.roomId)
    conditions.push(eq(assetsTable.roomId, Number(q.roomId)));
  if (typeof q.category === "string" && q.category)
    conditions.push(eq(assetsTable.category, q.category));
  if (typeof q.search === "string" && q.search) {
    const s = `%${q.search}%`;
    const cond = or(
      ilike(assetsTable.name, s),
      ilike(assetsTable.code, s),
      ilike(assetsTable.brand, s),
    );
    if (cond) conditions.push(cond);
  }
  const rows = await baseQuery()
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(assetsTable.code);
  res.json(rows.map(serialize));
});

router.get("/assets/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ message: "Ongeldig id" });
    return;
  }
  const [row] = await baseQuery().where(eq(assetsTable.id, id));
  if (!row) {
    res.status(404).json({ message: "Asset niet gevonden" });
    return;
  }
  res.json(serialize(row));
});

router.post(
  "/assets",
  requireRole("beheerder", "facilitair_manager"),
  async (req, res): Promise<void> => {
    const parsed = CreateAssetBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Ongeldige invoer" });
      return;
    }
    const data = parsed.data;
    const [created] = await db
      .insert(assetsTable)
      .values({
        name: data.name,
        code: data.code,
        category: data.category,
        brand: data.brand ?? null,
        model: data.model ?? null,
        serialNumber: data.serialNumber ?? null,
        roomId: data.roomId ?? null,
        status: data.status ?? "in_gebruik",
        purchaseDate: data.purchaseDate ?? null,
      })
      .returning();
    const [row] = await baseQuery().where(eq(assetsTable.id, created!.id));
    res.status(201).json(serialize(row!));
  },
);

export default router;
