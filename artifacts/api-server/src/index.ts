import app from "./app";
import { logger } from "./lib/logger";
import { pool } from "@workspace/db";
import { ensureContractExpiryNotifications } from "./routes/contracts";
import { cleanupOrphanedDocumentUploads } from "./lib/orphanCleanup";
import { checkOverdueKeys } from "./routes/keys";

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

async function runOverdueKeysCheck() {
  try {
    const notified = await checkOverdueKeys();
    if (notified > 0) logger.info({ notified }, "Dagelijkse sleutelherinnering verstuurd");
  } catch (err) {
    logger.error({ err }, "Fout bij dagelijkse sleutelherinnering");
  }
}

// Idempotente startup-migratie: voeg updated_at toe aan rooms als die ontbreekt.
// Nodig voor bestaande databases die vóór dit schema-veld zijn aangemaakt.
try {
  await pool.query(
    `ALTER TABLE rooms ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
  );
} catch (err) {
  logger.warn({ err }, "Startup-migratie rooms.updated_at mislukt; doorgaan");
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

  // Dagelijkse check voor te late sleuteluitgiftes met inleverdatum.
  void runOverdueKeysCheck();
  setInterval(() => void runOverdueKeysCheck(), MS_PER_DAY);
});
