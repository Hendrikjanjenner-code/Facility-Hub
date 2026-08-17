import { Router, type IRouter } from "express";
import {
  db,
  shopProductsTable,
  shopOrdersTable,
  shopOrderLinesTable,
  budgetsTable,
  usersTable,
  notificationsTable,
  suppliersTable,
  approvalThresholdTable,
} from "@workspace/db";
import { eq, and, or, ilike, sql, inArray, desc, gte, type SQL } from "drizzle-orm";
import {
  CreateShopProductBody,
  UpdateShopProductBody,
  CreateShopOrderBody,
  UpdateShopOrderBody,
  UpdateBudgetPolicyBody,
} from "@workspace/api-zod";
import { requireAuth, requireRole } from "../lib/auth";

const router: IRouter = Router();
router.use(requireAuth);
const internalRoles = ["eindgebruiker", "servicedesk", "facilitair_manager", "cateraar", "receptie", "beheerder"];
// Leverancier can only access their own scoped order endpoints; the full catalog/products/threshold
// are restricted to internal roles to prevent cross-supplier data leakage.
router.use("/shop/products", requireRole(...internalRoles));
router.use("/shop/approval-threshold", requireRole(...internalRoles));
router.use("/shop/orders", requireRole(...internalRoles, "leverancier"));
router.use("/shop", requireRole(...internalRoles, "leverancier"));
router.use("/budgets", requireRole("facilitair_manager", "beheerder"));

const MANAGER_ROLES = ["facilitair_manager", "beheerder"];
const SPENT_STATUSES = ["goedgekeurd", "besteld", "geleverd"];

// ── Helpers ──────────────────────────────────────────────────────────────────

function serializeProduct(p: typeof shopProductsTable.$inferSelect & { supplierName?: string | null }) {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    category: p.category,
    price: p.price,
    unit: p.unit,
    stock: p.stock,
    minStock: p.minStock,
    belowMinStock: p.stock < p.minStock,
    supplierId: (p as any).supplierId ?? null,
    supplierName: (p as any).supplierName ?? null,
  };
}

async function getThreshold(): Promise<number> {
  const [row] = await db.select().from(approvalThresholdTable).limit(1);
  return row?.thresholdAmount ?? 0;
}

async function loadOrders(where?: SQL) {
  const orders = await db
    .select({
      order: shopOrdersTable,
      requesterName: usersTable.name,
      approverName: sql<string | null>`(select name from users u2 where u2.id = ${shopOrdersTable.approverId})`,
      supplierName: suppliersTable.name,
    })
    .from(shopOrdersTable)
    .leftJoin(usersTable, eq(shopOrdersTable.requesterId, usersTable.id))
    .leftJoin(suppliersTable, eq((shopOrdersTable as any).supplierId, suppliersTable.id))
    .where(where)
    .orderBy(desc(shopOrdersTable.createdAt));
  const ids = orders.map((o) => o.order.id);
  const lines = ids.length
    ? await db
        .select({ line: shopOrderLinesTable, productName: shopProductsTable.name })
        .from(shopOrderLinesTable)
        .leftJoin(shopProductsTable, eq(shopOrderLinesTable.productId, shopProductsTable.id))
        .where(inArray(shopOrderLinesTable.orderId, ids))
    : [];
  return orders.map((o) => ({
    id: o.order.id,
    number: o.order.number,
    requesterId: o.order.requesterId,
    requesterName: o.requesterName,
    department: o.order.department,
    status: o.order.status,
    totalAmount: o.order.totalAmount,
    budgetExceeded: o.order.budgetExceeded === 1,
    approverId: o.order.approverId,
    approverName: o.approverName,
    decisionNote: o.order.decisionNote,
    supplierId: (o.order as any).supplierId ?? null,
    supplierName: o.supplierName ?? null,
    supplierStatus: (o.order as any).supplierStatus ?? null,
    sentToSupplierAt: (o.order as any).sentToSupplierAt ? (o.order as any).sentToSupplierAt.toISOString() : null,
    lines: lines
      .filter((l) => l.line.orderId === o.order.id)
      .map((l) => ({
        id: l.line.id,
        productId: l.line.productId,
        productName: l.productName,
        quantity: l.line.quantity,
        unitPrice: l.line.unitPrice,
      })),
    createdAt: o.order.createdAt.toISOString(),
    decidedAt: o.order.decidedAt ? o.order.decidedAt.toISOString() : null,
  }));
}

