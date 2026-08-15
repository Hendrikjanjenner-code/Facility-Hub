import type { Request, Response, NextFunction } from "express";
import { db, usersTable, type User } from "@workspace/db";
import { eq } from "drizzle-orm";

export const SESSION_COOKIE = "gc_session";

declare global {
  namespace Express {
    interface Request {
      currentUser?: User;
    }
  }
}

export function toPublicUser(u: User) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    department: u.department,
    avatarColor: u.avatarColor,
  };
}

export async function loadUser(req: Request): Promise<User | null> {
  const raw = req.signedCookies?.[SESSION_COOKIE];
  const id = Number(raw);
  if (!raw || Number.isNaN(id)) return null;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  return user ?? null;
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const user = await loadUser(req);
  if (!user) {
    res.status(401).json({ message: "Niet ingelogd" });
    return;
  }
  req.currentUser = user;
  next();
}

export const TICKET_MANAGER_ROLES = [
  "servicedesk",
  "facilitair_manager",
  "beheerder",
];

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.currentUser;
    if (!user || !roles.includes(user.role)) {
      res.status(403).json({ message: "Geen toegang voor deze rol" });
      return;
    }
    next();
  };
}
