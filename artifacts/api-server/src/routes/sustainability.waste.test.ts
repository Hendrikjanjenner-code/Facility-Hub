/**
 * Integration tests for PATCH /waste-registrations/:id and
 * DELETE /waste-registrations/:id.
 *
 * Auth is stubbed: every request runs as a beheerder (an allowed SUSTAIN role).
 * The unauthorized-role test overrides currentUser.role to "medewerker".
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import express from "express";

// ── Stub auth before the router is imported ────────────────────────────────
vi.mock("../lib/auth", () => ({
  requireAuth: (_req: any, _res: any, next: any) => next(),
  requireRole:
    (...roles: string[]) =>
    (req: any, res: any, next: any) => {
      if (roles.includes(req.currentUser?.role)) return next();
      res.status(403).json({ message: "Geen toegang" });
    },
  TICKET_MANAGER_ROLES: ["servicedesk", "facilitair_manager", "beheerder"],
  SESSION_COOKIE: "gc_session",
  toPublicUser: (u: any) => u,
  loadUser: async () => null,
}));

function injectUser(role = "beheerder") {
  return (_req: any, _res: any, next: any) => {
    _req.currentUser = {
      id: 1,
      email: "test@example.nl",
      name: "Test Beheerder",
      role,
      department: null,
      avatarColor: "green",
    };
    next();
  };
}

import sustainabilityRouter from "./sustainability.js";

import {
  db,
  organizationsTable,
  sitesTable,
  buildingsTable,
  wasteRegistrationsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";

// ── Build a minimal Express app (authorised beheerder) ─────────────────────
const app = express();
app.use(express.json());
app.use(injectUser("beheerder"));
app.use(sustainabilityRouter);

// ── Seed data ──────────────────────────────────────────────────────────────
let orgId: number;
let buildingId: number;
let wasteId: number;

beforeAll(async () => {
  const [org] = await db
    .insert(organizationsTable)
    .values({ name: "__test_waste_org__" })
    .returning({ id: organizationsTable.id });
  orgId = org!.id;

  const [site] = await db
    .insert(sitesTable)
    .values({ name: "__test_waste_site__", organizationId: orgId, city: "Teststad" })
    .returning({ id: sitesTable.id });

  const [building] = await db
    .insert(buildingsTable)
    .values({ name: "__test_waste_building__", siteId: site!.id, address: "Teststraat 1" })
    .returning({ id: buildingsTable.id });

  buildingId = building!.id;

  const [waste] = await db
    .insert(wasteRegistrationsTable)
    .values({
      buildingId,
      registrationDate: "2026-01-15",
      category: "restafval",
      weightKg: 120,
    })
    .returning({ id: wasteRegistrationsTable.id });

  wasteId = waste!.id;
});

afterAll(async () => {
  if (buildingId) {
    await db
      .delete(wasteRegistrationsTable)
      .where(eq(wasteRegistrationsTable.buildingId, buildingId));
    await db.delete(buildingsTable).where(eq(buildingsTable.id, buildingId));
  }
  // Delete sites before org (FK constraint)
  if (orgId) {
    await db.delete(sitesTable).where(eq(sitesTable.organizationId, orgId));
    await db.delete(organizationsTable).where(eq(organizationsTable.id, orgId));
  }
});

// ── PATCH tests ────────────────────────────────────────────────────────────
describe("PATCH /waste-registrations/:id", () => {
  it("updates weight and returns the corrected registration", async () => {
    const res = await request(app)
      .patch(`/waste-registrations/${wasteId}`)
      .send({ weightKg: 200 });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: wasteId, weightKg: 200 });
  });

  it("updates category", async () => {
    const res = await request(app)
      .patch(`/waste-registrations/${wasteId}`)
      .send({ category: "papier" });

    expect(res.status).toBe(200);
    expect(res.body.category).toBe("papier");
  });

  it("updates both category and weightKg", async () => {
    const res = await request(app)
      .patch(`/waste-registrations/${wasteId}`)
      .send({ category: "gft", weightKg: 55 });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: wasteId, category: "gft", weightKg: 55 });
  });

  it("returns 400 for an invalid category", async () => {
    const res = await request(app)
      .patch(`/waste-registrations/${wasteId}`)
      .send({ category: "onbekend" });

    expect(res.status).toBe(400);
  });

  it("returns 400 for a negative weight", async () => {
    const res = await request(app)
      .patch(`/waste-registrations/${wasteId}`)
      .send({ weightKg: -5 });

    expect(res.status).toBe(400);
  });

  it("returns 400 when no fields are provided", async () => {
    const res = await request(app)
      .patch(`/waste-registrations/${wasteId}`)
      .send({});

    expect(res.status).toBe(400);
  });

  it("returns 404 for a non-existent id", async () => {
    const res = await request(app)
      .patch("/waste-registrations/999999999")
      .send({ weightKg: 50 });

    expect(res.status).toBe(404);
  });

  it("returns 400 for a non-numeric id", async () => {
    const res = await request(app)
      .patch("/waste-registrations/abc")
      .send({ weightKg: 50 });

    expect(res.status).toBe(400);
  });

  it("returns 403 for an unauthorised role", async () => {
    const unauthorisedApp = express();
    unauthorisedApp.use(express.json());
    unauthorisedApp.use(injectUser("medewerker"));
    unauthorisedApp.use(sustainabilityRouter);

    const res = await request(unauthorisedApp)
      .patch(`/waste-registrations/${wasteId}`)
      .send({ weightKg: 50 });

    expect(res.status).toBe(403);
  });
});

// ── DELETE tests ───────────────────────────────────────────────────────────
describe("DELETE /waste-registrations/:id", () => {
  let deleteTargetId: number;

  beforeAll(async () => {
    const [waste] = await db
      .insert(wasteRegistrationsTable)
      .values({
        buildingId,
        registrationDate: "2026-02-10",
        category: "glas",
        weightKg: 30,
      })
      .returning({ id: wasteRegistrationsTable.id });

    deleteTargetId = waste!.id;
  });

  it("deletes a registration and returns 204", async () => {
    const res = await request(app).delete(
      `/waste-registrations/${deleteTargetId}`,
    );

    expect(res.status).toBe(204);

    const [gone] = await db
      .select()
      .from(wasteRegistrationsTable)
      .where(eq(wasteRegistrationsTable.id, deleteTargetId));

    expect(gone).toBeUndefined();
  });

  it("returns 404 for an already-deleted id", async () => {
    const res = await request(app).delete(
      `/waste-registrations/${deleteTargetId}`,
    );

    expect(res.status).toBe(404);
  });

  it("returns 400 for a non-numeric id", async () => {
    const res = await request(app).delete("/waste-registrations/abc");

    expect(res.status).toBe(400);
  });

  it("returns 403 for an unauthorised role", async () => {
    const unauthorisedApp = express();
    unauthorisedApp.use(express.json());
    unauthorisedApp.use(injectUser("medewerker"));
    unauthorisedApp.use(sustainabilityRouter);

    const res = await request(unauthorisedApp).delete(
      `/waste-registrations/${wasteId}`,
    );

    expect(res.status).toBe(403);
  });
});
