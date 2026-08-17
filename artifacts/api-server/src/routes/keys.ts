import { Router, type IRouter } from "express";
import {
  db,
  keysTable,
  keyDoorsTable,
  keyIssuesTable,
  keyLossReportsTable,
  usersTable,
  roomsTable,
  buildingsTable,
  ticketsTable,
  ticketCategoriesTable,
} from "@workspace/db";
import { eq, and, isNull, desc, sql, lt, inArray, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  CreateKeyBody,
  UpdateKeyBody,
  CreateKeyDoorBody,
  IssueKeyBody,
  ReportKeyLossBody,
} from "@workspace/api-zod";
import { requireAuth, requireRole } from "../lib/auth";
import { notify } from "../lib/notify";

// Sleutel- en pasbeheer: facilitair manager en beheerder beheren het register,
// de receptie verzorgt de dagelijkse uitgifte en inname.
const KEY_ROLES = ["facilitair_manager", "beheerder", "receptie"];

const router: IRouter = Router();
router.use("/keys", requireAuth, requireRole(...KEY_ROLES));
router.use("/key-doors", requireAuth, requireRole(...KEY_ROLES));

const holderAlias = alias(usersTable, "holder");
const issuerAlias = alias(usersTable, "issuer");
const reporterAlias = alias(usersTable, "reporter");

async function keySummary(id: number) {
  const [row] = await db
    .select({
      key: keysTable,
      buildingName: buildingsTable.name,
    })
    .from(keysTable)
    .leftJoin(buildingsTable, eq(keysTable.buildingId, buildingsTable.id))
    .where(eq(keysTable.id, id));
  if (!row) return null;
  const [openIssue] = await db
    .select({
      issue: keyIssuesTable,
      holderName: holderAlias.name,
    })
    .from(keyIssuesTable)
    .leftJoin(holderAlias, eq(keyIssuesTable.holderId, holderAlias.id))
    .where(and(eq(keyIssuesTable.keyId, id), isNull(keyIssuesTable.returnedAt)));
  const [{ doorCount }] = await db
    .select({ doorCount: sql<number>`count(*)::int` })
    .from(keyDoorsTable)
    .where(eq(keyDoorsTable.keyId, id));
  return {
    id: row.key.id,
    code: row.key.code,
    type: row.key.type,
    description: row.key.description,
    status: row.key.status,
    buildingId: row.key.buildingId,
    buildingName: row.buildingName,
    replacementCost: row.key.replacementCost,
    doorCount: doorCount ?? 0,
    currentHolderId: openIssue?.issue.holderId ?? null,
    currentHolderName: openIssue?.holderName ?? null,
    issuedAt: openIssue?.issue.issuedAt.toISOString() ?? null,
    dueAt: openIssue?.issue.dueAt?.toISOString() ?? null,
    createdAt: row.key.createdAt.toISOString(),
  };
}

