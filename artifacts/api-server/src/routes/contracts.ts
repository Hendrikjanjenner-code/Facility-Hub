import { Readable } from "stream";
import { Router, type IRouter } from "express";
import {
  db,
  suppliersTable,
  contractsTable,
  usersTable,
  notificationsTable,
  contractDocumentsTable,
  supplierReviewsTable,
} from "@workspace/db";
import { eq, and, or, sql, desc, type SQL } from "drizzle-orm";
import { CreateSupplierBody, CreateContractBody, UpdateContractBody } from "@workspace/api-zod";
import { requireAuth, requireRole } from "../lib/auth";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { isObjectPathReferenced } from "../lib/storageRefs";
import { sendContractExpiryEmail } from "../lib/email";
const router: IRouter = Router();
router.use(requireAuth);
// Contractenkluis & leveranciersregister: facilitair beheer; leverancier ziet alleen eigen contracten.
router.use("/suppliers", requireRole("facilitair_manager", "beheerder"));
router.use("/contracts", requireRole("facilitair_manager", "beheerder", "leverancier"));

const objectStorageService = new ObjectStorageService();
const MANAGER_ROLES = ["facilitair_manager", "beheerder"];

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

// ───── Suppliers ─────────────────────────────────────────────────────────────

router.get("/suppliers", async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      supplier: suppliersTable,
      userName: usersTable.name,
      contractCount: sql<number>`cast(count(${contractsTable.id}) as int)`,
    })
    .from(suppliersTable)
    .leftJoin(usersTable, eq(suppliersTable.userId, usersTable.id))
    .leftJoin(contractsTable, eq(contractsTable.supplierId, suppliersTable.id))
    .groupBy(suppliersTable.id, usersTable.name);
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
    .values(d)
    .returning();
  res.status(201).json({ ...created!, userName: null, contractCount: 0 });
});

// ───── Supplier Reviews ───────────────────────────────────────────────────────

router.get("/suppliers/:id/reviews", async (req, res): Promise<void> => {
  const supplierId = Number(req.params.id);
  if (Number.isNaN(supplierId)) { res.status(400).json({ message: "Ongeldig id" }); return; }

  const rows = await db
    .select({ review: supplierReviewsTable, reviewerName: usersTable.name })
    .from(supplierReviewsTable)
    .leftJoin(usersTable, eq(supplierReviewsTable.reviewerId, usersTable.id))
    .where(eq(supplierReviewsTable.supplierId, supplierId))
    .orderBy(desc(supplierReviewsTable.createdAt));

  const reviews = rows.map((r) => ({
    id: r.review.id,
    supplierId: r.review.supplierId,
    reviewerId: r.review.reviewerId,
    reviewerName: r.reviewerName,
    year: r.review.year,
    score: r.review.score,
    comment: r.review.comment,
    createdAt: r.review.createdAt.toISOString(),
  }));

  const averageScore =
    reviews.length > 0
      ? Math.round((reviews.reduce((s, r) => s + r.score, 0) / reviews.length) * 10) / 10
      : null;

  res.json({ reviews, averageScore });
});

router.post(
  "/suppliers/:id/reviews",
  requireRole(...MANAGER_ROLES),
  async (req, res): Promise<void> => {
    const supplierId = Number(req.params.id);
    if (Number.isNaN(supplierId)) { res.status(400).json({ message: "Ongeldig id" }); return; }

    const { year, score, comment } = req.body as { year?: unknown; score?: unknown; comment?: unknown };
    if (
      typeof year !== "number" || typeof score !== "number" ||
      score < 1 || score > 5 || !Number.isInteger(year)
    ) {
      res.status(400).json({ message: "Ongeldige invoer: year (int) en score (1–5) zijn verplicht" });
      return;
    }

    const [created] = await db
      .insert(supplierReviewsTable)
      .values({ supplierId, reviewerId: req.currentUser!.id, year, score, comment: comment as string | undefined })
      .returning();

    res.status(201).json(created!);
  },
);

