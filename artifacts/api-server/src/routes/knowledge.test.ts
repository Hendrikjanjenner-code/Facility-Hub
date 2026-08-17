/**
 * Integration test: category link changes reflect immediately in /suggest results.
 *
 * Flow:
 *  1. Create a knowledge article linked to ticket-category A.
 *  2. PATCH the article to switch the link to ticket-category B.
 *  3. /suggest?ticketCategoryId=B  → article IS returned.
 *  4. /suggest?ticketCategoryId=A  → article is NOT returned.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import express, { type Request, type Response, type NextFunction } from "express";
import cookieParser from "cookie-parser";
import { db, knowledgeArticlesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Stub requireAuth so we don't need a real session cookie / DB user lookup.
// The stub injects a facilitair_manager so the PATCH route is accessible.
// ---------------------------------------------------------------------------
vi.mock("../lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/auth")>();
  return {
    ...actual,
    requireAuth: (_req: Request, _res: Response, next: NextFunction) => {
      (_req as Request & { currentUser: unknown }).currentUser = {
        id: 9999,
        email: "test@example.com",
        password: "hashed-test-password",
        name: "Test Manager",
        role: "facilitair_manager",
        department: "test",
        avatarColor: "#000",
        notificationPreference: "email",
      };
      next();
    },
  };
});

// Import the router AFTER mocking so vi.mock is hoisted correctly.
const { default: knowledgeRouter } = await import("./knowledge");

// ---------------------------------------------------------------------------
// Build a minimal Express app that mirrors the real one (json + router).
// ---------------------------------------------------------------------------
const SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret";

const app = express();
app.use(cookieParser(SESSION_SECRET));
app.use(express.json());
app.use("/api", knowledgeRouter);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
let createdArticleId: number | null = null;

const CAT_A = 101;
const CAT_B = 202;

// ---------------------------------------------------------------------------
// Lifecycle: clean up any article we created so the DB stays tidy.
// ---------------------------------------------------------------------------
beforeAll(async () => {
  // Nothing to set up – we rely on the real DATABASE_URL env var.
});

afterAll(async () => {
  if (createdArticleId !== null) {
    await db
      .delete(knowledgeArticlesTable)
      .where(eq(knowledgeArticlesTable.id, createdArticleId));
  }
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("Knowledge article suggest – category link update", () => {
  it("step 1: creates an article linked to category A", async () => {
    const res = await request(app)
      .post("/api/knowledge-articles")
      .send({
        title: "Test artikel categorie koppeling",
        body: "Dit artikel beschrijft een procedure.",
        category: "procedure",
        tags: [],
        ticketCategoryIds: [CAT_A],
      });

    expect(res.status).toBe(201);
    expect(res.body.ticketCategoryIds).toContain(CAT_A);
    createdArticleId = res.body.id as number;
  });

  it("step 2: /suggest?ticketCategoryId=A returns the article before the update", async () => {
    const res = await request(app).get(
      `/api/knowledge-articles/suggest?ticketCategoryId=${CAT_A}`,
    );

    expect(res.status).toBe(200);
    const ids = (res.body as { id: number }[]).map((a) => a.id);
    expect(ids).toContain(createdArticleId);
  });

  it("step 3: PATCH switches the linked category from A to B", async () => {
    expect(createdArticleId).not.toBeNull();

    const res = await request(app)
      .patch(`/api/knowledge-articles/${createdArticleId}`)
      .send({ ticketCategoryIds: [CAT_B] });

    expect(res.status).toBe(200);
    expect(res.body.ticketCategoryIds).toContain(CAT_B);
    expect(res.body.ticketCategoryIds).not.toContain(CAT_A);
  });

  it("step 4: /suggest?ticketCategoryId=B now returns the article", async () => {
    const res = await request(app).get(
      `/api/knowledge-articles/suggest?ticketCategoryId=${CAT_B}`,
    );

    expect(res.status).toBe(200);
    const ids = (res.body as { id: number }[]).map((a) => a.id);
    expect(ids).toContain(createdArticleId);
  });

  it("step 5: /suggest?ticketCategoryId=A no longer returns the article", async () => {
    const res = await request(app).get(
      `/api/knowledge-articles/suggest?ticketCategoryId=${CAT_A}`,
    );

    expect(res.status).toBe(200);
    const ids = (res.body as { id: number }[]).map((a) => a.id);
    expect(ids).not.toContain(createdArticleId);
  });
});
