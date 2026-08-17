/**
 * Integration tests for POST /auth/login rate limiting.
 *
 * Exercises the express-rate-limit middleware end-to-end against the real
 * database: 10 failed attempts per IP+email per window, 429 afterwards,
 * successful logins excluded, and email keys normalized (case/whitespace).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import express from "express";
import cookieParser from "cookie-parser";
import { db, usersTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { hashPassword } from "../lib/password";
import authRouter from "./auth.js";

const EMAIL_BLOCKED = "ratelimit-blocked@test.invalid";
const EMAIL_OTHER = "ratelimit-other@test.invalid";
const EMAIL_SUCCESS = "ratelimit-success@test.invalid";
const PASSWORD = "correct-horse-battery";

function makeApp() {
  const app = express();
  app.use(cookieParser("test-secret"));
  app.use(express.json());
  app.use(authRouter);
  return app;
}

describe("POST /auth/login rate limiting", () => {
  const app = makeApp();

  beforeAll(async () => {
    await db
      .delete(usersTable)
      .where(inArray(usersTable.email, [EMAIL_BLOCKED, EMAIL_OTHER, EMAIL_SUCCESS]));
    await db.insert(usersTable).values(
      [EMAIL_BLOCKED, EMAIL_OTHER, EMAIL_SUCCESS].map((email) => ({
        email,
        password: hashPassword(PASSWORD),
        name: "Rate Limit Test",
        role: "eindgebruiker",
      })),
    );
  });

  afterAll(async () => {
    await db
      .delete(usersTable)
      .where(inArray(usersTable.email, [EMAIL_BLOCKED, EMAIL_OTHER, EMAIL_SUCCESS]));
  });

  it("returns 401 for the first 10 failures, then 429, keyed per email (normalized)", async () => {
    for (let i = 0; i < 10; i++) {
      const res = await request(app)
        .post("/auth/login")
        .send({ email: EMAIL_BLOCKED, password: `wrong-${i}` });
      expect(res.status).toBe(401);
    }

    // 11th failed attempt is blocked.
    const blocked = await request(app)
      .post("/auth/login")
      .send({ email: EMAIL_BLOCKED, password: "wrong-11" });
    expect(blocked.status).toBe(429);
    expect(blocked.body.message).toMatch(/Te veel inlogpogingen/);

    // Even the correct password is blocked once the limit is hit.
    const blockedCorrect = await request(app)
      .post("/auth/login")
      .send({ email: EMAIL_BLOCKED, password: PASSWORD });
    expect(blockedCorrect.status).toBe(429);

    // Case/whitespace variants of the email hit the same bucket.
    const variant = await request(app)
      .post("/auth/login")
      .send({ email: `  ${EMAIL_BLOCKED.toUpperCase()}  `, password: "wrong" });
    expect(variant.status).toBe(429);

    // A different email from the same IP is not blocked.
    const other = await request(app)
      .post("/auth/login")
      .send({ email: EMAIL_OTHER, password: "wrong" });
    expect(other.status).toBe(401);
  });

  it("does not count successful logins against the limit", async () => {
    for (let i = 0; i < 12; i++) {
      const res = await request(app)
        .post("/auth/login")
        .send({ email: EMAIL_SUCCESS, password: PASSWORD });
      expect(res.status).toBe(200);
      expect(res.body.email).toBe(EMAIL_SUCCESS);
    }
    // Still allowed to fail afterwards (failure budget untouched).
    const fail = await request(app)
      .post("/auth/login")
      .send({ email: EMAIL_SUCCESS, password: "wrong" });
    expect(fail.status).toBe(401);
  });
});