async function keyDetail(id: number) {
  const summary = await keySummary(id);
  if (!summary) return null;
  const doors = await db
    .select({
      door: keyDoorsTable,
      roomName: roomsTable.name,
    })
    .from(keyDoorsTable)
    .leftJoin(roomsTable, eq(keyDoorsTable.roomId, roomsTable.id))
    .where(eq(keyDoorsTable.keyId, id))
    .orderBy(keyDoorsTable.id);
  const issues = await db
    .select({
      issue: keyIssuesTable,
      holderName: holderAlias.name,
      issuedByName: issuerAlias.name,
    })
    .from(keyIssuesTable)
    .leftJoin(holderAlias, eq(keyIssuesTable.holderId, holderAlias.id))
    .leftJoin(issuerAlias, eq(keyIssuesTable.issuedById, issuerAlias.id))
    .where(eq(keyIssuesTable.keyId, id))
    .orderBy(desc(keyIssuesTable.issuedAt));
  const losses = await db
    .select({
      loss: keyLossReportsTable,
      holderName: holderAlias.name,
      reportedByName: reporterAlias.name,
      ticketNumber: ticketsTable.number,
    })
    .from(keyLossReportsTable)
    .leftJoin(holderAlias, eq(keyLossReportsTable.holderId, holderAlias.id))
    .leftJoin(reporterAlias, eq(keyLossReportsTable.reportedById, reporterAlias.id))
    .leftJoin(ticketsTable, eq(keyLossReportsTable.ticketId, ticketsTable.id))
    .where(eq(keyLossReportsTable.keyId, id))
    .orderBy(desc(keyLossReportsTable.createdAt));
  return {
    key: summary,
    doors: doors.map((d) => ({
      id: d.door.id,
      keyId: d.door.keyId,
      description: d.door.description,
      roomId: d.door.roomId,
      roomName: d.roomName,
    })),
    issues: issues.map((i) => ({
      id: i.issue.id,
      keyId: i.issue.keyId,
      holderId: i.issue.holderId,
      holderName: i.holderName,
      issuedByName: i.issuedByName,
      issuedAt: i.issue.issuedAt.toISOString(),
      dueAt: i.issue.dueAt?.toISOString() ?? null,
      returnedAt: i.issue.returnedAt?.toISOString() ?? null,
      note: i.issue.note,
    })),
    lossReports: losses.map((l) => ({
      id: l.loss.id,
      keyId: l.loss.keyId,
      holderName: l.holderName,
      reportedByName: l.reportedByName,
      chargeAmount: l.loss.chargeAmount,
      note: l.loss.note,
      ticketId: l.loss.ticketId,
      ticketNumber: l.ticketNumber,
      createdAt: l.loss.createdAt.toISOString(),
    })),
  };
}

router.get("/keys", async (req, res): Promise<void> => {
  const overdueOnly = req.query.overdue === "true";
  const conditions: SQL[] = [];
  if (typeof req.query.status === "string" && req.query.status)
    conditions.push(eq(keysTable.status, req.query.status));
  if (typeof req.query.type === "string" && req.query.type)
    conditions.push(eq(keysTable.type, req.query.type));
  if (overdueOnly)
    conditions.push(
      sql`EXISTS (SELECT 1 FROM key_issues ki WHERE ki.key_id = ${keysTable.id} AND ki.returned_at IS NULL AND ki.due_at IS NOT NULL AND ki.due_at < NOW())`,
    );

  const rows = await db
    .select({
      key: keysTable,
      buildingName: buildingsTable.name,
      doorCount: sql<number>`(select count(*)::int from ${keyDoorsTable} where ${keyDoorsTable.keyId} = ${keysTable.id})`,
      currentHolderId: sql<number | null>`(select ki.holder_id from key_issues ki where ki.key_id = ${keysTable.id} and ki.returned_at is null limit 1)`,
      currentHolderName: sql<string | null>`(select u.name from key_issues ki join users u on u.id = ki.holder_id where ki.key_id = ${keysTable.id} and ki.returned_at is null limit 1)`,
      issuedAt: sql<string | null>`(select to_char(ki.issued_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') from key_issues ki where ki.key_id = ${keysTable.id} and ki.returned_at is null limit 1)`,
      dueAt: sql<string | null>`(select to_char(ki.due_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') from key_issues ki where ki.key_id = ${keysTable.id} and ki.returned_at is null limit 1)`,
    })
    .from(keysTable)
    .leftJoin(buildingsTable, eq(keysTable.buildingId, buildingsTable.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(keysTable.code);

  res.json(
    rows.map((r) => ({
      id: r.key.id,
      code: r.key.code,
      type: r.key.type,
      description: r.key.description,
      status: r.key.status,
      buildingId: r.key.buildingId,
      buildingName: r.buildingName,
      replacementCost: r.key.replacementCost,
      doorCount: r.doorCount,
      currentHolderId: r.currentHolderId,
      currentHolderName: r.currentHolderName,
      issuedAt: r.issuedAt,
      dueAt: r.dueAt,
      createdAt: r.key.createdAt.toISOString(),
    })),
  );
});

router.post("/keys", async (req, res): Promise<void> => {
  const parsed = CreateKeyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Ongeldige invoer" });
    return;
  }
  if (parsed.data.buildingId != null) {
    const [b] = await db
      .select({ id: buildingsTable.id })
      .from(buildingsTable)
      .where(eq(buildingsTable.id, parsed.data.buildingId));
    if (!b) {
      res.status(400).json({ message: "Gebouw bestaat niet" });
      return;
    }
  }
  const [existing] = await db
    .select({ id: keysTable.id })
    .from(keysTable)
    .where(eq(keysTable.code, parsed.data.code));
  if (existing) {
    res.status(409).json({ message: "Code is al in gebruik" });
    return;
  }
  const [key] = await db
    .insert(keysTable)
    .values({
      code: parsed.data.code,
      type: parsed.data.type,
      description: parsed.data.description,
      buildingId: parsed.data.buildingId ?? null,
      replacementCost: parsed.data.replacementCost ?? null,
    })
    .returning();
  res.status(201).json(await keySummary(key!.id));
});

router.get("/keys/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ message: "Ongeldig id" });
    return;
  }
  const detail = await keyDetail(id);
  if (!detail) {
    res.status(404).json({ message: "Sleutel niet gevonden" });
    return;
  }
  res.json(detail);
});

