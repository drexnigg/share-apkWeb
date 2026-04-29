import app from "./app";
import { logger } from "./lib/logger";
import { ensureDefaultAdmin } from "./lib/storage";

const rawPort = process.env["PORT"] ?? "8080";
const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const admin = ensureDefaultAdmin();
logger.info(
  { adminUsername: admin.username },
  "Default admin ensured (change the password from the admin panel after first login)",
);

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
