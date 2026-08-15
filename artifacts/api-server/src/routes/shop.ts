import { Router, type IRouter } from "express";
import {
  db,
  shopProductsTable,
  shopOrdersTable,
  shopOrderLinesTable,
  budgetsTable,
  usersTable,
  notificationsTable,
} from "@workspace/db";
import { eq, and, or, ilike, sql, inArray, desc, gte, type SQL } from "drizzle-orm";
import {
  CreateShopProductBody,
  UpdateShopProductBody,
  CreateShopOrderBody,
  UpdateShopOrderBody,
} from "@workspace/api-zod";
import { requireAuth, requireRole } from "../lib/auth";

const router: IRouter = Router();
router.use(requireAuth);
// Webshop is voor interne rollen; leverancier heeft geen toegang.
const internalRoles = ["eindgebruiker", "servicedesk", "facilitair_manager", "cateraar", "receptie", "beheerder"];
router.use("/shop", requireRole(...internalRoles));
router.use("/budgets", requireRole("facilitair_manager", "beheerder"));

const MANAGER_ROLES = ["facilitair_manager", "beheerder"];
const SPENT_STATUSES = ["goedgekeurd", "besteld", "geleverd"];

function serializeProduct(p: typeof shopProductsTable.$inferSelect) {
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
  };
}

router.get("/shop/products", async (req, res): Promise<void> => {
  const conditions: SQL[] = [eq(shopProductsTable.active, 1)];
  const q = req.query;
  if (typeof q.category === "string" && q.category)
    conditions.push(eq(shopProductsTable.category, q.category));
  if (typeof q.search === "string" && q.search) {
    const s = `%${q.search}%`;
    const cond = or(ilike(shopProductsTable.name, s), ilike(shopProductsTable.description, s));
    if (cond) conditions.push(cond);
  }
  const rows = await db
    .select()
    .from(shopProductsTable)
    .where(and(...conditions))
    .orderBy(shopProductsTable.name);
  let result = rows.map(serializeProduct);
  if (q.belowMinStock === "true") result = result.filter((p) => p.belowMinStock);
  res.json(result);
});

router.post(
  "/shop/products",
  requireRole(...MANAGER_ROLES),
  async (req, res): Promise<void> => {
    const parsed = CreateShopProductBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Ongeldige invoer" });
      return;
    }
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
      })
      .returning();
    res.status(201).json(serializeProduct(created!));
  },
);

router.patch(
  "/shop/products/:id",
  requireRole(...MANAGER_ROLES, "servicedesk"),
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      res.status(400).json({ message: "Ongeldig id" });
      return;
    }
    const parsed = UpdateShopProductBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Ongeldige invoer" });
      return;
    }
    const d = parsed.data;
    const [updated] = await db
      .update(shopProductsTable)
      .set({
        ...(d.name !== undefined ? { name: d.name } : {}),
        ...(d.description !== undefined ? { description: d.description } : {}),
        ...(d.price !== undefined ? { price: d.price } : {}),
        ...(d.stock !== undefined ? { stock: d.stock } : {}),
        ...(d.minStock !== undefined ? { minStock: d.minStock } : {}),
      })
      .where(eq(shopProductsTable.id, id))
      .returning();
    if (!updated) {
      res.status(404).json({ message: "Product niet gevonden" });
      return;
    }
    await notifyLowStock(updated);
    res.json(serializeProduct(updated));
  },
);

