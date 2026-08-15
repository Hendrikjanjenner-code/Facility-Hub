import app from "./app";
import { logger } from "./lib/logger";
import { ensureContractExpiryNotifications } from "./routes/contracts";

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

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // Voer direct uit bij server-start en daarna elke 24 uur.
  void runContractExpiryCheck();
  setInterval(() => void runContractExpiryCheck(), MS_PER_DAY);
});
