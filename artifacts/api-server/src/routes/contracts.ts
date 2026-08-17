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
  emailQueueTable,
} from "@workspace/db";
import { logger } from "../lib/logger";
import { eq, and, or, sql, desc, isNull, lt, type SQL } from "drizzle-orm";
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
  const [created] = await db.insert(suppliersTable).values(d).returning();
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

    // Voorkom dubbele beoordeling voor hetzelfde jaar (task #55).
    const [existing] = await db
      .select({ id: supplierReviewsTable.id })
      .from(supplierReviewsTable)
      .where(and(eq(supplierReviewsTable.supplierId, supplierId), eq(supplierReviewsTable.year, year)));
    if (existing) {
      res.status(409).json({ message: `Er bestaat al een beoordeling voor ${year}. Verwijder de bestaande beoordeling eerst.` });
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

router.patch(
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
      // Cancel unsent queue rows — deactivated contract moet geen urgentie-e-mail meer krijgen.
      await db
        .delete(emailQueueTable)
        .where(
          and(
            sql`${emailQueueTable.referenceKey} like ${"contract:" + id + ":%"}`,
            isNull(emailQueueTable.sentAt),
          ),
        );
    } else if (d.endDate) {
      // End date changed: stale warnings for old date are no longer accurate
      await db
        .delete(notificationsTable)
        .where(sql`${notificationsTable.referenceKey} like ${"contract:" + id + ":%"}`);
      // Cancel unsent queue rows for the old end date — verlenging triggert een nieuwe e-mail
      // via de volgende ensureContractExpiryNotifications-run.
      await db
        .delete(emailQueueTable)
        .where(
          and(
            sql`${emailQueueTable.referenceKey} like ${"contract:" + id + ":%"}`,
            isNull(emailQueueTable.sentAt),
          ),
        );
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

    // Cancel unsent queue rows — verwijderd contract mag geen urgentie-e-mail meer triggeren.
    await db
      .delete(emailQueueTable)
      .where(
        and(
          sql`${emailQueueTable.referenceKey} like ${"contract:" + id + ":%"}`,
          isNull(emailQueueTable.sentAt),
        ),
      );

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

    const isSupplier = user.role === "leverancier";
    res.json(
      rows.map((r) => ({
        id: r.doc.id,
        contractId: r.doc.contractId,
        fileName: r.doc.fileName,
        // Do not expose internal storage paths to suppliers
        ...(isSupplier ? {} : { objectPath: r.doc.objectPath, uploadedById: r.doc.uploadedById }),
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

export async function ensureContractExpiryNotifications(): Promise<void> {
  const rows = await contractBaseQuery().where(eq(contractsTable.status, "actief"));
  const contracts = rows.map(serializeContract);

  for (const c of contracts) {
    if (!c.ownerId) continue;

    // Niveau 1: binnen opzegtermijn én nog niet verlopen
    // referenceKey bevat einddatum zodat een verlenging automatisch een nieuwe
    // melding genereert (task #31).
    if (c.expiringSoon && c.daysUntilEnd >= 0) {
      await db
        .insert(notificationsTable)
        .values({
          userId: c.ownerId,
          title: `Contract loopt af: ${c.name}`,
          body: `${c.name} (${c.supplierName ?? "onbekende leverancier"}) eindigt op ${c.endDate} — nog ${c.daysUntilEnd} dag(en), binnen de opzegtermijn van ${c.noticePeriodDays} dagen.`,
          kind: "contract",
          linkPath: "/contracten",
          referenceKey: `contract:${c.id}:expiring:${c.endDate}`,
        })
        .onConflictDoNothing();
    }

    // Niveau 2 (escalatie): nog 0–14 dagen — ook e-mail via outbox
    if (c.daysUntilEnd >= 0 && c.daysUntilEnd <= 14) {
      // referenceKey bevat einddatum (task #31) zodat een verlenging een nieuwe
      // e-mail triggert; de emailQueueTable referenceKey is identiek.
      const urgentKey = `contract:${c.id}:urgent:${c.endDate}`;

      // Eigenaar ophalen buiten de transactie (read-only, geen lock nodig).
      const [owner] = await db
        .select({ email: usersTable.email, name: usersTable.name })
        .from(usersTable)
        .where(eq(usersTable.id, c.ownerId));

      // Atomische transactie: notificatie + wachtrij-item in één commit.
      // • Als de notificatie al bestaat: beide onConflictDoNothing zijn no-ops.
      // • Bij crash vóór commit: transactie teruggedraaid → volgende run probeert opnieuw.
      await db.transaction(async (tx) => {
        await tx
          .insert(notificationsTable)
          .values({
            userId: c.ownerId!,
            title: `Urgent: contract eindigt binnenkort — ${c.name}`,
            body: `Let op: ${c.name} (${c.supplierName ?? "onbekende leverancier"}) eindigt op ${c.endDate}. Er zijn nog maar ${c.daysUntilEnd} dag(en) over. Actie vereist!`,
            kind: "contract_urgent",
            linkPath: "/contracten",
            referenceKey: urgentKey,
          })
          .onConflictDoNothing();

        if (owner) {
          const appUrl = process.env["APP_URL"] ?? "https://govconnect.nl";
          await tx
            .insert(emailQueueTable)
            .values({
              referenceKey: urgentKey,
              toEmail: owner.email,
              toName: owner.name,
              contractName: c.name,
              endDate: c.endDate,
              supplierName: c.supplierName ?? "onbekende leverancier",
              daysUntilEnd: c.daysUntilEnd,
              contractsUrl: `${appUrl}/contracten`,
            })
            .onConflictDoNothing();
        }
      });
    }
  }

  // Verwerk openstaande e-mails nadat alle notificaties zijn bijgewerkt.
  await processEmailQueue();
}

/**
 * Berekent de verplichte wachttijd (ms) vóór een nieuwe bezorgpoging op basis
 * van het aantal eerdere mislukte pogingen (exponentieel backoff).
 * Minimum: 1 uur; maximum: 24 uur. Er is geen bovengrens op het totaal aantal
 * pogingen — een tijdelijk SMTP-probleem strandt een e-mail nooit permanent.
 */
function emailRetryBackoffMs(attempts: number): number {
  const oneHour = 60 * 60 * 1000;
  const oneDay = 24 * oneHour;
  return Math.min(oneHour * Math.pow(2, Math.max(0, attempts - 1)), oneDay);
}
export default router;

/**
 * Verwerkt openstaande items in de e-mailwachtrij.
 *
 * Retry-strategie (geen harde pogingslimiet):
 *  E-mails worden onbeperkt geprobeerd met exponentieel backoff (1u → 2u → 4u …
 *  max 24u per interval). Een tijdelijk of langdurig SMTP-probleem strandt een
 *  e-mail nooit permanent — zodra SMTP herstelt, wordt de bezorging hervat.
 *
 * SMTP niet geconfigureerd:
 *  Wanneer SMTP_HOST ontbreekt stopt de verwerking onmiddellijk zonder attempts
 *  op te hogen, zodat alle items bewaard blijven voor wanneer SMTP beschikbaar is.
 *
 * Concurrentieveiligheid:
 *  Elk item wordt atomisch geclaimd via een optimistische UPDATE die controleert
 *  dat lastAttemptAt exact overeenkomt met de waarde die we lazen. Retourneert
 *  de UPDATE 0 rijen, dan heeft een andere run het item al geclaimd → overslaan.
 *
 * Foutafhandeling:
 *  Bij een mislukte verzending (SMTP-fout) wordt attempts opgehoogd en kan de
 *  volgende run het item oppakken zodra de backoff-periode verstreken is.
 *  Bij smtpNotConfigured wordt de claim teruggedraaid zodat attempts niet oploopt.
 */
export async function processEmailQueue(): Promise<void> {
  if (!process.env["SMTP_HOST"]) return;

  const now = new Date();

  const unsent = await db
    .select()
    .from(emailQueueTable)
    .where(isNull(emailQueueTable.sentAt));

  const pending = unsent.filter((entry) => {
    if (!entry.lastAttemptAt) return true;
    return entry.lastAttemptAt.getTime() + emailRetryBackoffMs(entry.attempts) <= now.getTime();
  });

  for (const entry of pending) {
    const claimWhere = entry.lastAttemptAt === null
      ? and(eq(emailQueueTable.id, entry.id), isNull(emailQueueTable.lastAttemptAt))
      : and(eq(emailQueueTable.id, entry.id), eq(emailQueueTable.lastAttemptAt, entry.lastAttemptAt));

    const [claimed] = await db
      .update(emailQueueTable)
      .set({ lastAttemptAt: now, attempts: entry.attempts + 1 })
      .where(claimWhere)
      .returning({ id: emailQueueTable.id });

    if (!claimed) continue;

    try {
      await sendContractExpiryEmail({
        toEmail: entry.toEmail,
        toName: entry.toName,
        contractName: entry.contractName,
        endDate: entry.endDate,
        supplierName: entry.supplierName,
        daysUntilEnd: entry.daysUntilEnd,
        contractsUrl: entry.contractsUrl,
      });

      await db
        .update(emailQueueTable)
        .set({ sentAt: now })
        .where(eq(emailQueueTable.id, entry.id));
    } catch (err: unknown) {
      const notConfigured =
        err instanceof Error &&
        (err as Error & { smtpNotConfigured?: boolean }).smtpNotConfigured === true;

      if (notConfigured) {
        await db
          .update(emailQueueTable)
          .set({ attempts: entry.attempts, lastAttemptAt: null })
          .where(eq(emailQueueTable.id, entry.id));
      } else {
        logger.error(
          {
            err,
            referenceKey: entry.referenceKey,
            attempt: entry.attempts + 1,
            nextRetryAfterMs: emailRetryBackoffMs(entry.attempts + 1),
          },
          "E-mailverzending mislukt — volgende run probeert opnieuw na backoff",
        );
      }
    }
  }
}
