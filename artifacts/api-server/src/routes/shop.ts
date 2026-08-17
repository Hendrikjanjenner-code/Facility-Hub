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
  UpdateBudgetPolicyBody,
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
    budgetExceeded: o.order.budgetExceeded === 1,
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
    const parsed = UpdateBudgetPolicyBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Ongeldige invoer" });
      return;
    }
    const d = parsed.data;

    const updateValues: Partial<typeof shopProductsTable.$inferInsert> = {};

    const set: Partial<typeof shopProductsTable.$inferInsert> = {};

    const set: Partial<typeof shopProductsTable.$inferInsert> = {};
      const [created] = await tx
        .insert(shopOrdersTable)
        .values({
          number: `WS-TMP-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          requesterId: user.id,
          department,
          totalAmount: total,
          budgetExceeded: budgetExceeded ? 1 : 0,
        })
        .returning();

      const [numbered] = await tx
        .update(shopOrdersTable)
        .set({ number: `WS-2026-${String(1000 + created!.id)}` })
        .where(eq(shopOrdersTable.id, created!.id))
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
    const parsed = UpdateBudgetPolicyBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Ongeldige invoer" });
      return;
    }
    const d = parsed.data;

    const updateValues: Partial<typeof shopProductsTable.$inferInsert> = {};

    const set: Partial<typeof shopProductsTable.$inferInsert> = {};

    const set: Partial<typeof shopProductsTable.$inferInsert> = {};
    const [updated] = await db
      .update(budgetsTable)
      .set({ overBudgetPolicy: parsed.data.overBudgetPolicy as string })
      .where(eq(budgetsTable.id, id))
      .returning();
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
  const user = req.currentUser!;
  const conditions: SQL[] = [];
    const parsed = UpdateBudgetPolicyBody.safeParse(req.body);
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
    .where(and(inArray(shopProductsTable.id, productIds), eq(shopProductsTable.active, 1)));
  const byId = new Map(products.map((p) => [p.id, p]));
  let total = 0;
    const p = byId.get(productId);
  const department = user.department ?? "Onbekend";
  const currentYear = new Date().getFullYear();
  let order: typeof shopOrdersTable.$inferSelect;

      const [budgetRow] = await tx
        .select()
        .from(budgetsTable)
        .where(and(eq(budgetsTable.department, department), eq(budgetsTable.year, currentYear)))
        .for("update");
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

    const [result] = await loadOrders(eq(shopOrdersTable.id, id));

async function loadBudgetOrders() {
  return db
    .select({
      department: shopOrdersTable.department,
      status: shopOrdersTable.status,
      total: shopOrdersTable.totalAmount,
      createdAt: shopOrdersTable.createdAt,
    })
    .from(shopOrdersTable);
}
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
    const parsed = UpdateBudgetPolicyBody.safeParse(req.body);
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

        if (next === "goedgekeurd") {
          const lines = await tx
            .select()
            .from(shopOrderLinesTable)
            .where(eq(shopOrderLinesTable.orderId, id));
          for (const line of lines) {
    const [updated] = await db
      .update(budgetsTable)
      .set({ overBudgetPolicy: parsed.data.overBudgetPolicy as string })
      .where(eq(budgetsTable.id, id))
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

async function loadBudgetOrders() {
  return db
    .select({
      department: shopOrdersTable.department,
      status: shopOrdersTable.status,
      total: shopOrdersTable.totalAmount,
      createdAt: shopOrdersTable.createdAt,
    })
    .from(shopOrdersTable);
}
    const id = Number(req.params.id);
    const [order] = await db.select().from(shopOrdersTable).where(eq(shopOrdersTable.id, id));
    const [result] = await loadOrders(eq(shopOrdersTable.id, id));

async function loadBudgetOrders() {
  return db
    .select({
      department: shopOrdersTable.department,
      status: shopOrdersTable.status,
      total: shopOrdersTable.totalAmount,
      createdAt: shopOrdersTable.createdAt,
    })
    .from(shopOrdersTable);
}
    const id = Number(req.params.id);
    const [order] = await db.select().from(shopOrdersTable).where(eq(shopOrdersTable.id, id));
  const user = req.currentUser!;
    const [updated] = await db
      .update(budgetsTable)
      .set({ overBudgetPolicy: parsed.data.overBudgetPolicy as string })
      .where(eq(budgetsTable.id, id))
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

async function loadBudgetOrders() {
  return db
    .select({
      department: shopOrdersTable.department,
      status: shopOrdersTable.status,
      total: shopOrdersTable.totalAmount,
      createdAt: shopOrdersTable.createdAt,
    })
    .from(shopOrdersTable);
}
  const budgets = await db.select().from(budgetsTable).orderBy(budgetsTable.department);
    const orders = await loadBudgetOrders();
        const yearStart = new Date(`${currentYear}-01-01T00:00:00Z`);
        const yearEnd = new Date(`${currentYear + 1}-01-01T00:00:00Z`);

        const RESERVED_STATUSES = [...SPENT_STATUSES, "ingediend"];
        const spent = committed[0]?.total ?? 0;

        const remaining = Math.round((budgetRow.amount - spent) * 100) / 100;
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      res.status(400).json({ message: "Ongeldig id" });
      return;
    }
    const parsed = UpdateBudgetPolicyBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Ongeldige invoer" });
      return;
    }
    const [updated] = await db
      .update(budgetsTable)
      .set({ overBudgetPolicy: parsed.data.overBudgetPolicy as string })
      .where(eq(budgetsTable.id, id))
      .returning();
    if (!updated) {
      res.status(404).json({ message: "Budget niet gevonden" });
      return;
    }
    const orders = await loadBudgetOrders();
        const yearStart = new Date(`${currentYear}-01-01T00:00:00Z`);
        const yearEnd = new Date(`${currentYear + 1}-01-01T00:00:00Z`);

        const RESERVED_STATUSES = [...SPENT_STATUSES, "ingediend"];
        const spent = committed[0]?.total ?? 0;

        const remaining = Math.round((budgetRow.amount - spent) * 100) / 100;
export default router;

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

      let budgetExceeded = false;

function serializeBudget(
  b: typeof budgetsTable.$inferSelect,
  orders: { department: string; status: string; total: number; createdAt: Date }[],
) {
  const yearStart = new Date(`${b.year}-01-01T00:00:00Z`);
  const yearEnd = new Date(`${b.year + 1}-01-01T00:00:00Z`);
  const deptOrders = orders.filter(
    (o) => o.department === b.department && o.createdAt >= yearStart && o.createdAt < yearEnd,
  );
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
    overBudgetPolicy: b.overBudgetPolicy as "markeren" | "blokkeren",
    spent: Math.round(spent * 100) / 100,
    pending: Math.round(pending * 100) / 100,
    remaining: Math.round((b.amount - spent) * 100) / 100,
  };
}