router.patch("/keys/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ message: "Ongeldig id" });
    return;
  }
  const parsed = UpdateKeyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Ongeldige invoer" });
    return;
  }
  const [key] = await db.select().from(keysTable).where(eq(keysTable.id, id));
  if (!key) {
    res.status(404).json({ message: "Sleutel niet gevonden" });
    return;
  }
  const d = parsed.data;
  if (d.status !== undefined && key.status === "uitgegeven") {
    res.status(409).json({
      message: "Neem de sleutel eerst in voordat je de status wijzigt",
    });
    return;
  }
  if (d.buildingId != null) {
    const [b] = await db
      .select({ id: buildingsTable.id })
      .from(buildingsTable)
      .where(eq(buildingsTable.id, d.buildingId));
    if (!b) {
      res.status(400).json({ message: "Gebouw bestaat niet" });
      return;
    }
  }
  await db
    .update(keysTable)
    .set({
      ...(d.description !== undefined ? { description: d.description } : {}),
      ...(d.buildingId !== undefined ? { buildingId: d.buildingId } : {}),
      ...(d.replacementCost !== undefined
        ? { replacementCost: d.replacementCost }
        : {}),
      ...(d.status !== undefined ? { status: d.status } : {}),
    })
    .where(eq(keysTable.id, id));
  res.json(await keySummary(id));
});

router.post("/keys/:id/doors", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ message: "Ongeldig id" });
    return;
  }
  const parsed = CreateKeyDoorBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Ongeldige invoer" });
    return;
  }
  const [key] = await db.select().from(keysTable).where(eq(keysTable.id, id));
  if (!key) {
    res.status(404).json({ message: "Sleutel niet gevonden" });
    return;
  }
  let roomName: string | null = null;
  if (parsed.data.roomId != null) {
    const [room] = await db
      .select({ id: roomsTable.id, name: roomsTable.name })
      .from(roomsTable)
      .where(eq(roomsTable.id, parsed.data.roomId));
    if (!room) {
      res.status(400).json({ message: "Ruimte bestaat niet" });
      return;
    }
    roomName = room.name;
  }
  const [door] = await db
    .insert(keyDoorsTable)
    .values({
      keyId: id,
      description: parsed.data.description,
      roomId: parsed.data.roomId ?? null,
    })
    .returning();
  res.status(201).json({
    id: door!.id,
    keyId: door!.keyId,
    description: door!.description,
    roomId: door!.roomId,
    roomName,
  });
});

router.delete("/key-doors/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ message: "Ongeldig id" });
    return;
  }
  const [existing] = await db
    .select({ id: keyDoorsTable.id })
    .from(keyDoorsTable)
    .where(eq(keyDoorsTable.id, id));
  if (!existing) {
    res.status(404).json({ message: "Niet gevonden" });
    return;
  }
  await db.delete(keyDoorsTable).where(eq(keyDoorsTable.id, id));
  res.status(204).end();
});

