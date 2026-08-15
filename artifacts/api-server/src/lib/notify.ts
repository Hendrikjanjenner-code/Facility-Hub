import { db, notificationsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export async function notify(
  userId: number,
  title: string,
  body: string,
  kind: string,
  linkPath?: string | null,
): Promise<void> {
  await db.insert(notificationsTable).values({
    userId,
    title,
    body,
    kind,
    linkPath: linkPath ?? null,
  });
}

export async function notifyRole(
  role: string,
  title: string,
  body: string,
  kind: string,
  linkPath?: string | null,
): Promise<void> {
  const users = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.role, role));
  for (const u of users) {
    await notify(u.id, title, body, kind, linkPath);
  }
}
