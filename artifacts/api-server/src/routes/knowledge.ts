import { Router, type IRouter } from "express";
import { db, knowledgeArticlesTable } from "@workspace/db";
import { eq, ilike, or, desc, type SQL } from "drizzle-orm";
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
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}

// Quick suggest (max 5) – called while typing in the melding form
router.get("/knowledge-articles/suggest", async (req, res): Promise<void> => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (!q || q.length < 2) {
    res.json([]);
    return;
  }
  const pattern = `%${q}%`;
  const rows = await db
    .select()
    .from(knowledgeArticlesTable)
    .where(
      or(
        ilike(knowledgeArticlesTable.title, pattern),
        ilike(knowledgeArticlesTable.body, pattern),
      ),
    )
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

// Create article (managers only)
router.post("/knowledge-articles", async (req, res): Promise<void> => {
  const user = req.currentUser!;
  if (!MANAGER_ROLES.includes(user.role)) {
    res.status(403).json({ message: "Geen toegang" });
    return;
  }
  const { title, body, category, tags } = req.body as {
    title?: string;
    body?: string;
    category?: string;
    tags?: string[];
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
    })
    .returning();
  res.status(201).json(serialize(created!));
});

export default router;