router.post("/keys/:id/issue", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ message: "Ongeldig id" });
    return;
  }
  const parsed = IssueKeyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Ongeldige invoer" });
    return;
  }
  const [key] = await db.select().from(keysTable).where(eq(keysTable.id, id));
  if (!key) {
    res.status(404).json({ message: "Sleutel niet gevonden" });
    return;
  }
  if (key.status !== "beschikbaar") {
    res.status(409).json({
      message: `Deze ${key.type} is niet beschikbaar (status: ${key.status})`,
    });
    return;
  }
  const [holder] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, parsed.data.holderId));
  if (!holder) {
    res.status(400).json({ message: "Medewerker bestaat niet" });
    return;
  }
  // Atomair: statusovergang + uitgifte in één transactie met conditionele
  // update, zodat parallelle uitgiftes niet allebei slagen. De partiële
  // unieke index op key_issues (open uitgifte per sleutel) is de vangrail.
  const issued = await db.transaction(async (tx) => {
    const updated = await tx
      .update(keysTable)
      .set({ status: "uitgegeven" })
      .where(and(eq(keysTable.id, id), eq(keysTable.status, "beschikbaar")))
      .returning({ id: keysTable.id });
    if (updated.length === 0) return false;
    await tx.insert(keyIssuesTable).values({
      keyId: id,
      holderId: holder.id,
      issuedById: req.currentUser!.id,
      dueAt: parsed.data.dueAt ? new Date(parsed.data.dueAt) : null,
      note: parsed.data.note ?? null,
    });
    return true;
  });
  if (!issued) {
    res.status(409).json({ message: "Deze sleutel is zojuist al uitgegeven" });
    return;
  }
  await notify(
    holder.id,
    "Sleutel uitgegeven",
    `${key.type === "pas" ? "Pas" : "Sleutel"} ${key.code} (${key.description}) is op jouw naam geregistreerd.`,
    "key",
  );
  res.status(201).json(await keyDetail(id));
});

router.post("/keys/:id/return", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ message: "Ongeldig id" });
    return;
  }
  const [key] = await db.select().from(keysTable).where(eq(keysTable.id, id));
  if (!key) {
    res.status(404).json({ message: "Sleutel niet gevonden" });
    return;
  }
  const returned = await db.transaction(async (tx) => {
    const closed = await tx
      .update(keyIssuesTable)
      .set({ returnedAt: new Date() })
      .where(and(eq(keyIssuesTable.keyId, id), isNull(keyIssuesTable.returnedAt)))
      .returning({ id: keyIssuesTable.id });
    if (closed.length === 0) return false;
    await tx
      .update(keysTable)
      .set({ status: "beschikbaar" })
      .where(eq(keysTable.id, id));
    return true;
  });
  if (!returned) {
    res.status(409).json({ message: "Deze sleutel is niet uitgegeven" });
    return;
  }
  res.json(await keyDetail(id));
});

const SLA_HOURS: Record<string, number> = { P1: 4, P2: 8, P3: 24, P4: 72 };

