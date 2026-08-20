import { Router, type IRouter } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { desc } from "drizzle-orm";
import { db, contactRequestsTable } from "@workspace/db";
import { requireAuth, requireRole } from "../lib/auth";

const router: IRouter = Router();

const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip ?? ""),
  message: { message: "Te veel aanvragen. Probeer het later opnieuw." },
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** POST /api/contact-requests — publiek contact-/interesseformulier van de marketingsite */
router.post("/contact-requests", contactLimiter, async (req, res): Promise<void> => {
  const { name, email, organization, message } = (req.body ?? {}) as {
    name?: unknown;
    email?: unknown;
    organization?: unknown;
    message?: unknown;
  };

  const cleanName = typeof name === "string" ? name.trim() : "";
  const cleanEmail = typeof email === "string" ? email.trim() : "";
  const cleanMessage = typeof message === "string" ? message.trim() : "";
  const cleanOrg =
    typeof organization === "string" && organization.trim().length > 0
      ? organization.trim()
      : null;

  if (
    cleanName.length === 0 ||
    cleanName.length > 200 ||
    cleanEmail.length === 0 ||
    cleanEmail.length > 320 ||
    !EMAIL_RE.test(cleanEmail) ||
    cleanMessage.length === 0 ||
    cleanMessage.length > 5000 ||
    (cleanOrg !== null && cleanOrg.length > 200)
  ) {
    res.status(400).json({ message: "Ongeldige invoer: controleer naam, e-mail en bericht" });
    return;
  }

  await db.insert(contactRequestsTable).values({
    name: cleanName,
    email: cleanEmail,
    organization: cleanOrg,
    message: cleanMessage,
  });

  res.status(201).json({ message: "Bedankt! We nemen zo snel mogelijk contact op." });
});

/** GET /api/contact-requests — alleen beheerder/facilitair manager */
router.get(
  "/contact-requests",
  requireAuth,
  requireRole("beheerder", "facilitair_manager"),
  async (_req, res): Promise<void> => {
    const rows = await db
      .select()
      .from(contactRequestsTable)
      .orderBy(desc(contactRequestsTable.createdAt));
    res.json(
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        email: r.email,
        organization: r.organization,
        message: r.message,
        createdAt: r.createdAt.toISOString(),
      })),
    );
  },
);

export default router;
