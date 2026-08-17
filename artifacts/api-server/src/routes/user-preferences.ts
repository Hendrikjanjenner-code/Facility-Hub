import { Router, type IRouter } from "express";
import { db, userPreferencesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();
router.use(requireAuth);

/** GET /api/user-preferences/:key — fetch a single preference value */
router.get("/user-preferences/:key", async (req, res): Promise<void> => {
  const userId = req.currentUser!.id;
  const { key } = req.params;
  const [row] = await db
    .select()
    .from(userPreferencesTable)
    .where(
      and(
        eq(userPreferencesTable.userId, userId),
        eq(userPreferencesTable.key, key),
      ),
    );
  res.json({ key, value: row?.value ?? null });
});

/** PUT /api/user-preferences/:key — upsert a single preference value */
router.put("/user-preferences/:key", async (req, res): Promise<void> => {
  const { value } = req.body as { value?: unknown };
  if (typeof value !== "string") {
    res.status(400).json({ message: "Ongeldige invoer: value moet een string zijn" });
    return;
  }
  const userId = req.currentUser!.id;
  const { key } = req.params;

  const [row] = await db
    .insert(userPreferencesTable)
    .values({ userId, key, value })
    .onConflictDoUpdate({
      target: [userPreferencesTable.userId, userPreferencesTable.key],
      set: { value },
    })
    .returning();

  res.json({ key, value: row!.value });
});

/** DELETE /api/user-preferences/:key — remove a preference */
router.delete("/user-preferences/:key", async (req, res): Promise<void> => {
  const userId = req.currentUser!.id;
  const { key } = req.params;
  await db
    .delete(userPreferencesTable)
    .where(
      and(
        eq(userPreferencesTable.userId, userId),
        eq(userPreferencesTable.key, key),
      ),
    );
  res.json({ message: "Voorkeur verwijderd" });
});

export default router;