router.post("/keys/:id/loss", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ message: "Ongeldig id" });
    return;
  }
  const parsed = ReportKeyLossBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Ongeldige invoer" });
    return;
  }
  const [key] = await db.select().from(keysTable).where(eq(keysTable.id, id));
  if (!key) {
    res.status(404).json({ message: "Sleutel niet gevonden" });
    return;
  }
  if (key.status === "vermist") {
    res.status(409).json({ message: "Deze sleutel is al als vermist gemeld" });
    return;
  }
  const chargeAmount =
    parsed.data.chargeAmount ?? key.replacementCost ?? 0;
  const user = req.currentUser!;

  const categories = await db.select().from(ticketCategoriesTable);
  const category =
    categories.find((c) => c.name === "Overig") ??
    categories.find((c) => c.name === "Technische storing") ??
    categories[0];
  const [routee] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.role, "servicedesk"))
    .limit(1);

  // Atomair: statusovergang, ticket, verliesrapport en sluiting van de open
  // uitgifte in één transactie. De conditionele update voorkomt dubbele
  // verliesprocedures bij gelijktijdige verzoeken.
  const result = await db.transaction(async (tx) => {
    const updated = await tx
      .update(keysTable)
      .set({ status: "vermist" })
      .where(and(eq(keysTable.id, id), sql`${keysTable.status} <> 'vermist'`))
      .returning({ id: keysTable.id });
    if (updated.length === 0) return null;

    const [openIssue] = await tx
      .select({ issue: keyIssuesTable, holderName: usersTable.name })
      .from(keyIssuesTable)
      .leftJoin(usersTable, eq(keyIssuesTable.holderId, usersTable.id))
      .where(and(eq(keyIssuesTable.keyId, id), isNull(keyIssuesTable.returnedAt)));

    let ticketId: number | null = null;
    let ticketNumber: string | null = null;
    if (category) {
      const priority = "P3";
      const description = [
        `Verliesprocedure ${key.type} ${key.code} (${key.description}).`,
        openIssue?.holderName ? `Laatste houder: ${openIssue.holderName}.` : null,
        `Kostenverrekening: € ${chargeAmount.toLocaleString("nl-NL")}.`,
        parsed.data.note ? `Toelichting: ${parsed.data.note}` : null,
        "Actie: cilinders/toegangsrechten controleren en zo nodig vervangen of blokkeren.",
      ]
        .filter(Boolean)
        .join("\n");
      // Uniek nummer afgeleid van het ticket-id (race-vrij, i.t.t. count+1)
      const [ticket] = await tx
        .insert(ticketsTable)
        .values({
          number: `GC-TMP-${crypto.randomUUID()}`,
          title: `[Sleutelbeheer] ${key.type === "pas" ? "Pas" : "Sleutel"} ${key.code} vermist`,
          description,
          priority,
          status: "nieuw",
          categoryId: category.id,
          reporterId: user.id,
          assigneeId: routee?.id ?? null,
          slaDueAt: new Date(Date.now() + (SLA_HOURS[priority] ?? 24) * 3600000),
        })
        .returning();
      ticketNumber = `GC-${new Date().getFullYear()}-${1000 + ticket!.id}`;
      await tx
        .update(ticketsTable)
        .set({ number: ticketNumber })
        .where(eq(ticketsTable.id, ticket!.id));
      ticketId = ticket!.id;
    }

    await tx.insert(keyLossReportsTable).values({
      keyId: id,
      reportedById: user.id,
      holderId: openIssue?.issue.holderId ?? null,
      chargeAmount,
      note: parsed.data.note ?? null,
      ticketId,
    });
    if (openIssue) {
      await tx
        .update(keyIssuesTable)
        .set({ returnedAt: new Date() })
        .where(eq(keyIssuesTable.id, openIssue.issue.id));
    }
    return { openIssue, ticketNumber };
  });

  if (!result) {
    res.status(409).json({ message: "Deze sleutel is al als vermist gemeld" });
    return;
  }
  const { openIssue, ticketNumber } = result;

  if (routee && ticketNumber) {
    await notify(
      routee.id,
      "Nieuwe melding: vermiste sleutel",
      `${ticketNumber}: ${key.type} ${key.code} is als vermist gemeld.`,
      "ticket",
    );
  }
  if (openIssue?.issue.holderId) {
    await notify(
      openIssue.issue.holderId,
      "Sleutel als vermist gemeld",
      `${key.type === "pas" ? "Pas" : "Sleutel"} ${key.code} is als vermist geregistreerd. Kostenverrekening: € ${chargeAmount.toLocaleString("nl-NL")}.`,
      "key",
    );
  }
  res.status(201).json(await keyDetail(id));
});