// ───── Contracts ──────────────────────────────────────────────────────────────

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
  const rows = await contractBaseQuery().where(conditions.length ? and(...conditions) : undefined);
  let result = rows.map(serializeContract);
  const within = Number(req.query.expiringWithinDays);
  if (!Number.isNaN(within) && req.query.expiringWithinDays !== undefined) {
    result = result.filter((c) => c.daysUntilEnd <= within && c.status === "actief");
  }
  res.json(result);
});

router.post(
  "/contracts",
  requireRole(...MANAGER_ROLES),
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
        ...d,
        description: d.description ?? undefined,
        noticePeriodDays: d.noticePeriodDays ?? undefined,
        annualValue: d.annualValue ?? undefined,
      })
      .returning();
    const [row] = await contractBaseQuery().where(eq(contractsTable.id, created!.id));
    res.json(serializeContract(row!));
  },
);

router.delete(
  "/contracts/:id",
  requireRole(...MANAGER_ROLES),
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) { res.status(400).json({ message: "Ongeldig id" }); return; }
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
        ...((d as any).supplierId !== undefined ? { supplierId: (d as any).supplierId } : {}),
        ...((d as any).category !== undefined ? { category: (d as any).category } : {}),
        ...(d.description !== undefined ? { description: d.description } : {}),
        ...((d as any).startDate !== undefined ? { startDate: (d as any).startDate } : {}),
        ...(d.endDate !== undefined ? { endDate: d.endDate } : {}),
        ...(d.noticePeriodDays !== undefined ? { noticePeriodDays: d.noticePeriodDays } : {}),
        ...(d.annualValue !== undefined ? { annualValue: d.annualValue } : {}),
        ...(d.status !== undefined ? { status: d.status } : {}),
        ...((d as any).ownerId !== undefined ? { ownerId: (d as any).ownerId } : {}),
      })
      .where(eq(contractsTable.id, id))
      .returning();
    if (!updated) { res.status(404).json({ message: "Contract niet gevonden" }); return; }

    // Dismiss stale expiry notifications when contract is renewed or deactivated
    if (d.status && d.status !== "actief") {
      await db
        .delete(notificationsTable)
        .where(
          and(
            sql`${notificationsTable.referenceKey} like ${"contract:" + id + ":%"}`,
            eq(notificationsTable.read, false),
          ),
        );
    } else if (d.endDate) {
      // End date changed: stale warnings for old date are no longer accurate
      await db
        .delete(notificationsTable)
        .where(sql`${notificationsTable.referenceKey} like ${"contract:" + id + ":%"}`);
    }

    const [row] = await contractBaseQuery().where(eq(contractsTable.id, id));
    res.json(serializeContract(row!));
  },
);

router.delete(
  "/contracts/:id",
  requireRole(...MANAGER_ROLES),
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) { res.status(400).json({ message: "Ongeldig id" }); return; }

    // Delete associated documents from storage only when no other record anywhere
    // still references the same objectPath (uses centralised cross-table check).
    const docs = await db
      .select()
      .from(contractDocumentsTable)
      .where(eq(contractDocumentsTable.contractId, id));
    // Remove the DB rows first so the reference check below doesn't count them.
    if (docs.length) {
      await db.delete(contractDocumentsTable).where(eq(contractDocumentsTable.contractId, id));
    }
    for (const doc of docs) {
      if (!(await isObjectPathReferenced(doc.objectPath))) {
        await objectStorageService.deleteObject(doc.objectPath);
      }
    }

    await db.delete(contractsTable).where(eq(contractsTable.id, id));
    res.status(204).send();
  },
);

// ───── Contract Documents (Digitale Kluis) ────────────────────────────────────

