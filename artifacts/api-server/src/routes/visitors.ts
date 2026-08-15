import { Router, type IRouter } from "express";
import { db, visitorsTable, usersTable } from "@workspace/db";
import { eq, and, type SQL } from "drizzle-orm";
import { CreateVisitorBody, UpdateVisitorBody } from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";
import { notify, notifyRole } from "../lib/notify";

const router: IRouter = Router();
router.use(requireAuth);

function serialize(v: typeof visitorsTable.$inferSelect, hostName: string | null) {
  return {
    id: v.id,
    name: v.name,
    company: v.company,
    email: v.email,
    hostId: v.hostId,
    hostName,
    visitDate: v.visitDate,
    expectedArrival: v.expectedArrival,
    badgeCode: v.badgeCode,
    status: v.status,
    checkedInAt: v.checkedInAt?.toISOString() ?? null,
    checkedOutAt: v.checkedOutAt?.toISOString() ?? null,
    createdAt: v.createdAt.toISOString(),
  };
}

router.get("/visitors", async (req, res): Promise<void> => {
  const conditions: SQL[] = [];
  const q = req.query;
  if (typeof q.date === "string" && q.date)
    conditions.push(eq(visitorsTable.visitDate, q.date));
  if (typeof q.status === "string" && q.status)
    conditions.push(eq(visitorsTable.status, q.status));
  // Only reception/management see all visitors; others only their own guests
  const user = req.currentUser!;
  if (!["receptie", "facilitair_manager", "beheerder"].includes(user.role)) {
    conditions.push(eq(visitorsTable.hostId, user.id));
  }
  const rows = await db
    .select({ v: visitorsTable, hostName: usersTable.name })
    .from(visitorsTable)
    .leftJoin(usersTable, eq(visitorsTable.hostId, usersTable.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(visitorsTable.visitDate, visitorsTable.expectedArrival);
  res.json(rows.map((r) => serialize(r.v, r.hostName)));
});

router.post("/visitors", async (req, res): Promise<void> => {
  const parsed = CreateVisitorBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Ongeldige invoer" });
    return;
  }
  const data = parsed.data;
  const user = req.currentUser!;
  // Only reception/management may register visitors on behalf of another host
  const mayPickHost = ["receptie", "facilitair_manager", "beheerder"].includes(
    user.role,
  );
  const hostId = mayPickHost ? (data.hostId ?? user.id) : user.id;
  const [hostUser] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, hostId));
  if (!hostUser) {
    res.status(400).json({ message: "Onbekende gastheer" });
    return;
  }
  const badgeCode = `BZ-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const [created] = await db
    .insert(visitorsTable)
    .values({
      name: data.name,
      company: data.company ?? null,
      email: data.email ?? null,
      hostId,
      visitDate: data.visitDate,
      expectedArrival: data.expectedArrival,
      badgeCode,
    })
    .returning();

  if (hostId !== user.id) {
    await notify(
      hostId,
      "Bezoeker aangemeld",
      `${data.name} wordt verwacht op ${data.visitDate} om ${data.expectedArrival}.`,
      "bezoeker",
      "/bezoekers",
    );
  }
  await notifyRole(
    "receptie",
    "Nieuwe bezoeker aangemeld",
    `${data.name}${data.company ? ` (${data.company})` : ""} op ${data.visitDate} om ${data.expectedArrival}.`,
    "bezoeker",
    "/bezoekers",
  );

  const [host] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, hostId));
  res.status(201).json(serialize(created!, host?.name ?? null));
});

router.patch("/visitors/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const parsed = UpdateVisitorBody.safeParse(req.body);
  if (Number.isNaN(id) || !parsed.success) {
    res.status(400).json({ message: "Ongeldige invoer" });
    return;
  }
  const [existing] = await db
    .select()
    .from(visitorsTable)
    .where(eq(visitorsTable.id, id));
  if (!existing) {
    res.status(404).json({ message: "Bezoeker niet gevonden" });
    return;
  }
  const user = req.currentUser!;
  const mayManage =
    ["receptie", "facilitair_manager", "beheerder"].includes(user.role) ||
    existing.hostId === user.id;
  if (!mayManage) {
    res.status(403).json({ message: "Geen toegang om deze bezoeker te wijzigen" });
    return;
  }
  if (
    parsed.data.status &&
    !["verwacht", "aanwezig", "vertrokken"].includes(parsed.data.status)
  ) {
    res.status(400).json({ message: "Ongeldige status" });
    return;
  }
  const update: Partial<typeof visitorsTable.$inferInsert> = {};
  if (parsed.data.status) {
    update.status = parsed.data.status;
    if (parsed.data.status === "aanwezig") update.checkedInAt = new Date();
    if (parsed.data.status === "vertrokken") update.checkedOutAt = new Date();
  }
  const [updated] = await db
    .update(visitorsTable)
    .set(update)
    .where(eq(visitorsTable.id, id))
    .returning();

  if (parsed.data.status === "aanwezig") {
    await notify(
      existing.hostId,
      "Je bezoeker is gearriveerd",
      `${existing.name} heeft ingecheckt bij de receptie.`,
      "bezoeker",
      "/bezoekers",
    );
  }

  const [host] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, existing.hostId));
  res.json(serialize(updated!, host?.name ?? null));
});

export default router;