/** Minimumvoorraad-alert: notificatie voor facilitair managers als voorraad onder minimum zakt. */
async function notifyLowStock(p: typeof shopProductsTable.$inferSelect): Promise<void> {
  if (p.stock >= p.minStock) return;
  const managers = await db.select({ id: usersTable.id }).from(usersTable).where(inArray(usersTable.role, MANAGER_ROLES));
  const title = `Voorraad laag: ${p.name}`;
  for (const m of managers) {
    const [existing] = await db
      .select({ id: notificationsTable.id })
      .from(notificationsTable)
      .where(and(eq(notificationsTable.title, title), eq(notificationsTable.userId, m.id), eq(notificationsTable.read, false)));
    if (existing) continue;
    await db.insert(notificationsTable).values({
      userId: m.id,
      title,
      body: `${p.name}: nog ${p.stock} ${p.unit} op voorraad (minimum: ${p.minStock}).`,
      kind: "voorraad",
      linkPath: "/voorraad",
    });
  }
}

// ── Products ──────────────────────────────────────────────────────────────────

router.get("/shop/products", async (req, res): Promise<void> => {
  const conditions: SQL[] = [];
  const q = req.query;
  if (typeof q.category === "string" && q.category)
    conditions.push(eq(shopProductsTable.category, q.category));
  if (typeof q.search === "string" && q.search) {
    const s = `%${q.search}%`;
    const cond = or(ilike(shopProductsTable.name, s), ilike(shopProductsTable.description, s));
    if (cond) conditions.push(cond);
  }
  const rows = await db
    .select({ product: shopProductsTable, supplierName: suppliersTable.name })
    .from(shopProductsTable)
    .leftJoin(suppliersTable, eq((shopProductsTable as any).supplierId, suppliersTable.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(shopProductsTable.name);
  let result = rows.map((r) => serializeProduct({ ...r.product, supplierName: r.supplierName }));
  if (q.belowMinStock === "true") result = result.filter((p) => p.belowMinStock);
  res.json(result);
});

router.post(
  "/shop/products",
  requireRole(...MANAGER_ROLES),
  async (req, res): Promise<void> => {
    const parsed = UpdateBudgetPolicyBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ message: "Ongeldige invoer" }); return; }
    const d = parsed.data;
    const [created] = await db
      .insert(shopProductsTable)
      .values({
        name: d.name,
        description: d.description ?? null,
        category: d.category,
        price: d.price,
        unit: d.unit ?? "stuk",
        stock: d.stock ?? 0,
        minStock: d.minStock ?? 0,
        ...((d as any).supplierId != null ? { supplierId: (d as any).supplierId } : {}),
      } as any)
      .returning();
    res.status(201).json(serializeProduct(created!));
  },
);

router.patch(
  "/shop/products/:id",
  requireRole(...MANAGER_ROLES, "servicedesk"),
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) { res.status(400).json({ message: "Ongeldig id" }); return; }
    const parsed = UpdateBudgetPolicyBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ message: "Ongeldige invoer" }); return; }
    const d = parsed.data;
    const set: Partial<typeof shopProductsTable.$inferInsert> = {};
    if (d.name !== undefined) set.name = d.name;
    if (d.description !== undefined) set.description = d.description;
    if (d.price !== undefined) set.price = d.price;
    if (d.stock !== undefined) set.stock = d.stock;
    if (d.minStock !== undefined) set.minStock = d.minStock;
    if ((d as any).supplierId !== undefined) (set as any).supplierId = (d as any).supplierId;
    const [updated] = await db
      .update(budgetsTable)
      .set({ overBudgetPolicy: parsed.data.overBudgetPolicy as string })
      .where(eq(budgetsTable.id, id))
      .returning();
    if (!updated) { res.status(404).json({ message: "Product niet gevonden" }); return; }
    await notifyLowStock(updated);
    res.json(serializeProduct(updated));
  },
);

// ── Orders ────────────────────────────────────────────────────────────────────

router.get("/shop/orders", async (req, res): Promise<void> => {
    const user = req.currentUser!;
  const conditions: SQL[] = [];
  if (!MANAGER_ROLES.includes(user.role) && user.role !== "leverancier") {
    conditions.push(eq(shopOrdersTable.requesterId, user.id));
  }
  if (typeof req.query.status === "string" && req.query.status) {
    conditions.push(eq(shopOrdersTable.status, req.query.status));
  }
  res.json(await loadOrders(conditions.length ? and(...conditions) : undefined));
});

