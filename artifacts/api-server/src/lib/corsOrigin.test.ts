/**
 * Tests for the CORS origin configuration.
 *
 * Covers resolveAllowedOrigin validation plus end-to-end CORS header
 * behaviour on an Express app configured the same way as the API server:
 * - configured origin is reflected
 * - unapproved origins get no Access-Control-Allow-Origin header
 * - unset configuration disables CORS entirely (never wildcard)
 */
import { describe, it, expect } from "vitest";
import request from "supertest";
import express from "express";
import cors from "cors";
import { resolveAllowedOrigin } from "./corsOrigin";

function makeApp(allowedOrigin: string | undefined) {
  const app = express();
  app.use(cors({ origin: resolveAllowedOrigin(allowedOrigin), credentials: true }));
  app.get("/ping", (_req, res) => res.json({ ok: true }));
  return app;
}

describe("resolveAllowedOrigin", () => {
  it("returns false when unset or empty", () => {
    expect(resolveAllowedOrigin(undefined)).toBe(false);
    expect(resolveAllowedOrigin("")).toBe(false);
    expect(resolveAllowedOrigin("   ")).toBe(false);
  });

  it("rejects wildcard values", () => {
    expect(() => resolveAllowedOrigin("*")).toThrow(/wildcard/);
    expect(() => resolveAllowedOrigin("https://*.example.com")).toThrow(/wildcard/);
  });

  it("rejects invalid or non-http(s) values", () => {
    expect(() => resolveAllowedOrigin("not-a-url")).toThrow(/not a valid URL/);
    expect(() => resolveAllowedOrigin("ftp://example.com")).toThrow(/http or https/);
  });

  it("normalizes a valid URL to its bare origin", () => {
    expect(resolveAllowedOrigin("https://app.example.com")).toEqual(["https://app.example.com"]);
    expect(resolveAllowedOrigin("https://app.example.com/some/path")).toEqual([
      "https://app.example.com",
    ]);
  });
});

describe("CORS behaviour", () => {
  it("reflects the configured origin", async () => {
    const res = await request(makeApp("https://app.example.com"))
      .get("/ping")
      .set("Origin", "https://app.example.com");
    expect(res.status).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBe("https://app.example.com");
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
  });

  it("sends no CORS headers for an unapproved origin", async () => {
    const res = await request(makeApp("https://app.example.com"))
      .get("/ping")
      .set("Origin", "https://evil.example");
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("sends no CORS headers when ALLOWED_ORIGIN is unset", async () => {
    const res = await request(makeApp(undefined))
      .get("/ping")
      .set("Origin", "https://evil.example");
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
    expect(res.headers["access-control-allow-origin"]).not.toBe("*");
  });
});
