import { Router, type IRouter } from "express";
import {
  db,
  suppliersTable,
  contractsTable,
  usersTable,
  notificationsTable,
} from "@workspace/db";
import { eq, and, sql, type SQL } from "drizzle-orm";
import { CreateSupplierBody, CreateContractBody, UpdateContractBody } from "@workspace/api-zod";
import { requireAuth, requireRole } from "../lib/auth";

const router: IRouter = Router();
router.use(requireAuth);
// Contractenkluis & leveranciersregister: facilitair beheer; leverancier ziet alleen eigen contracten.
router.use("/suppliers", requireRole("facilitair_manager", "beheerder"));
router.use("/contracts", requireRole("facilitair_manager", "beheerder", "leverancier"));

function serializeContract(r: {
  contract: typeof contractsTable.$inferSelect;
  supplierName: string | null;
  ownerName: string | null;
}) {
  const c = r.contract;
  const msPerDay = 86400000;
  const daysUntilEnd = Math.ceil(
    (new Date(c.endDate + "T00:00:00").getTime() - Date.now()) / msPerDay,
  );
  return {
    id: c.id,
    name: c.name,
    supplierId: c.supplierId,
    supplierName: r.supplierName,
    category: c.category,
    description: c.description,
    startDate: c.startDate,
    endDate: c.endDate,
    noticePeriodDays: c.noticePeriodDays,
    annualValue: c.annualValue,
    status: c.status,
    ownerId: c.ownerId,
    ownerName: r.ownerName,
    daysUntilEnd,
    expiringSoon: c.status === "actief" && daysUntilEnd <= c.noticePeriodDays,
    createdAt: c.createdAt.toISOString(),
  };
}

function contractBaseQuery() {
  return db
    .select({
      contract: contractsTable,
      supplierName: suppliersTable.name,
      ownerName: sql<string | null>`(select name from users where users.id = ${contractsTable.ownerId})`,
    })
    .from(contractsTable)
    .leftJoin(suppliersTable, eq(contractsTable.supplierId, suppliersTable.id));
}

router.get("/suppliers", async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      supplier: suppliersTable,
      userName: usersTable.name,
      contractCount: sql<number>`(select count(*)::int from ${contractsTable} where ${contractsTable.supplierId} = ${suppliersTable.id})`,
    })
    .from(suppliersTable)
    .leftJoin(usersTable, eq(suppliersTable.userId, usersTable.id))
    .orderBy(suppliersTable.name);
  res.json(
    rows.map((r) => ({
      ...r.supplier,
      userName: r.userName,
      contractCount: r.contractCount,
    })),
  );
});

router.post("/suppliers", async (req, res): Promise<void> => {
  const parsed = CreateSupplierBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Ongeldige invoer" });
    return;
  }
  const d = parsed.data;
  const [created] = await db
    .insert(suppliersTable)
    .values({
      name: d.name,
      category: d.category,
      contactName: d.contactName ?? null,
      email: d.email ?? null,
      phone: d.phone ?? null,
      kvkNumber: d.kvkNumber ?? null,
      userId: d.userId ?? null,
    })
    .returning();
  res.status(201).json({ ...created!, userName: null, contractCount: 0 });
});

router.get("/contracts", async (req, res): Promise<void> => {
  const conditions: SQL[] = [];
  const user = req.currentUser!;
  if (user.role !== "leverancier") {
    await ensureContractExpiryNotifications();
  }
  if (user.role === "leverancier") {
    // Leverancier ziet alleen contracten van de eigen (gekoppelde) leverancier.
    conditions.push(eq(suppliersTable.userId, user.id));
  }
  if (typeof req.query.status === "string" && req.query.status)
    conditions.push(eq(contractsTable.status, req.query.status));
  const rows = await contractBaseQuery()
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(contractsTable.endDate);
  let result = rows.map(serializeContract);
  const within = Number(req.query.expiringWithinDays);
  if (!Number.isNaN(within) && req.query.expiringWithinDays !== undefined) {
    result = result.filter((c) => c.daysUntilEnd <= within && c.status === "actief");
  }
  res.json(result);
});

router.post(
  "/contracts",
  requireRole("facilitair_manager", "beheerder"),
  async (req, res): Promise<void> => {
    const parsed = CreateContractBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Ongeldige invoer" });
      return;
    }
    const d = parsed.data;
    const [created] = await db
      .insert(contractsTable)
      .values({
        name: d.name,
        supplierId: d.supplierId,
        category: d.category,
        description: d.description ?? null,
        startDate: d.startDate,
        endDate: d.endDate,
        noticePeriodDays: d.noticePeriodDays ?? 90,
        annualValue: d.annualValue ?? null,
        ownerId: req.currentUser!.id,
      })
      .returning();
    const [row] = await contractBaseQuery().where(eq(contractsTable.id, created!.id));
    res.status(201).json(serializeContract(row!));
  },
);

router.patch(
  "/contracts/:id",
  requireRole("facilitair_manager", "beheerder"),
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      res.status(400).json({ message: "Ongeldig id" });
      return;
    }
    const parsed = UpdateContractBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Ongeldige invoer" });
      return;
    }
    const d = parsed.data;
    const [updated] = await db
      .update(contractsTable)
      .set({
        ...(d.name !== undefined ? { name: d.name } : {}),
        ...(d.status !== undefined ? { status: d.status } : {}),
        ...(d.endDate !== undefined ? { endDate: d.endDate } : {}),
        ...(d.noticePeriodDays !== undefined ? { noticePeriodDays: d.noticePeriodDays } : {}),
        ...(d.annualValue !== undefined ? { annualValue: d.annualValue } : {}),
        ...(d.description !== undefined ? { description: d.description } : {}),
      })
      .where(eq(contractsTable.id, id))
      .returning();
    if (!updated) {
      res.status(404).json({ message: "Contract niet gevonden" });
      return;
    }
    const [row] = await contractBaseQuery().where(eq(contractsTable.id, id));
    res.json(serializeContract(row!));
  },
);

/**
 * Einddatum-notificaties: bij elke login/lijst-opvraging door een manager checken we
 * of er actieve contracten binnen de opzegtermijn vallen en maken we (eenmalig per
 * contract) een notificatie aan voor de contracteigenaar.
 */
export async function ensureContractExpiryNotifications(): Promise<void> {
  const rows = await contractBaseQuery().where(eq(contractsTable.status, "actief"));
  const expiring = rows.map(serializeContract).filter((c) => c.expiringSoon);
  for (const c of expiring) {
    if (!c.ownerId) continue;
    const title = `Contract loopt af: ${c.name}`;
    const [existing] = await db
      .select({ id: notificationsTable.id })
      .from(notificationsTable)
      .where(and(eq(notificationsTable.title, title), eq(notificationsTable.userId, c.ownerId)));
    if (existing) continue;
    await db.insert(notificationsTable).values({
      userId: c.ownerId,
      title,
      body: `${c.name} (${c.supplierName ?? "onbekende leverancier"}) eindigt op ${c.endDate} — nog ${c.daysUntilEnd} dagen, binnen de opzegtermijn van ${c.noticePeriodDays} dagen.`,
      kind: "contract",
      linkPath: "/contracten",
    });
  }
}

export default router;
