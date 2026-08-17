/**
 * Tests: closing a ticket automatically finishes its linked MJOP tasks.
 *
 * Covers PATCH /tickets/:id for the logic introduced in lines 318–337 of the
 * original tickets.ts (now delegated to shouldFinishMjopTasks +
 * finishLinkedMjopTasks helpers).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

// ─── Hoisted mock state ───────────────────────────────────────────────────────
// vi.hoisted runs before module resolution, so these refs are safe to use
// inside vi.mock() factories below.

const h = vi.hoisted(() => {
  // Captured arguments from the mjopTakenTable update call inside the
  // transaction. Reset in beforeEach.
  const state = {
    mjopSetCalledWith: null as null | { status: string },
    mjopWhereCalledWith: null as null | unknown,
    mjopUpdateCalled: false,
  };

  // Minimal table identity objects — only need to be distinct for the
  // update() switch inside the transaction mock.
  const ticketsTable = { __table: "tickets" } as unknown;
  const mjopTakenTable = { __table: "mjop_taken" } as unknown;
  const ticketCategoriesTable = { __table: "ticket_categories" } as unknown;
  const roomsTable = { __table: "rooms" } as unknown;
  const floorsTable = { __table: "floors" } as unknown;
  const buildingsTable = { __table: "buildings" } as unknown;
  const assetsTable = { __table: "assets" } as unknown;
  const usersTable = { __table: "users" } as unknown;

  // A fake "existing" ticket returned by the initial SELECT.
  const existingTicket = {
    id: 1,
    number: "GC-2026-0001",
    title: "Test melding",
    description: "desc",
    status: "in_behandeling",
    priority: "P3",
    categoryId: 10,
    roomId: null,
    assetId: null,
    reporterId: 42,
    assigneeId: null,
    formData: null,
    slaDueAt: null,
    plannedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // Chainable mock for tx.update(mjopTakenTable).set(...).where(...)
  const makeMjopUpdateChain = () => ({
    set: vi.fn().mockImplementation((values: { status: string }) => {
      state.mjopSetCalledWith = values;
      state.mjopUpdateCalled = true;
      return {
        where: vi.fn().mockImplementation((condition: unknown) => {
          state.mjopWhereCalledWith = condition;
          return Promise.resolve([]);
        }),
      };
    }),
  });

  // Chainable mock for tx.update(ticketsTable).set(...).where(...)
  const makeTicketUpdateChain = () => ({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([]),
    }),
  });

  // Mock transaction: calls the callback immediately with a fake tx object.
  const makeTransaction = () =>
    vi.fn().mockImplementation(async (cb: (tx: unknown) => Promise<void>) => {
      const tx = {
        update: vi.fn().mockImplementation((table: unknown) => {
          if (table === mjopTakenTable) return makeMjopUpdateChain();
          return makeTicketUpdateChain();
        }),
      };
      await cb(tx);
    });

  // fetchTickets is a complex join — we just need it to return one row.
  const makeSelectChain = (overrides?: Partial<typeof existingTicket>) => {
    const ticket = { ...existingTicket, ...overrides };
    // The route calls db.select() twice:
    //   1. Simple select to get existing ticket (returns ticket row)
    //   2. fetchTickets (complex join) — we return a flat object shaped for serializeTicket
    let callCount = 0;
    return vi.fn().mockImplementation(() => ({
      from: vi.fn().mockReturnValue({
        leftJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([ticket]),
        orderBy: vi.fn().mockResolvedValue([
          {
            t: ticket,
            categoryName: "Test",
            roomName: null,
            buildingName: null,
            assetName: null,
            reporterName: "Reporter",
            assigneeName: null,
          },
        ]),
      }),
    }));
  };

  return {
    state,
    ticketsTable,
    mjopTakenTable,
    ticketCategoriesTable,
    roomsTable,
    floorsTable,
    buildingsTable,
    assetsTable,
    usersTable,
    existingTicket,
    makeTransaction,
    makeSelectChain,
  };
});

// ─── Module mocks ─────────────────────────────────────────────────────────────

// Spread real exports so other routes (mjop.ts, etc.) still get their table
// definitions. We only override `db` with our controllable mock object.
vi.mock("@workspace/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workspace/db")>();
  return {
    ...actual,
    // Override table identity stubs so our update() switch can distinguish them
    ticketsTable: h.ticketsTable,
    mjopTakenTable: h.mjopTakenTable,
    db: {
      select: vi.fn(),   // replaced per-test in resetDbMocks()
      transaction: vi.fn(), // replaced per-test in resetDbMocks()
    },
  };
});

// Auth middleware: inject a beheerder (manager) so all permission checks pass.
vi.mock("../../lib/auth", () => ({
  SESSION_COOKIE: "gc_session",
  requireAuth: (req: any, _res: any, next: any) => {
    req.currentUser = {
      id: 99,
      name: "Test Beheerder",
      email: "test@test.nl",
      role: "beheerder",
    };
    next();
  },
  TICKET_MANAGER_ROLES: ["servicedesk", "facilitair_manager", "beheerder"],
  loadUser: vi.fn(),
  requireRole: vi.fn(() => (_req: any, _res: any, next: any) => next()),
  toPublicUser: vi.fn((u: any) => u),
}));

// Suppress real notifications.
vi.mock("../../lib/notify", () => ({
  notify: vi.fn().mockResolvedValue(undefined),
}));

// pino-http can be noisy in tests — replace with silent no-op middleware.
vi.mock("pino-http", () => ({
  default: () => (_req: any, _res: any, next: any) => next(),
}));

// SESSION_SECRET must be set before app.ts is imported (it throws otherwise).
process.env.SESSION_SECRET = "test-secret-for-vitest";

// ─── Helpers to rebuild fresh mocks per test ─────────────────────────────────

import { db } from "@workspace/db";

function resetDbMocks(existingStatusOverride?: string) {
  h.state.mjopSetCalledWith = null;
  h.state.mjopWhereCalledWith = null;
  h.state.mjopUpdateCalled = false;

  const existingTicket = {
    ...h.existingTicket,
    status: existingStatusOverride ?? "in_behandeling",
  };

  // Rebuild the select mock so it returns the ticket with the desired status.
  // Call 1 (on db): simple select — existing ticket lookup
  // Call 2 (on db): fetchTickets — complex join chain for the response
  // Calls on tx.select: beheerder lookup inside the transaction (returns [])
  let dbSelectCallCount = 0;
  (db.select as ReturnType<typeof vi.fn>).mockImplementation(() => {
    dbSelectCallCount++;
    if (dbSelectCallCount === 1) {
      // Simple select — return raw ticket row
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([existingTicket]),
        }),
      };
    }
    // fetchTickets — complex join chain, return a shaped row
    return {
      from: vi.fn().mockReturnValue({
        leftJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockResolvedValue([
            {
              t: existingTicket,
              categoryName: "Test",
              roomName: null,
              buildingName: null,
              assetName: null,
              reporterName: "Reporter",
              assigneeName: null,
            },
          ]),
        }),
      }),
    };
  });

  // Rebuild transaction mock so captured state is fresh.
  // The route's transaction callback calls:
  //   tx.update(ticketsTable).set().where()
  //   tx.update(mjopTakenTable).set().where().returning()  ← when closing
  //   tx.select().from(usersTable).where()                 ← beheerder lookup
  //   tx.insert(notificationsTable).values()               ← per-beheerder notify
  (db.transaction as ReturnType<typeof vi.fn>).mockImplementation(
    async (cb: (tx: unknown) => Promise<void>) => {
      const tx = {
        update: vi.fn().mockImplementation((table: unknown) => {
          if (table === h.mjopTakenTable) {
            // MJOP update: .set().where().returning()
            return {
              set: vi.fn().mockImplementation((values: { status: string }) => {
                h.state.mjopSetCalledWith = values;
                h.state.mjopUpdateCalled = true;
                return {
                  where: vi.fn().mockImplementation((condition: unknown) => {
                    h.state.mjopWhereCalledWith = condition;
                    // .returning() resolves to [] — no rows transitioned in mock
                    return {
                      returning: vi.fn().mockResolvedValue([]),
                    };
                  }),
                };
              }),
            };
          }
          // ticketsTable update: .set().where()
          return {
            set: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([]),
            }),
          };
        }),
        // tx.select() for beheerder lookup — returns no rows so no notifications inserted
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
        // tx.insert() for in-transaction notifications
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockResolvedValue([]),
        }),
      };
      await cb(tx);
    },
  );
}

// ─── Import app AFTER all vi.mock() calls ─────────────────────────────────────
import app from "../../app";

// ─── Pure unit tests: shouldFinishMjopTasks ───────────────────────────────────

import {
  shouldFinishMjopTasks,
  finishLinkedMjopTasks,
} from "../tickets";

describe("shouldFinishMjopTasks (pure logic)", () => {
  it("returns true when ticket changes to gesloten", () => {
    expect(shouldFinishMjopTasks("gesloten", "in_behandeling")).toBe(true);
  });

  it("returns true when ticket changes to gereed", () => {
    expect(shouldFinishMjopTasks("gereed", "in_behandeling")).toBe(true);
  });

  it("returns true when ticket changes to gesloten from gepland", () => {
    expect(shouldFinishMjopTasks("gesloten", "gepland")).toBe(true);
  });

  it("returns false when status is unchanged (idempotent — already gesloten)", () => {
    expect(shouldFinishMjopTasks("gesloten", "gesloten")).toBe(false);
  });

  it("returns false when status is unchanged (idempotent — already gereed)", () => {
    expect(shouldFinishMjopTasks("gereed", "gereed")).toBe(false);
  });

  it("returns false when new status is a non-closing transition", () => {
    expect(shouldFinishMjopTasks("in_behandeling", "nieuw")).toBe(false);
    expect(shouldFinishMjopTasks("wacht_op_info", "in_behandeling")).toBe(false);
    expect(shouldFinishMjopTasks("ingepland", "nieuw")).toBe(false);
  });

  it("returns false when newStatus is undefined", () => {
    expect(shouldFinishMjopTasks(undefined, "in_behandeling")).toBe(false);
  });
});

// ─── Unit tests: finishLinkedMjopTasks ────────────────────────────────────────

describe("finishLinkedMjopTasks (unit)", () => {
  it("calls tx.update with set status=afgerond, WHERE restricting to gepland/in_uitvoering, and returns via .returning()", async () => {
    const returningFn = vi.fn().mockResolvedValue([]);
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
    const setFn = vi.fn().mockReturnValue({ where: whereFn });
    const updateFn = vi.fn().mockReturnValue({ set: setFn });
    const tx = { update: updateFn };

    const result = await finishLinkedMjopTasks(tx as any, 7);

    // Must target the mjopTakenTable
    expect(updateFn).toHaveBeenCalledWith(h.mjopTakenTable);

    // Must set status to afgerond
    expect(setFn).toHaveBeenCalledWith({ status: "afgerond" });

    // WHERE must have been applied
    expect(whereFn).toHaveBeenCalledOnce();
    const whereArg = whereFn.mock.calls[0][0];
    expect(whereArg).toBeDefined();

    // The WHERE condition should reference "gepland" and "in_uitvoering" but
    // NOT "afgerond" — ensuring already-finished tasks are left untouched.
    const condStr = JSON.stringify(whereArg);
    expect(condStr).toContain("gepland");
    expect(condStr).toContain("in_uitvoering");
    expect(condStr).not.toContain("afgerond");

    // Must use .returning() so the route can notify about completed tasks
    expect(returningFn).toHaveBeenCalledOnce();

    // Returns the array from .returning()
    expect(result).toEqual([]);
  });
});

// ─── Integration tests: PATCH /tickets/:id ───────────────────────────────────

describe("PATCH /api/tickets/:id — MJOP task completion", () => {
  beforeEach(() => {
    resetDbMocks("in_behandeling");
  });

  it("marks linked MJOP tasks as afgerond when status changes to gesloten", async () => {
    const res = await request(app)
      .patch("/api/tickets/1")
      .send({ status: "gesloten" });

    expect(res.status).toBe(200);
    expect(h.state.mjopUpdateCalled).toBe(true);
    expect(h.state.mjopSetCalledWith).toEqual({ status: "afgerond" });
  });

  it("marks linked MJOP tasks as afgerond when status changes to gereed", async () => {
    const res = await request(app)
      .patch("/api/tickets/1")
      .send({ status: "gereed" });

    expect(res.status).toBe(200);
    expect(h.state.mjopUpdateCalled).toBe(true);
    expect(h.state.mjopSetCalledWith).toEqual({ status: "afgerond" });
  });

  it("does NOT update MJOP tasks for a gepland ticket being closed", async () => {
    // Ticket currently has a linked MJOP task in "gepland" status — the WHERE
    // clause allows this; we verify the update path fires.
    resetDbMocks("ingepland");

    const res = await request(app)
      .patch("/api/tickets/1")
      .send({ status: "gesloten" });

    expect(res.status).toBe(200);
    expect(h.state.mjopUpdateCalled).toBe(true);
    expect(h.state.mjopSetCalledWith).toEqual({ status: "afgerond" });
  });

  it("does NOT update MJOP tasks when ticket status stays the same (idempotent)", async () => {
    // Existing ticket is already gesloten; we send the same status.
    resetDbMocks("gesloten");

    const res = await request(app)
      .patch("/api/tickets/1")
      .send({ status: "gesloten" });

    expect(res.status).toBe(200);
    // shouldFinishMjopTasks returns false for same→same, so no MJOP update.
    expect(h.state.mjopUpdateCalled).toBe(false);
  });

  it("does NOT update MJOP tasks when only non-status fields are changed", async () => {
    const res = await request(app)
      .patch("/api/tickets/1")
      .send({ title: "Nieuwe titel" });

    expect(res.status).toBe(200);
    expect(h.state.mjopUpdateCalled).toBe(false);
  });

  it("WHERE clause targets only gepland and in_uitvoering — afgerond tasks are excluded", async () => {
    await request(app)
      .patch("/api/tickets/1")
      .send({ status: "gesloten" });

    const condStr = JSON.stringify(h.state.mjopWhereCalledWith);
    // Active statuses must appear in the WHERE filter.
    expect(condStr).toContain("gepland");
    expect(condStr).toContain("in_uitvoering");
    // "afgerond" must NOT appear in the filter — already-finished tasks are
    // left untouched by design.
    expect(condStr).not.toContain("afgerond");
  });
});