router.post("/shop/orders", requireRole(...internalRoles), async (req, res): Promise<void> => {
    const parsed = UpdateBudgetPolicyBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Ongeldige invoer" }); return; }
    const user = req.currentUser!;


  const qtyByProduct = new Map<number, number>();
  for (const line of parsed.data.lines) {
    qtyByProduct.set(line.productId, (qtyByProduct.get(line.productId) ?? 0) + line.quantity);
  }
  const productIds = Array.from(qtyByProduct.keys());
  const products = await db
    .select()
    .from(shopProductsTable)
    .where(and(inArray(shopProductsTable.id, productIds), eq(shopProductsTable.active, 1)));
  const byId = new Map(products.map((p) => [p.id, p]));

  let total = 0;
  for (const [productId, quantity] of qtyByProduct) {
    const p = byId.get(productId);
    if (!p) { res.status(400).json({ message: `Onbekend product (${productId})` }); return; }
    if (p.stock < quantity) {
      res.status(409).json({ message: `Onvoldoende voorraad voor ${p.name}: nog ${p.stock} ${p.unit} beschikbaar.` });
      return;
    }
    total += p.price * quantity;
  }
  total = Math.round(total * 100) / 100;

  const department = user.department ?? "Onbekend";
  const currentYear = new Date().getFullYear();
  const threshold = await getThreshold();
  const autoApprove = threshold > 0 && total <= threshold;
  const autoSupplierId: number | null = (parsed.data as any).supplierId ?? null;

  const order = await db.transaction(async (tx) => {
    // Lock the budget row for this department/year to serialise concurrent requests.
    const [budgetRow] = await tx
      .select()
      .from(budgetsTable)
      .where(and(eq(budgetsTable.department, department), eq(budgetsTable.year, currentYear)))
      .for("update");

    let budgetExceeded = false;
    if (budgetRow) {
      const yearStart = new Date(`${currentYear}-01-01T00:00:00Z`);
      const yearEnd = new Date(`${currentYear + 1}-01-01T00:00:00Z`);
      const RESERVED_STATUSES = [...SPENT_STATUSES, "ingediend"];
      const committed = await tx
        .select({ total: sql<number>`coalesce(sum(${shopOrdersTable.totalAmount}), 0)` })
        .from(shopOrdersTable)
        .where(
          and(
            eq(shopOrdersTable.department, department),
            inArray(shopOrdersTable.status, RESERVED_STATUSES),
            sql`${shopOrdersTable.createdAt} >= ${yearStart.toISOString()}`,
            sql`${shopOrdersTable.createdAt} < ${yearEnd.toISOString()}`,
          ),
        );
      const spent = committed[0]?.total ?? 0;
      const remaining = Math.round((budgetRow.amount - spent) * 100) / 100;

      if (total > remaining) {
        budgetExceeded = true;
        if (budgetRow.overBudgetPolicy === "blokkeren") {
          throw Object.assign(
            new Error(`Bestelling overschrijdt het resterende budget (€ ${remaining.toFixed(2)}) voor ${department}. Bestelling geblokkeerd.`),
            { status: 400, budgetBlocked: true },
          );
        }
      }
    }

    const initialStatus = autoApprove ? "goedgekeurd" : "ingediend";
    const [created] = await tx
      .insert(shopOrdersTable)
      .values({
        number: `WS-TMP-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        requesterId: user.id,
        department,
        totalAmount: total,
        budgetExceeded: budgetExceeded ? 1 : 0,
        status: initialStatus,
        ...(autoApprove ? { approverId: user.id, decidedAt: new Date() } : {}),
        ...(autoSupplierId ? { supplierId: autoSupplierId } : {}),
      } as any)
      .returning();
    const [numbered] = await tx
      .update(shopOrdersTable)
      .set({ number: `WS-2026-${String(1000 + created!.id)}` })
      .where(eq(shopOrdersTable.id, created!.id))
      .returning();

    if (autoApprove) {
      for (const [productId, quantity] of qtyByProduct) {
        const [decremented] = await tx
          .update(shopProductsTable)
          .set({ stock: sql`${shopProductsTable.stock} - ${quantity}` })
          .where(and(eq(shopProductsTable.id, productId), gte(shopProductsTable.stock, quantity)))
          .returning({ id: shopProductsTable.id });
        if (!decremented) {
          const p = byId.get(productId)!;
          throw Object.assign(
            new Error(`Onvoldoende voorraad voor ${p.name} — bestelling kan niet automatisch worden goedgekeurd.`),
            { status: 409 },
          );
        }
      }
    }

    await tx.insert(shopOrderLinesTable).values(
      Array.from(qtyByProduct.entries()).map(([productId, quantity]) => ({
        orderId: created!.id,
        productId,
        quantity,
        unitPrice: byId.get(productId)!.price,
      })),
    );
    return numbered!;
  }).catch((err: any) => {
    if (err?.status === 400 || err?.status === 409) {
      res.status(err.status).json({ message: err.message });
      return null;
    }
    throw err;
  });

  if (!order) return;

  if (autoApprove) {
    await db.insert(notificationsTable).values({
      userId: user.id,
      title: `Bestelling automatisch goedgekeurd`,
      body: `Je bestelling van € ${total.toFixed(2)} is automatisch goedgekeurd (onder de drempel van € ${threshold.toFixed(2)}).`,
      kind: "webshop",
      linkPath: "/webshop",
    });
  } else {
    const managers = await db.select({ id: usersTable.id }).from(usersTable).where(inArray(usersTable.role, MANAGER_ROLES));
    for (const m of managers) {
      await db.insert(notificationsTable).values({
        userId: m.id,
        title: `Bestelling ter goedkeuring: ${order.number}`,
        body: `${user.name} (${user.department ?? "-"}) heeft een bestelling ingediend van € ${total.toFixed(2)}.`,
        kind: "webshop",
        linkPath: "/webshop",
      });
    }
  }

    const [result] = await loadOrders(eq(shopOrdersTable.id, id));
  res.status(201).json(result);
});

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  ingediend: ["goedgekeurd", "afgekeurd"],
  goedgekeurd: ["besteld"],
  besteld: ["geleverd"],
};

router.patch(
  "/shop/orders/:id",
  requireRole(...MANAGER_ROLES),
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) { res.status(400).json({ message: "Ongeldig id" }); return; }
    const parsed = UpdateBudgetPolicyBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ message: "Ongeldige invoer" }); return; }

    const [order] = await db.select().from(shopOrdersTable).where(eq(shopOrdersTable.id, id));
    if (!order) { res.status(404).json({ message: "Bestelling niet gevonden" }); return; }
    const next = parsed.data.status;
    if (!(ALLOWED_TRANSITIONS[order.status] ?? []).includes(next)) {
      res.status(400).json({ message: `Overgang van ${order.status} naar ${next} is niet toegestaan` });
      return;
    }

    const isDecision = next === "goedgekeurd" || next === "afgekeurd";
    const lowStockProducts: (typeof shopProductsTable.$inferSelect)[] = [];
    try {
      await db.transaction(async (tx) => {
        // Bij goedkeuring: controleer budgetbeleid voordat de status wijzigt.
        if (next === "goedgekeurd") {
          const orderYear = order.createdAt.getFullYear();
          const [budgetRow] = await tx
            .select()
            .from(budgetsTable)
            .where(and(eq(budgetsTable.department, order.department), eq(budgetsTable.year, orderYear)))
            .for("update");
          if (budgetRow && budgetRow.overBudgetPolicy === "blokkeren") {
    const yearStart = new Date(`${updated.year}-01-01T00:00:00Z`);
    const yearEnd = new Date(`${updated.year + 1}-01-01T00:00:00Z`);
            const committed = await tx
              .select({ total: sql<number>`coalesce(sum(${shopOrdersTable.totalAmount}), 0)` })
              .from(shopOrdersTable)
              .where(
                and(
                  eq(shopOrdersTable.department, order.department),
                  inArray(shopOrdersTable.status, SPENT_STATUSES),
                  sql`${shopOrdersTable.createdAt} >= ${yearStart.toISOString()}`,
                  sql`${shopOrdersTable.createdAt} < ${yearEnd.toISOString()}`,
                ),
              );
    const spent = deptOrders.filter((o) => SPENT_STATUSES.includes(o.status)).reduce((s, o) => s + o.total, 0);
            const remaining = Math.round((budgetRow.amount - spent) * 100) / 100;
            if (order.totalAmount > remaining) {
              throw Object.assign(
                new Error(
                  `Goedkeuring geblokkeerd: deze bestelling (€ ${order.totalAmount.toFixed(2)}) overschrijdt het resterende budget van € ${remaining.toFixed(2)} voor ${order.department}.`,
                ),
                { status: 409 },
              );
            }
          }
        }

        // Statusovergang alleen vanuit de verwachte huidige status (race-vrij).
        const [transitioned] = await tx
          .update(shopOrdersTable)
          .set({
            status: next,
            ...(isDecision
              ? { approverId: req.currentUser!.id, decisionNote: parsed.data.decisionNote ?? null, decidedAt: new Date() }
              : {}),
          })
          .where(and(eq(shopOrdersTable.id, id), eq(shopOrdersTable.status, order.status)))
          .returning();
        if (!transitioned) {
          throw Object.assign(new Error("Bestelling is intussen al gewijzigd. Ververs de pagina."), { status: 409 });
        }

        // Bij goedkeuring: voorraad conditioneel afboeken; bij tekort rolt alles terug.
        if (next === "goedgekeurd") {
          const lines = await tx.select().from(shopOrderLinesTable).where(eq(shopOrderLinesTable.orderId, id));
          for (const line of lines) {
    const [updated] = await db
      .update(budgetsTable)
      .set({ overBudgetPolicy: parsed.data.overBudgetPolicy as string })
      .where(eq(budgetsTable.id, id))
      .returning();
    if (!updated) {
      res.status(409).json({ message: "Bestelling is al verwerkt of de status is gewijzigd" }); return;
    }

    const [result] = await loadOrders(eq(shopOrdersTable.id, id));
    res.json(result);
  },
);

// ── Supplier: mark delivered ──────────────────────────────────────────────────

router.post(
  "/shop/orders/:id/supplier-delivered",
  requireRole("leverancier", ...MANAGER_ROLES),
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) { res.status(400).json({ message: "Ongeldig id" }); return; }
    const supplierId = typeof req.body?.supplierId === "number" ? req.body.supplierId : null;
    if (!supplierId) { res.status(400).json({ message: "supplierId is verplicht" }); return; }

    const [order] = await db.select().from(shopOrdersTable).where(eq(shopOrdersTable.id, id));
    if (!order) { res.status(404).json({ message: "Bestelling niet gevonden" }); return; }
    if (!["goedgekeurd", "besteld"].includes(order.status)) {
      res.status(400).json({ message: "Bestelling moet goedgekeurd of besteld zijn om te versturen" });
      return;
    }

    await db
      .update(shopOrdersTable)
      .set({ supplierId, supplierStatus: "verstuurd", sentToSupplierAt: new Date() } as any)
      .where(eq(shopOrdersTable.id, id));

    const [supplier] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, supplierId));
    if (supplier?.userId) {
      await db.insert(notificationsTable).values({
        userId: supplier.userId,
        title: `Nieuwe bestelling ontvangen: ${order.number}`,
        body: `Er is een bestelling naar u verstuurd van € ${order.totalAmount.toFixed(2)}.`,
        kind: "webshop",
        linkPath: "/webshop",
      });
    }

    const [result] = await loadOrders(eq(shopOrdersTable.id, id));
    res.json(result);
  },
);

// ── Supplier: mark delivered ──────────────────────────────────────────────────

router.post(
  "/shop/orders/:id/supplier-delivered",
  requireRole("leverancier", ...MANAGER_ROLES),
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) { res.status(400).json({ message: "Ongeldig id" }); return; }

    const [order] = await db.select().from(shopOrdersTable).where(eq(shopOrdersTable.id, id));
    if (!order) { res.status(404).json({ message: "Bestelling niet gevonden" }); return; }

    if ((order as any).supplierStatus !== "verstuurd") {
      res.status(400).json({ message: "Bestelling is nog niet naar de leverancier verstuurd" }); return;
    }

    const user = req.currentUser!;
    if (user.role === "leverancier") {
      const [supplierRow] = await db
        .select({ id: suppliersTable.id })
        .from(suppliersTable)
        .where(eq(suppliersTable.userId, user.id));
      if (!supplierRow || (order as any).supplierId !== supplierRow.id) {
        res.status(403).json({ message: "Geen toegang" }); return;
      }
    }

    const [updated] = await db
      .update(budgetsTable)
      .set({ overBudgetPolicy: parsed.data.overBudgetPolicy as string })
      .where(eq(budgetsTable.id, id))
      .returning();
    if (!updated) {
      res.status(409).json({ message: "Bestelling is al verwerkt of de status is gewijzigd" }); return;
    }

    const [result] = await loadOrders(eq(shopOrdersTable.id, id));
    res.json(result);
  },
);

// ── Approval Threshold ────────────────────────────────────────────────────────

router.get("/shop/approval-threshold", async (_req, res): Promise<void> => {
  const [row] = await db.select().from(approvalThresholdTable).limit(1);
  res.json({ thresholdAmount: row?.thresholdAmount ?? 0 });
});

router.put(
  "/shop/approval-threshold",
  requireRole(...MANAGER_ROLES),
  async (req, res): Promise<void> => {
    const amount = req.body?.thresholdAmount;
    if (typeof amount !== "number" || amount < 0) {
      res.status(400).json({ message: "thresholdAmount moet een positief getal zijn" }); return;
    }
    const [existing] = await db.select().from(approvalThresholdTable).limit(1);
    if (existing) {
      await db.update(approvalThresholdTable).set({ thresholdAmount: amount }).where(eq(approvalThresholdTable.id, existing.id));
    } else {
      await db.insert(approvalThresholdTable).values({ thresholdAmount: amount });
    }
    res.json({ thresholdAmount: amount });
  },
);

// ── Budgets ───────────────────────────────────────────────────────────────────

router.get("/budgets", async (_req, res): Promise<void> => {
  const [budgets, orders] = await Promise.all([
    db.select().from(budgetsTable).orderBy(budgetsTable.department),
    db
      .select({
        department: shopOrdersTable.department,
        status: shopOrdersTable.status,
        total: shopOrdersTable.totalAmount,
        createdAt: shopOrdersTable.createdAt,
      })
      .from(shopOrdersTable),
  ]);
  res.json(
    budgets.map((b) => {
    const yearStart = new Date(`${updated.year}-01-01T00:00:00Z`);
    const yearEnd = new Date(`${updated.year + 1}-01-01T00:00:00Z`);
    const deptOrders = orders.filter((o) => o.department === updated.department && o.createdAt >= yearStart && o.createdAt < yearEnd);
    const spent = deptOrders.filter((o) => SPENT_STATUSES.includes(o.status)).reduce((s, o) => s + o.total, 0);
    const pending = deptOrders.filter((o) => o.status === "ingediend").reduce((s, o) => s + o.total, 0);
      return {
        id: b.id,
        department: b.department,
        year: b.year,
        amount: b.amount,
        overBudgetPolicy: b.overBudgetPolicy as "markeren" | "blokkeren",
        spent: Math.round(spent * 100) / 100,
        pending: Math.round(pending * 100) / 100,
        remaining: Math.round((b.amount - spent) * 100) / 100,
      };
    }),
  );
});

router.patch(
  "/budgets/:id",
  requireRole(...MANAGER_ROLES),
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) { res.status(400).json({ message: "Ongeldig id" }); return; }
    const parsed = UpdateBudgetPolicyBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ message: "Ongeldige invoer" }); return; }
    const [updated] = await db
      .update(budgetsTable)
      .set({ overBudgetPolicy: parsed.data.overBudgetPolicy as string })
      .where(eq(budgetsTable.id, id))
      .returning();
    if (!updated) { res.status(404).json({ message: "Budget niet gevonden" }); return; }
    const orders = await db
      .select({
        department: shopOrdersTable.department,
        status: shopOrdersTable.status,
        total: shopOrdersTable.totalAmount,
        createdAt: shopOrdersTable.createdAt,
      })
      .from(shopOrdersTable);
    const yearStart = new Date(`${updated.year}-01-01T00:00:00Z`);
    const yearEnd = new Date(`${updated.year + 1}-01-01T00:00:00Z`);
    const deptOrders = orders.filter((o) => o.department === updated.department && o.createdAt >= yearStart && o.createdAt < yearEnd);
    const spent = deptOrders.filter((o) => SPENT_STATUSES.includes(o.status)).reduce((s, o) => s + o.total, 0);
    const pending = deptOrders.filter((o) => o.status === "ingediend").reduce((s, o) => s + o.total, 0);
    res.json({
      id: updated.id,
      department: updated.department,
      year: updated.year,
      amount: updated.amount,
      overBudgetPolicy: updated.overBudgetPolicy as "markeren" | "blokkeren",
      spent: Math.round(spent * 100) / 100,
      pending: Math.round(pending * 100) / 100,
      remaining: Math.round((updated.amount - spent) * 100) / 100,
    });
  },
);

export default router;
