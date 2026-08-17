import { Router, type IRouter } from "express";
import {
  db,
  suppliersTable,
  contractsTable,
  usersTable,
  notificationsTable,
} from "@workspace/db";
import { eq, and, or, sql, type SQL } from "drizzle-orm";
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

/**
 * Markeer bestaande verloopmeldingen van een contract als gelezen zodat ze
 * niet meer als actief verschijnen nadat het contract verlengd of beëindigd is.
 */
async function dismissContractExpiryNotifications(contractId: number): Promise<void> {
  await db
    .update(notificationsTable)
    .set({ read: true })
    .where(
      or(
        eq(notificationsTable.referenceKey, `contract:${contractId}:expiring`),
        eq(notificationsTable.referenceKey, `contract:${contractId}:urgent`),
      ),
    );
}

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

    // Verwijder verouderde verloopmeldingen wanneer:
    //  - de einddatum is gewijzigd (verlenging), of
    //  - de status is gewijzigd naar een niet-actieve toestand
    const nonActiveStatuses = ["beëindigd", "opgezegd", "geannuleerd", "verlopen"];
    const statusBecameInactive =
      d.status !== undefined && nonActiveStatuses.includes(d.status);
    if (d.endDate !== undefined || statusBecameInactive) {
      await dismissContractExpiryNotifications(id);
    }

    const [row] = await contractBaseQuery().where(eq(contractsTable.id, id));
    res.json(serializeContract(row!));
  },
);

/**
 * Einddatum-notificaties: dagelijks (en bij elke lijst-opvraging door een manager) checken we
 * of er actieve contracten binnen de opzegtermijn vallen en maken we (eenmalig per
 * contract per drempelwaarde) een notificatie aan voor de contracteigenaar.
 *
 * Escalatieniveaus:
 *  1. Regulier: contract valt binnen de opzegtermijn (noticePeriodDays), einddatum nog niet verstreken
 *  2. Kritiek:  contract eindigt over 0–14 dagen
 *
 * Idempotentie wordt gegarandeerd via een stabiele referenceKey per contract/drempel
 * gecombineerd met een unieke database-index op (user_id, reference_key), zodat
 * gelijktijdige runs of herhaalde dagelijkse runs nooit dubbele meldingen aanmaken.
 */
export async function ensureContractExpiryNotifications(): Promise<void> {
  const rows = await contractBaseQuery().where(eq(contractsTable.status, "actief"));
  const contracts = rows.map(serializeContract);

  for (const c of contracts) {
    if (!c.ownerId) continue;

    // Niveau 1: binnen opzegtermijn én nog niet verlopen
    if (c.expiringSoon && c.daysUntilEnd >= 0) {
      await db
        .insert(notificationsTable)
        .values({
          userId: c.ownerId,
          title: `Contract loopt af: ${c.name}`,
          body: `${c.name} (${c.supplierName ?? "onbekende leverancier"}) eindigt op ${c.endDate} — nog ${c.daysUntilEnd} dag(en), binnen de opzegtermijn van ${c.noticePeriodDays} dagen.`,
          kind: "contract",
          linkPath: "/contracten",
          referenceKey: `contract:${c.id}:expiring`,
        })
        .onConflictDoNothing();
    }

    // Niveau 2 (escalatie): nog 0–14 dagen
    if (c.daysUntilEnd >= 0 && c.daysUntilEnd <= 14) {
      await db
        .insert(notificationsTable)
        .values({
          userId: c.ownerId,
          title: `Urgent: contract eindigt binnenkort — ${c.name}`,
          body: `Let op: ${c.name} (${c.supplierName ?? "onbekende leverancier"}) eindigt op ${c.endDate}. Er zijn nog maar ${c.daysUntilEnd} dag(en) over. Actie vereist!`,
          kind: "contract_urgent",
          linkPath: "/contracten",
          referenceKey: `contract:${c.id}:urgent`,
        })
        .onConflictDoNothing();
    }
  }
}

export default router;
