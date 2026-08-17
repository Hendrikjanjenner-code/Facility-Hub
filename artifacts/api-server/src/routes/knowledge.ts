import { Router, type IRouter } from "express";
import { db, knowledgeArticlesTable } from "@workspace/db";
import { eq, ilike, or, desc, sql, type SQL } from "drizzle-orm";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();
router.use(requireAuth);

const MANAGER_ROLES = ["facilitair_manager", "beheerder", "servicedesk"];

function serialize(a: typeof knowledgeArticlesTable.$inferSelect) {
  return {
    id: a.id,
    title: a.title,
    body: a.body,
    category: a.category,
    tags: (a.tags as string[]) ?? [],
    ticketCategoryIds: (a.ticketCategoryIds as number[]) ?? [],
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}

// Quick suggest (max 5) – called while typing in the melding form, or on category select
router.get("/knowledge-articles/suggest", async (req, res): Promise<void> => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const ticketCategoryId =
    typeof req.query.ticketCategoryId === "string"
      ? parseInt(req.query.ticketCategoryId, 10)
      : null;

  // Need at least one meaningful filter
  if (!q || q.length < 2) {
    if (ticketCategoryId === null || isNaN(ticketCategoryId)) {
      res.json([]);
      return;
    }
  }

  const conditions: SQL[] = [];

  if (q && q.length >= 2) {
    const pattern = `%${q}%`;
    const textCond = or(
      ilike(knowledgeArticlesTable.title, pattern),
      ilike(knowledgeArticlesTable.body, pattern),
    );
    if (textCond) conditions.push(textCond);
  }

  if (ticketCategoryId !== null && !isNaN(ticketCategoryId)) {
    // jsonb @> checks if the array contains the value
    conditions.push(
      sql`${knowledgeArticlesTable.ticketCategoryIds} @> ${JSON.stringify([ticketCategoryId])}::jsonb`,
    );
  }

  if (conditions.length === 0) {
    res.json([]);
    return;
  }

  const rows = await db
    .select()
    .from(knowledgeArticlesTable)
    .where(conditions.length === 1 ? conditions[0] : or(...conditions))
    .orderBy(desc(knowledgeArticlesTable.updatedAt))
    .limit(5);

  res.json(rows.map(serialize));
});

// List / search all articles
router.get("/knowledge-articles", async (req, res): Promise<void> => {
  const conditions: SQL[] = [];
  const q = req.query;
  if (typeof q.search === "string" && q.search) {
    const pattern = `%${q.search}%`;
    const searchCond = or(
      ilike(knowledgeArticlesTable.title, pattern),
      ilike(knowledgeArticlesTable.body, pattern),
    );
    if (searchCond) conditions.push(searchCond);
  }
  if (typeof q.category === "string" && q.category) {
    conditions.push(eq(knowledgeArticlesTable.category, q.category));
  }
  const rows = await db
    .select()
    .from(knowledgeArticlesTable)
    .where(conditions.length > 0 ? (conditions.length === 1 ? conditions[0] : undefined) : undefined)
    .orderBy(desc(knowledgeArticlesTable.updatedAt));

  // Apply filters manually if multiple conditions (and() not imported yet)
  const filtered =
    conditions.length > 1
      ? rows.filter((r) => {
          const s = q.search ? q.search.toString().toLowerCase() : "";
          const cat = q.category ? q.category.toString() : "";
          const matchSearch =
            !s ||
            r.title.toLowerCase().includes(s) ||
            r.body.toLowerCase().includes(s);
          const matchCat = !cat || r.category === cat;
          return matchSearch && matchCat;
        })
      : rows;

  res.json(filtered.map(serialize));
});

// Update article (managers only)
router.patch("/knowledge-articles/:id", async (req, res): Promise<void> => {
  const user = req.currentUser!;
  if (!MANAGER_ROLES.includes(user.role)) {
    res.status(403).json({ message: "Geen toegang" });
    return;
  }
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ message: "Ongeldig id" });
    return;
  }
  const { title, body, category, tags, ticketCategoryIds } = req.body as {
    title?: string;
    body?: string;
    category?: string;
    tags?: string[];
    ticketCategoryIds?: number[];
  };
  const updates: Partial<typeof knowledgeArticlesTable.$inferInsert> = {};
  if (title !== undefined) updates.title = title.trim();
  if (body !== undefined) updates.body = body.trim();
  if (category !== undefined) updates.category = category.trim();
  if (tags !== undefined) updates.tags = Array.isArray(tags) ? tags : [];
  if (ticketCategoryIds !== undefined) updates.ticketCategoryIds = Array.isArray(ticketCategoryIds) ? ticketCategoryIds : [];

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ message: "Geen velden om bij te werken" });
    return;
  }
  const [updated] = await db
    .update(knowledgeArticlesTable)
    .set(updates)
    .where(eq(knowledgeArticlesTable.id, id))
    .returning();
  if (!updated) {
    res.status(404).json({ message: "Artikel niet gevonden" });
    return;
  }
  res.json(serialize(updated));
});

// Delete article (managers only)
router.delete("/knowledge-articles/:id", async (req, res): Promise<void> => {
  const user = req.currentUser!;
  if (!MANAGER_ROLES.includes(user.role)) {
    res.status(403).json({ message: "Geen toegang" });
    return;
  }
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ message: "Ongeldig id" });
    return;
  }
  const [deleted] = await db
    .delete(knowledgeArticlesTable)
    .where(eq(knowledgeArticlesTable.id, id))
    .returning();
  if (!deleted) {
    res.status(404).json({ message: "Artikel niet gevonden" });
    return;
  }
  res.status(204).end();
});

// Create article (managers only)
router.post("/knowledge-articles", async (req, res): Promise<void> => {
  const user = req.currentUser!;
  if (!MANAGER_ROLES.includes(user.role)) {
    res.status(403).json({ message: "Geen toegang" });
    return;
  }
  const { title, body, category, tags, ticketCategoryIds } = req.body as {
    title?: string;
    body?: string;
    category?: string;
    tags?: string[];
    ticketCategoryIds?: number[];
  };
  if (!title?.trim() || !body?.trim() || !category?.trim()) {
    res.status(400).json({ message: "Titel, inhoud en categorie zijn verplicht" });
    return;
  }
  const [created] = await db
    .insert(knowledgeArticlesTable)
    .values({
      title: title.trim(),
      body: body.trim(),
      category: category.trim(),
      tags: Array.isArray(tags) ? tags : [],
      ticketCategoryIds: Array.isArray(ticketCategoryIds) ? ticketCategoryIds : [],
    })
    .returning();
  res.status(201).json(serialize(created!));
});

export default router;
