import { Router, type IRouter } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { db, usersTable } from "@workspace/db";
import { eq, ne, asc } from "drizzle-orm";
import { LoginBody } from "@workspace/api-zod";
import {
  SESSION_COOKIE,
  loadUser,
  requireAuth,
  requireRole,
  toPublicUser,
} from "../lib/auth";
import { verifyPassword, hashPassword } from "../lib/password";
import { timingSafeEqual, randomBytes } from "node:crypto";

const isProduction = process.env.NODE_ENV === "production";
// One-click demo accounts are a development/demo feature; in production they
// must be explicitly enabled.
const demoAccountsEnabled = !isProduction || process.env.DEMO_MODE === "true";

const router: IRouter = Router();

const ROLE_LABELS: Record<string, string> = {
  eindgebruiker: "Eindgebruiker",
  servicedesk: "Servicedeskmedewerker",
  facilitair_manager: "Facilitair manager",
  cateraar: "Cateraar",
  receptie: "Receptie",
  beheerder: "Beheerder",
  leverancier: "Leverancier",
};

// Rate limit login attempts to slow down password brute-force attacks.
// Keyed per IP + submitted email so one attacker can't hammer a single
// account, while legitimate users behind a shared IP are less affected.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) => {
    const email =
      typeof req.body?.email === "string"
        ? req.body.email.toLowerCase().trim()
        : "";
    return `${ipKeyGenerator(req.ip ?? "")}|${email}`;
  },
  // Only successful logins reset goodwill; count failures only.
  skipSuccessfulRequests: true,
  message: { message: "Te veel inlogpogingen. Probeer het later opnieuw." },
});

router.post("/auth/login", loginLimiter, async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Ongeldige invoer" });
    return;
  }
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, parsed.data.email.toLowerCase().trim()));
  if (!user || !verifyPassword(parsed.data.password, user.password)) {
    res.status(401).json({ message: "Ongeldig e-mailadres of wachtwoord" });
    return;
  }
  res.cookie(SESSION_COOKIE, String(user.id), {
    signed: true,
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    maxAge: 1000 * 60 * 60 * 24 * 7,
  });
  // Een eerdere gastsessie mag een normale login nooit alleen-lezen houden.
  res.clearCookie(GUEST_COOKIE);
  res.json(toPublicUser(user));
});

router.post("/auth/logout", (_req, res): void => {
  res.clearCookie(SESSION_COOKIE);
  res.clearCookie(GUEST_COOKIE);
  res.json({ message: "Uitgelogd" });
});

// ── Gasttoegang (alleen-lezen) ────────────────────────────────────────────────
// Een gedeeld gastwachtwoord geeft toegang tot een alleen-lezen gastaccount.
// Schrijfacties worden geblokkeerd door de guestReadOnly-middleware in app.ts.

export const GUEST_COOKIE = "gc_guest";
export const GUEST_EMAIL = "gast@letshare4gov.nl";

// In productie is een expliciet geconfigureerd gastwachtwoord verplicht;
// zonder GUEST_ACCESS_PASSWORD blijft gasttoegang daar uitgeschakeld.
const GUEST_PASSWORD =
  process.env["GUEST_ACCESS_PASSWORD"] ?? (isProduction ? null : "LetShare4gov");

const guestLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip ?? ""),
  skipSuccessfulRequests: true,
  message: { message: "Te veel pogingen. Probeer het later opnieuw." },
});

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) {
    // Compare against self to keep timing uniform, then fail.
    timingSafeEqual(ba, ba);
    return false;
  }
  return timingSafeEqual(ba, bb);
}

router.post("/auth/guest-login", guestLoginLimiter, async (req, res): Promise<void> => {
  if (!GUEST_PASSWORD) {
    res.status(403).json({ message: "Gasttoegang is niet geconfigureerd" });
    return;
  }
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!password || !safeEqual(password, GUEST_PASSWORD)) {
    res.status(401).json({ message: "Ongeldig wachtwoord" });
    return;
  }
  let [guest] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, GUEST_EMAIL));
  if (!guest) {
    // Onbruikbaar willekeurig wachtwoord: inloggen via het normale formulier kan niet.
    [guest] = await db
      .insert(usersTable)
      .values({
        email: GUEST_EMAIL,
        password: hashPassword(randomBytes(32).toString("hex")),
        name: "Gast",
        role: "eindgebruiker",
        department: "Gasttoegang",
        avatarColor: "#64748b",
      })
      .returning();
  }
  const cookieOpts = {
    signed: true,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: isProduction,
    maxAge: 1000 * 60 * 60 * 24,
  };
  res.cookie(SESSION_COOKIE, String(guest!.id), cookieOpts);
  res.cookie(GUEST_COOKIE, "1", cookieOpts);
  res.json(toPublicUser(guest!));
});

router.get("/auth/me", async (req, res): Promise<void> => {
  const user = await loadUser(req);
  if (!user) {
    res.status(401).json({ message: "Niet ingelogd" });
    return;
  }
  res.json(toPublicUser(user));
});

router.get("/auth/demo-accounts", async (_req, res): Promise<void> => {
  if (!demoAccountsEnabled) {
    res.json([]);
    return;
  }
  const users = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      role: usersTable.role,
    })
    .from(usersTable)
    .where(ne(usersTable.email, GUEST_EMAIL))
    .orderBy(asc(usersTable.name));
  const seen = new Set<string>();
  const accounts: { id: number; name: string; role: string; roleLabel: string }[] = [];
  for (const u of users) {
    const roleLabel = ROLE_LABELS[u.role] ?? u.role;
    const key = `${u.role}:${u.name}`;
    if (!seen.has(key)) {
      seen.add(key);
      accounts.push({ id: u.id, name: u.name, role: u.role, roleLabel });
    }
  }
  res.json(accounts);
});

// ── Notification preferences (task #31) ───────────────────────────────────────

router.put(
  "/users/me/preferences",
  requireAuth,
  async (req, res): Promise<void> => {
    const { notificationPreference } = req.body as { notificationPreference?: unknown };
    const allowed = ["inapp_only", "email", "all"];
    if (!allowed.includes(notificationPreference as string)) {
      res
        .status(400)
        .json({ message: "Ongeldige waarde. Kies 'inapp_only', 'email' of 'all'." });
      return;
    }
    const [updated] = await db
      .update(usersTable)
      .set({ notificationPreference: notificationPreference as string })
      .where(eq(usersTable.id, req.currentUser!.id))
      .returning();
    res.json(toPublicUser(updated!));
  },
);

export default router;
