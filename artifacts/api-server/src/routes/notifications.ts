import { Router, type IRouter } from "express";
import { db, notificationsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();
router.use(requireAuth);

function serialize(n: typeof notificationsTable.$inferSelect) {
  return {
    id: n.id,
    userId: n.userId,
    title: n.title,
    body: n.body,
    kind: n.kind,
    linkPath: n.linkPath,
    read: n.read,
    createdAt: n.createdAt.toISOString(),
  };
}

router.get("/notifications", async (req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(notificationsTable)
    .where(eq(notificationsTable.userId, req.currentUser!.id))
    .orderBy(desc(notificationsTable.createdAt))
    .limit(50);
  res.json(rows.map(serialize));
});

router.patch("/notifications/:id/read", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ message: "Ongeldig id" });
    return;
  }
  const [updated] = await db
    .update(notificationsTable)
    .set({ read: true })
    .where(
      and(
        eq(notificationsTable.id, id),
        eq(notificationsTable.userId, req.currentUser!.id),
      ),
    )
    .returning();
  if (!updated) {
    res.status(404).json({ message: "Notificatie niet gevonden" });
    return;
  }
  res.json(serialize(updated));
});

router.post("/notifications/read-all", async (req, res): Promise<void> => {
  await db
    .update(notificationsTable)
    .set({ read: true })
    .where(eq(notificationsTable.userId, req.currentUser!.id));
  res.json({ message: "Alle notificaties gelezen" });
});

export default router;