router.get(
  "/contracts/:id/documents",
  async (req, res): Promise<void> => {
    const contractId = Number(req.params.id);
    if (Number.isNaN(contractId)) { res.status(400).json({ message: "Ongeldig id" }); return; }

    const user = req.currentUser!;

    // Leverancier may only download documents for contracts linked to their own supplier
    if (user.role === "leverancier") {
      const [supplierRow] = await db
        .select({ id: suppliersTable.id })
        .from(suppliersTable)
        .where(eq(suppliersTable.userId, user.id));
      if (!supplierRow) { res.status(403).json({ message: "Geen toegang" }); return; }
      const [contract] = await db
        .select({ supplierId: contractsTable.supplierId })
        .from(contractsTable)
        .where(eq(contractsTable.id, contractId));
      if (!contract || contract.supplierId !== supplierRow.id) {
        res.status(403).json({ message: "Geen toegang" }); return;
      }
    } else {
      const [contract] = await db
        .select({ supplierId: contractsTable.supplierId })
        .from(contractsTable)
        .where(eq(contractsTable.id, contractId));
      if (!contract) { res.status(404).json({ message: "Contract niet gevonden" }); return; }
    }

    const rows = await db
      .select({ doc: contractDocumentsTable, uploadedByName: usersTable.name })
      .from(contractDocumentsTable)
      .leftJoin(usersTable, eq(contractDocumentsTable.uploadedById, usersTable.id))
      .where(eq(contractDocumentsTable.contractId, contractId))
      .orderBy(desc(contractDocumentsTable.createdAt));

    res.json(
      rows.map((r) => ({
        id: r.doc.id,
        contractId: r.doc.contractId,
        fileName: r.doc.fileName,
        objectPath: r.doc.objectPath,
        uploadedById: r.doc.uploadedById,
        uploadedByName: r.uploadedByName,
        createdAt: r.doc.createdAt.toISOString(),
      })),
    );
  },
);

router.post(
  "/contracts/:id/documents",
  requireRole(...MANAGER_ROLES),
  async (req, res): Promise<void> => {
    const contractId = Number(req.params.id);
    if (Number.isNaN(contractId)) { res.status(400).json({ message: "Ongeldig id" }); return; }

    const { fileName, objectPath } = req.body as { fileName?: unknown; objectPath?: unknown };
    if (typeof fileName !== "string" || !fileName || typeof objectPath !== "string" || !objectPath) {
      res.status(400).json({ message: "fileName en objectPath zijn verplicht" });
      return;
    }
    if (!objectPath.startsWith("/objects/uploads/")) {
      res.status(400).json({ message: "Ongeldig objectpad: alleen upload-bestanden zijn toegestaan" });
      return;
    }

      const [contract] = await db
        .select({ supplierId: contractsTable.supplierId })
        .from(contractsTable)
        .where(eq(contractsTable.id, contractId));
    if (!contract) { res.status(404).json({ message: "Contract niet gevonden" }); return; }

    const [created] = await db
      .insert(contractDocumentsTable)
      .values({ contractId, fileName, objectPath, uploadedById: req.currentUser!.id })
      .returning();

    res.status(201).json(created!);
  },
);

router.delete(
  "/contracts/:id/documents/:docId",
  requireRole(...MANAGER_ROLES),
  async (req, res): Promise<void> => {
    const contractId = Number(req.params.id);
    const docId = Number(req.params.docId);
    if (Number.isNaN(contractId) || Number.isNaN(docId)) {
      res.status(400).json({ message: "Ongeldig id" }); return;
    }

    const [doc] = await db
      .select()
      .from(contractDocumentsTable)
      .where(and(eq(contractDocumentsTable.id, docId), eq(contractDocumentsTable.contractId, contractId)));
    if (!doc) { res.status(404).json({ message: "Document niet gevonden" }); return; }

    // Remove DB row first so the cross-table check below doesn't count it.
    await db.delete(contractDocumentsTable).where(eq(contractDocumentsTable.id, docId));
    // Only delete from storage when no other record anywhere still references this path.
    if (!(await isObjectPathReferenced(doc.objectPath))) {
      await objectStorageService.deleteObject(doc.objectPath);
    }
    res.status(204).send();
  },
);

