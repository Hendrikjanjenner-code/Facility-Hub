import { Router, type IRouter } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { db, usersTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { LoginBody } from "@workspace/api-zod";
import {
  SESSION_COOKIE,
  loadUser,
  requireAuth,
  requireRole,
  toPublicUser,
} from "../lib/auth";
import { verifyPassword } from "../lib/password";

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
  res.json(toPublicUser(user));
});

router.post("/auth/logout", (_req, res): void => {
  res.clearCookie(SESSION_COOKIE);
  res.json({ message: "Uitgelogd" });
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
  const users = await db.select().from(usersTable).orderBy(asc(usersTable.id));
  const seen = new Set<string>();
  const accounts = [];
  for (const u of users) {
    if (seen.has(u.role)) continue;
    seen.add(u.role);
    accounts.push({
      email: u.email,
      name: u.name,
      role: u.role,
      roleLabel: ROLE_LABELS[u.role] ?? u.role,
    });
  }
  res.json(accounts);
});

// Staff directory: only roles that assign tickets or register visitors for others.
// Returns minimal fields (no email/department).
router.get(
  "/users",
  requireAuth,
  requireRole("receptie", "servicedesk", "facilitair_manager", "beheerder"),
  async (_req, res): Promise<void> => {
    const users = await db
      .select({
        id: usersTable.id,
        name: usersTable.name,
        role: usersTable.role,
      })
      .from(usersTable)
      .orderBy(asc(usersTable.name));
    res.json(users);
  },
);

export default router;
