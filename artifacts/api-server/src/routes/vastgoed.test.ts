/**
 * Integration tests for PATCH /rooms/:id/dossier — optimistic locking.
 *
 * These tests hit real Express route handlers against the real database so
 * that the locking logic in vastgoed.ts is exercised end-to-end.  Auth is
 * stubbed out: every request is treated as a facilitair_manager.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import express from "express";

// ── Stub auth before the router is imported ────────────────────────────────
vi.mock("../lib/auth", () => ({
  requireAuth: (_req: any, _res: any, next: any) => next(),
  requireRole:
    (..._roles: string[]) =>
    (_req: any, _res: any, next: any) =>
      next(),
  TICKET_MANAGER_ROLES: ["servicedesk", "facilitair_manager", "beheerder"],
  SESSION_COOKIE: "gc_session",
  toPublicUser: (u: any) => u,
  loadUser: async () => null,
}));

// Inject a currentUser so handlers that read req.currentUser don't crash.
// Express middleware runs before route handlers; we add it to the test app.
function injectUser(_req: any, _res: any, next: any) {
  _req.currentUser = {
    id: 1,
    email: "test@example.nl",
    name: "Test Gebruiker",
    role: "facilitair_manager",
    department: null,
    avatarColor: "blue",
  };
  next();
}

// Stub objectStorage / storageRefs — not needed for PATCH but imported by the router.
vi.mock("../lib/objectStorage", () => ({
  ObjectStorageService: class {
    async deleteObject() {}
  },
}));
vi.mock("../lib/storageRefs", () => ({
  isObjectPathReferenced: async () => true,
}));

// ── Import router AFTER mocks are in place ─────────────────────────────────
import vastgoedRouter from "./vastgoed.js";

// ── Import DB helpers for seed / cleanup ───────────────────────────────────
import {
  db,
  organizationsTable,
  sitesTable,
  buildingsTable,
  floorsTable,
  roomsTable,
  roomDossierHistoryTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";

// ── Build a minimal Express app ────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use(injectUser);
app.use(vastgoedRouter);

// ── Seed data ids ──────────────────────────────────────────────────────────
let orgId: number;
let siteId: number;
let buildingId: number;
let floorId: number;
let roomId: number;

beforeAll(async () => {
  const [org] = await db
    .insert(organizationsTable)
    .values({ name: "__test_org_locking__" })
    .returning({ id: organizationsTable.id });
  orgId = org!.id;

  const [site] = await db
    .insert(sitesTable)
    .values({ organizationId: orgId, name: "__test_site__", city: "Teststad" })
    .returning({ id: sitesTable.id });
  siteId = site!.id;

  const [building] = await db
    .insert(buildingsTable)
    .values({ siteId, name: "__test_building__", address: "Teststraat 1" })
    .returning({ id: buildingsTable.id });
  buildingId = building!.id;

  const [floor] = await db
    .insert(floorsTable)
    .values({ buildingId, name: "__test_floor__", level: 0 })
    .returning({ id: floorsTable.id });
  floorId = floor!.id;

  // Use an explicit JS Date so the stored timestamp has millisecond precision.
  // PostgreSQL's defaultNow() stores microseconds which JS Date cannot
  // represent, causing the round-trip comparison in the PATCH handler to fail.
  const seedUpdatedAt = new Date();
  const [room] = await db
    .insert(roomsTable)
    .values({
      floorId,
      name: "__test_room__",
      code: "TST-001",
      functionType: "kantoor",
      areaM2: 20,
      bookable: false,
      updatedAt: seedUpdatedAt,
    })
    .returning({ id: roomsTable.id });
  roomId = room!.id;
});

afterAll(async () => {
  await db.delete(roomDossierHistoryTable).where(eq(roomDossierHistoryTable.roomId, roomId));
  await db.delete(roomsTable).where(eq(roomsTable.id, roomId));
  await db.delete(floorsTable).where(eq(floorsTable.id, floorId));
  await db.delete(buildingsTable).where(eq(buildingsTable.id, buildingId));
  await db.delete(sitesTable).where(eq(sitesTable.id, siteId));
  await db.delete(organizationsTable).where(eq(organizationsTable.id, orgId));
});

// ── Helper: fetch the current updatedAt for the test room ─────────────────
async function getUpdatedAt(): Promise<string> {
  const [row] = await db
    .select({ updatedAt: roomsTable.updatedAt })
    .from(roomsTable)
    .where(eq(roomsTable.id, roomId));
  return row!.updatedAt.toISOString();
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("PATCH /rooms/:id/dossier — optimistic locking", () => {
  it("slaagt (HTTP 200) wanneer updatedAt overeenkomt met de huidige waarde", async () => {
    const updatedAt = await getUpdatedAt();

    const res = await request(app)
      .patch(`/rooms/${roomId}/dossier`)
      .send({ department: "Finance", updatedAt });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: roomId,
      department: "Finance",
    });
    expect(typeof res.body.updatedAt).toBe("string");
  });

  it("retourneert HTTP 409 met een current-object bij een verouderde updatedAt", async () => {
    // Use a timestamp that is certainly older than the current updatedAt.
    const staleTs = new Date(0).toISOString(); // 1970-01-01

    const res = await request(app)
      .patch(`/rooms/${roomId}/dossier`)
      .send({ department: "Finance", updatedAt: staleTs });

    expect(res.status).toBe(409);
    // The route returns the current room object directly on conflict
    expect(res.body).toMatchObject({ id: roomId });
  });

  it("simuleert twee gelijktijdige PATCH-verzoeken met dezelfde updatedAt — tweede krijgt HTTP 409", async () => {
    // Snapshot the current timestamp before either request is sent.
    const sharedUpdatedAt = await getUpdatedAt();

    // Fire both requests simultaneously.
    const [first, second] = await Promise.all([
      request(app)
        .patch(`/rooms/${roomId}/dossier`)
        .send({ functionType: "vergaderzaal", updatedAt: sharedUpdatedAt }),
      request(app)
        .patch(`/rooms/${roomId}/dossier`)
        .send({ functionType: "opslagruimte", updatedAt: sharedUpdatedAt }),
    ]);

    const statuses = [first.status, second.status].sort();
    // Exactly one must succeed and one must conflict.
    expect(statuses).toEqual([200, 409]);

    const conflicting = first.status === 409 ? first : second;
    // The route returns the current room object directly on conflict
    expect(conflicting.body).toMatchObject({ id: roomId });
  });
});
