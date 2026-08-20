import app from "./app";
import { logger } from "./lib/logger";
import { pool } from "@workspace/db";
import { ensureContractExpiryNotifications, processEmailQueue } from "./routes/contracts";
import { cleanupOrphanedDocumentUploads } from "./lib/orphanCleanup";
import { checkOverdueKeys } from "./routes/keys";
import { checkSlechteConditieZonderMjop } from "./routes/mjop";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

async function runContractExpiryCheck() {
  try {
    logger.info("Dagelijkse contract-vervalcontrole gestart");
    await ensureContractExpiryNotifications();
    logger.info("Dagelijkse contract-vervalcontrole afgerond");
  } catch (err) {
    logger.error({ err }, "Fout bij dagelijkse contract-vervalcontrole");
  }
}

async function runOrphanCleanup() {
  try {
    await cleanupOrphanedDocumentUploads();
  } catch (err) {
    logger.error({ err }, "Fout bij wees-upload opruimroutine");
  }
}

async function runSlechteConditieCheck() {
  try {
    logger.info("Dagelijkse slechte-conditie-check gestart");
    await checkSlechteConditieZonderMjop();
    logger.info("Dagelijkse slechte-conditie-check afgerond");
  } catch (err) {
    logger.error({ err }, "Fout bij slechte-conditie-check");
  }
}

async function runOverdueKeysCheck() {
  try {
    const notified = await checkOverdueKeys();
    if (notified > 0) logger.info({ notified }, "Dagelijkse sleutelherinnering verstuurd");
  } catch (err) {
    logger.error({ err }, "Fout bij dagelijkse sleutelherinnering");
  }
}

// Idempotente startup-migraties: voeg ontbrekende kolommen toe aan bestaande databases.
try {
  await pool.query(
    `ALTER TABLE rooms ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
  );
} catch (err) {
  logger.warn({ err }, "Startup-migratie rooms.updated_at mislukt; doorgaan");
}
try {
  await pool.query(
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_preference TEXT NOT NULL DEFAULT 'all'`,
  );
} catch (err) {
  logger.warn({ err }, "Startup-migratie users.notification_preference mislukt; doorgaan");
}
try {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS mjop_taak_geschiedenis (
      id SERIAL PRIMARY KEY,
      taak_id INTEGER NOT NULL REFERENCES mjop_taken(id) ON DELETE CASCADE,
      oud_status TEXT NOT NULL,
      nieuw_status TEXT NOT NULL,
      gewijzigd_door INTEGER REFERENCES users(id),
      ticket_id INTEGER REFERENCES tickets(id),
      reden TEXT,
      gewijzigd_op TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
} catch (err) {
  logger.warn({ err }, "Startup-migratie mjop_taak_geschiedenis mislukt; doorgaan");
}

// Voeg last_notified_at toe aan key_issues voor de overdue-herinnerings-cooldown.
try {
  await pool.query(
    `ALTER TABLE key_issues ADD COLUMN IF NOT EXISTS last_notified_at TIMESTAMPTZ`,
  );
} catch (err) {
  logger.warn({ err }, "Startup-migratie key_issues.last_notified_at mislukt; doorgaan");
}

// E-mailwachtrij (outbox-patroon): tabel aanmaken als die nog niet bestaat.
try {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS email_queue (
      id              SERIAL PRIMARY KEY,
      reference_key   TEXT        NOT NULL UNIQUE,
      to_email        TEXT        NOT NULL,
      to_name         TEXT        NOT NULL,
      contract_name   TEXT        NOT NULL,
      end_date        TEXT        NOT NULL,
      supplier_name   TEXT        NOT NULL,
      days_until_end  INTEGER     NOT NULL,
      contracts_url   TEXT        NOT NULL,
      attempts        INTEGER     NOT NULL DEFAULT 0,
      last_attempt_at TIMESTAMPTZ,
      sent_at         TIMESTAMPTZ,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
} catch (err) {
  logger.warn({ err }, "Startup-migratie email_queue mislukt; doorgaan");
}

// Contactaanvragen vanaf de marketingsite: tabel aanmaken als die nog niet bestaat.
try {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS contact_requests (
      id           SERIAL PRIMARY KEY,
      name         TEXT NOT NULL,
      email        TEXT NOT NULL,
      organization TEXT,
      message      TEXT NOT NULL,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
} catch (err) {
  logger.warn({ err }, "Startup-migratie contact_requests mislukt; doorgaan");
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // Voer direct uit bij server-start en daarna elke 24 uur.
  void runContractExpiryCheck();
  setInterval(() => void runContractExpiryCheck(), MS_PER_DAY);

  // Opruimen van wees-uploads: direct bij start en daarna elke 24 uur.
  void runOrphanCleanup();
  setInterval(() => void runOrphanCleanup(), MS_PER_DAY);

  // Dagelijkse check: bouwdelen met slechte conditie zonder MJOP-opvolging.
  void runSlechteConditieCheck();
  setInterval(() => void runSlechteConditieCheck(), MS_PER_DAY);

  // Dagelijkse check voor te late sleuteluitgiftes met inleverdatum.
  void runOverdueKeysCheck();
  setInterval(() => void runOverdueKeysCheck(), MS_PER_DAY);

  // E-mailwachtrij: direct verwerken bij start en daarna elk uur,
  // zodat de exponentiële backoff (1u → 2u → 4u) daadwerkelijk gehaald kan worden.
  void (async () => {
    try { await processEmailQueue(); } catch (err) { logger.error({ err }, "Fout bij e-mailwachtrij verwerking"); }
  })();
  setInterval(() => {
    void (async () => {
      try { await processEmailQueue(); } catch (err) { logger.error({ err }, "Fout bij e-mailwachtrij verwerking"); }
    })();
  }, 60 * 60 * 1000); // elk uur
});
