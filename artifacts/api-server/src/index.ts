import pinoHttp from "pino-http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { configureDatabase } from "@workspace/db";
import { createApp } from "./app";
import { logger } from "./lib/logger";
import { clerkProxyMiddleware } from "./middlewares/clerkProxyMiddleware";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}
configureDatabase(databaseUrl);

const clerkPublishableKey = process.env.VITE_GOFL_CLERK_PUBLISHABLE_KEY;
const clerkSecretKey = process.env.GOFL_CLERK_SECRET_KEY;
const hostEmails = process.env.GOFL_HOST_EMAILS
  ?.split(",")
  .map((email) => email.trim())
  .filter(Boolean);

if (!clerkPublishableKey || !clerkSecretKey || !hostEmails?.length) {
  throw new Error(
    "VITE_GOFL_CLERK_PUBLISHABLE_KEY, GOFL_CLERK_SECRET_KEY, and GOFL_HOST_EMAILS must be configured.",
  );
}

const staticDir =
  process.env.SERVE_WEB_DIST === "true"
    ? path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        "../../gathering-fallen-live/dist/public",
      )
    : undefined;

const app = createApp({
  getClerkKeys: () => ({
    publishableKey: clerkPublishableKey,
    secretKey: clerkSecretKey,
  }),
  ...(staticDir ? { staticDir } : {}),
  clerkProxyMiddleware: clerkProxyMiddleware(),
  requestLogger: pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
});

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

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