/**
 * Controleert alle te late uitgiftes en verstuurt herinneringen.
 * Atomisch: de UPDATE claimt eligible rijen in één DB-roundtrip zodat
 * gelijktijdige aanroepen nooit dezelfde uitgifte dubbel verwerken.
 * Cooldown: 23 uur per uitgifte via last_notified_at.
 */
export async function checkOverdueKeys(): Promise<number> {
  const now = new Date();
  const cooldownCutoff = new Date(now.getTime() - 23 * 60 * 60 * 1000);

  // Atomisch claimen: UPDATE met WHERE en RETURNING zodat elke rij slechts
  // door één worker tegelijk wordt verwerkt.
  const claimed = await db
    .update(keyIssuesTable)
    .set({ lastNotifiedAt: now })
    .where(
      and(
        isNull(keyIssuesTable.returnedAt),
        sql`${keyIssuesTable.dueAt} IS NOT NULL`,
        lt(keyIssuesTable.dueAt, now),
        sql`(${keyIssuesTable.lastNotifiedAt} IS NULL OR ${keyIssuesTable.lastNotifiedAt} < ${cooldownCutoff})`,
      ),
    )
    .returning({
      issueId: keyIssuesTable.id,
      holderId: keyIssuesTable.holderId,
      dueAt: keyIssuesTable.dueAt,
      keyId: keyIssuesTable.keyId,
    });

  if (claimed.length === 0) return 0;

  // Laad sleutel- en houdergegevens voor de geclaimed rijen.
  const keyIds = [...new Set(claimed.map((c) => c.keyId))];
  const holderIds = [...new Set(claimed.map((c) => c.holderId).filter((id): id is number => id !== null))];

  const [keyRows, holderRows, receptionUsers] = await Promise.all([
    db.select().from(keysTable).where(inArray(keysTable.id, keyIds)),
    holderIds.length
      ? db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(inArray(usersTable.id, holderIds))
      : Promise.resolve([]),
    db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.role, "receptie")),
  ]);

  const keyById = new Map(keyRows.map((k) => [k.id, k]));
  const holderById = new Map(holderRows.map((h) => [h.id, h]));

  let notifiedCount = 0;
  for (const row of claimed) {
    const key = keyById.get(row.keyId);
    if (!key) continue;
    const label = `${key.type === "pas" ? "Pas" : "Sleutel"} ${key.code} (${key.description})`;
    const link = `/sleutelbeheer/${key.id}`;
    const dueStr = row.dueAt!.toLocaleDateString("nl-NL");
    const holderName = row.holderId ? holderById.get(row.holderId)?.name ?? null : null;

    try {
      if (row.holderId) {
        await notify(
          row.holderId,
          "Inleverdatum verstreken",
          `${label} had uiterlijk ${dueStr} ingeleverd moeten worden.`,
          "key",
          link,
        );
      }
      for (const u of receptionUsers) {
        await notify(
          u.id,
          "Te laat: inleverdatum verstreken",
          `${label} is niet op tijd ingeleverd${holderName ? ` door ${holderName}` : ""}.`,
          "key",
          link,
        );
      }
      notifiedCount++;
    } catch (err) {
      // Reset lastNotifiedAt so this row is retried in the next check cycle
      // rather than being suppressed for 23 hours.
      console.error(`[checkOverdueKeys] notificatie mislukt voor uitgifte ${row.issueId}:`, err);
      await db
        .update(keyIssuesTable)
        .set({ lastNotifiedAt: null })
        .where(eq(keyIssuesTable.id, row.issueId))
        .catch((resetErr) => {
          console.error(`[checkOverdueKeys] reset lastNotifiedAt mislukt voor uitgifte ${row.issueId}:`, resetErr);
        });
    }
  }

  return notifiedCount;
}

// POST /keys/check-overdue – manuele trigger (bv. voor tests of noodgevallen).
// De dagelijkse check draait automatisch via de server-side interval in index.ts.
router.post("/keys/check-overdue", requireRole("receptie", "facilitair_manager", "beheerder"), async (_req, res): Promise<void> => {
  const notified = await checkOverdueKeys();
  res.json({ notified });
});

export default router;