router.get(
  "/contracts/:id/documents/:docId/download",
  async (req, res): Promise<void> => {
    const contractId = Number(req.params.id);
    const docId = Number(req.params.docId);
    if (Number.isNaN(contractId) || Number.isNaN(docId)) {
      res.status(400).json({ message: "Ongeldig id" }); return;
    }

    const user = req.currentUser!;

    // Leverancier may only download documents for contracts linked to their own supplier
    if (user.role === "leverancier") {
      const [supplierRow] = await db
        .select({ id: suppliersTable.id })
        .from(suppliersTable)
        .where(eq(suppliersTable.userId, user.id));
      if (!supplierRow) { res.status(403).json({ message: "Geen toegang" }); return; }
      const [contract] = await db
        .select({ supplierId: contractsTable.supplierId })
        .from(contractsTable)
        .where(eq(contractsTable.id, contractId));
      if (!contract || contract.supplierId !== supplierRow.id) {
        res.status(403).json({ message: "Geen toegang" }); return;
      }
    } else if (!MANAGER_ROLES.includes(user.role)) {
      res.status(403).json({ message: "Geen toegang" }); return;
    }

    const [doc] = await db
      .select()
      .from(contractDocumentsTable)
      .where(and(eq(contractDocumentsTable.id, docId), eq(contractDocumentsTable.contractId, contractId)));
    if (!doc) { res.status(404).json({ message: "Document niet gevonden" }); return; }

    try {
      const objectFile = await objectStorageService.getObjectEntityFile(doc.objectPath);
      const response = await objectStorageService.downloadObject(objectFile);
      res.status(response.status);
      res.setHeader("Content-Disposition", `inline; filename="${doc.fileName}"`);
      response.headers.forEach((value, key) => res.setHeader(key, value));
      if (response.body) {
        const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
        nodeStream.pipe(res);
      } else {
        res.end();
      }
    } catch (err) {
      if (err instanceof ObjectNotFoundError) {
        res.status(404).json({ message: "Bestand niet gevonden in opslag" }); return;
      }
      throw err;
    }
  },
);

// ───── Expiry Notifications ───────────────────────────────────────────────────

/**
 * Controleert actieve contracten en maakt (per contract per drempelwaarde) een notificatie aan
 * voor de contracteigenaar.
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

    // Niveau 2 (escalatie): nog 0–14 dagen — ook e-mail bij eerste melding
    if (c.daysUntilEnd >= 0 && c.daysUntilEnd <= 14) {
      const inserted = await db
        .insert(notificationsTable)
        .values({
          userId: c.ownerId,
          title: `Urgent: contract eindigt binnenkort — ${c.name}`,
          body: `Let op: ${c.name} (${c.supplierName ?? "onbekende leverancier"}) eindigt op ${c.endDate}. Er zijn nog maar ${c.daysUntilEnd} dag(en) over. Actie vereist!`,
          kind: "contract_urgent",
          linkPath: "/contracten",
          referenceKey: `contract:${c.id}:urgent`,
        })
        .onConflictDoNothing()
        .returning({ id: notificationsTable.id });

      // Stuur e-mail alleen als de notificatie nu nieuw is aangemaakt (idempotent).
      if (inserted.length > 0) {
        const [owner] = await db
          .select({ email: usersTable.email, name: usersTable.name })
          .from(usersTable)
          .where(eq(usersTable.id, c.ownerId));

        if (owner) {
          const appUrl =
            process.env["APP_URL"] ?? "https://govconnect.nl";
          await sendContractExpiryEmail({
            toEmail: owner.email,
            toName: owner.name,
            contractName: c.name,
            endDate: c.endDate,
            supplierName: c.supplierName ?? "onbekende leverancier",
            daysUntilEnd: c.daysUntilEnd,
            contractsUrl: `${appUrl}/contracten`,
          });
        }
      }
    }
  }
}

export default router;