/** Minimumvoorraad-alert: notificatie voor facilitair managers als voorraad onder minimum zakt. */
async function notifyLowStock(p: typeof shopProductsTable.$inferSelect): Promise<void> {
  if (p.stock >= p.minStock) return;
  const managers = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(inArray(usersTable.role, MANAGER_ROLES));
  const title = `Voorraad laag: ${p.name}`;
  for (const m of managers) {
    const [existing] = await db
      .select({ id: notificationsTable.id, read: notificationsTable.read })
      .from(notificationsTable)
      .where(
        and(
          eq(notificationsTable.title, title),
          eq(notificationsTable.userId, m.id),
          eq(notificationsTable.read, false),
        ),
      );
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

async function loadOrders(where?: SQL) {
  const orders = await db
    .select({
      order: shopOrdersTable,
      requesterName: usersTable.name,
      approverName: sql<string | null>`(select name from users u2 where u2.id = ${shopOrdersTable.approverId})`,
    })
    .from(shopOrdersTable)
    .leftJoin(usersTable, eq(shopOrdersTable.requesterId, usersTable.id))
    .where(where)
    .orderBy(desc(shopOrdersTable.createdAt));
  const ids = orders.map((o) => o.order.id);
  const lines = ids.length
    ? await db
        .select({
          line: shopOrderLinesTable,
          productName: shopProductsTable.name,
        })
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
    approverId: o.order.approverId,
    approverName: o.approverName,
    decisionNote: o.order.decisionNote,
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

router.get("/shop/orders", async (req, res): Promise<void> => {
  const user = req.currentUser!;
  const conditions: SQL[] = [];
  if (!MANAGER_ROLES.includes(user.role)) {
    conditions.push(eq(shopOrdersTable.requesterId, user.id));
  }
  if (typeof req.query.status === "string" && req.query.status)
    conditions.push(eq(shopOrdersTable.status, req.query.status));
  res.json(await loadOrders(conditions.length ? and(...conditions) : undefined));
});

router.post("/shop/orders", async (req, res): Promise<void> => {
  const parsed = CreateShopOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Ongeldige invoer" });
    return;
  }
  const user = req.currentUser!;

  // Aggregeer dubbele productregels zodat de voorraadcheck op de totale vraag gebeurt.
  const qtyByProduct = new Map<number, number>();
  for (const line of parsed.data.lines) {
    qtyByProduct.set(line.productId, (qtyByProduct.get(line.productId) ?? 0) + line.quantity);
  }
  const productIds = Array.from(qtyByProduct.keys());
  const products = await db
    .select()
    .from(shopProductsTable)
    .where(inArray(shopProductsTable.id, productIds));
  const byId = new Map(products.map((p) => [p.id, p]));
  let total = 0;
  for (const [productId, quantity] of qtyByProduct) {
    const p = byId.get(productId);
    if (!p) {
      res.status(400).json({ message: `Onbekend product (${productId})` });
      return;
    }
    if (p.stock < quantity) {
      res.status(409).json({ message: `Onvoldoende voorraad voor ${p.name}: nog ${p.stock} ${p.unit} beschikbaar.` });
      return;
    }
    total += p.price * quantity;
  }
  total = Math.round(total * 100) / 100;

  // Ordernummer wordt afgeleid van het serial id (race-vrij); insert met tijdelijk uniek nummer.
  const order = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(shopOrdersTable)
      .values({
        number: `WS-TMP-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        requesterId: user.id,
        department: user.department ?? "Onbekend",
        totalAmount: total,
      })
      .returning();
    const [numbered] = await tx
      .update(shopOrdersTable)
      .set({ number: `WS-2026-${String(1000 + created!.id)}` })
      .where(eq(shopOrdersTable.id, created!.id))
      .returning();
    await tx.insert(shopOrderLinesTable).values(
      Array.from(qtyByProduct.entries()).map(([productId, quantity]) => ({
        orderId: created!.id,
        productId,
        quantity,
        unitPrice: byId.get(productId)!.price,
      })),
    );
    return numbered!;
  });

  // Goedkeuringsflow: notificeer facilitair managers over de nieuwe aanvraag.
  const managers = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(inArray(usersTable.role, MANAGER_ROLES));
  for (const m of managers) {
    await db.insert(notificationsTable).values({
      userId: m.id,
      title: `Bestelling ter goedkeuring: ${order.number}`,
      body: `${user.name} (${user.department ?? "-"}) heeft een bestelling ingediend van € ${total.toFixed(2)}.`,
      kind: "webshop",
      linkPath: "/webshop",
    });
  }

  const [result] = await loadOrders(eq(shopOrdersTable.id, order!.id));
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
    if (Number.isNaN(id)) {
      res.status(400).json({ message: "Ongeldig id" });
      return;
    }
    const parsed = UpdateShopOrderBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Ongeldige invoer" });
      return;
    }
    const [order] = await db.select().from(shopOrdersTable).where(eq(shopOrdersTable.id, id));
    if (!order) {
      res.status(404).json({ message: "Bestelling niet gevonden" });
      return;
    }
    const next = parsed.data.status;
    if (!(ALLOWED_TRANSITIONS[order.status] ?? []).includes(next)) {
      res.status(400).json({ message: `Overgang van ${order.status} naar ${next} is niet toegestaan` });
      return;
    }

    const isDecision = next === "goedgekeurd" || next === "afgekeurd";
    const lowStockProducts: (typeof shopProductsTable.$inferSelect)[] = [];
    try {
      await db.transaction(async (tx) => {
        // Statusovergang alleen vanuit de verwachte huidige status (race-vrij).
        const [transitioned] = await tx
          .update(shopOrdersTable)
          .set({
            status: next,
            ...(isDecision
              ? {
                  approverId: req.currentUser!.id,
                  decisionNote: parsed.data.decisionNote ?? null,
                  decidedAt: new Date(),
                }
              : {}),
          })
          .where(and(eq(shopOrdersTable.id, id), eq(shopOrdersTable.status, order.status)))
          .returning();
        if (!transitioned) {
          throw Object.assign(new Error("Bestelling is intussen al gewijzigd. Ververs de pagina."), { status: 409 });
        }

        // Bij goedkeuring: voorraad conditioneel afboeken; bij tekort rolt alles terug.
        if (next === "goedgekeurd") {
          const lines = await tx
            .select()
            .from(shopOrderLinesTable)
            .where(eq(shopOrderLinesTable.orderId, id));
          for (const line of lines) {
            const [updated] = await tx
              .update(shopProductsTable)
              .set({ stock: sql`${shopProductsTable.stock} - ${line.quantity}` })
              .where(
                and(
                  eq(shopProductsTable.id, line.productId),
                  gte(shopProductsTable.stock, line.quantity),
                ),
              )
              .returning();
            if (!updated) {
              throw Object.assign(new Error("Onvoldoende voorraad om deze bestelling goed te keuren."), { status: 409 });
            }
            lowStockProducts.push(updated);
          }
        }
      });
    } catch (err: any) {
      if (err?.status === 409) {
        res.status(409).json({ message: err.message });
        return;
      }
      throw err;
    }
    for (const p of lowStockProducts) {
      await notifyLowStock(p);
    }

    if (isDecision) {
      await db.insert(notificationsTable).values({
        userId: order.requesterId,
        title: `Bestelling ${order.number} ${next}`,
        body:
          next === "goedgekeurd"
            ? `Je bestelling van € ${order.totalAmount.toFixed(2)} is goedgekeurd.`
            : `Je bestelling is afgekeurd${parsed.data.decisionNote ? `: ${parsed.data.decisionNote}` : "."}`,
        kind: "webshop",
        linkPath: "/webshop",
      });
    }

    const [result] = await loadOrders(eq(shopOrdersTable.id, id));
    res.json(result);
  },
);

router.get("/budgets", async (_req, res): Promise<void> => {
  const budgets = await db.select().from(budgetsTable).orderBy(budgetsTable.department);
  const orders = await db
    .select({
      department: shopOrdersTable.department,
      status: shopOrdersTable.status,
      total: shopOrdersTable.totalAmount,
    })
    .from(shopOrdersTable);
  res.json(
    budgets.map((b) => {
      const deptOrders = orders.filter((o) => o.department === b.department);
      const spent = deptOrders
        .filter((o) => SPENT_STATUSES.includes(o.status))
        .reduce((s, o) => s + o.total, 0);
      const pending = deptOrders
        .filter((o) => o.status === "ingediend")
        .reduce((s, o) => s + o.total, 0);
      return {
        id: b.id,
        department: b.department,
        year: b.year,
        amount: b.amount,
        spent: Math.round(spent * 100) / 100,
        pending: Math.round(pending * 100) / 100,
        remaining: Math.round((b.amount - spent) * 100) / 100,
      };
    }),
  );
});

export default router;
