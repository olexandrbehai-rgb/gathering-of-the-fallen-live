import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { assertAppliedMigrationsUnchanged } from "./migration-integrity.mjs";

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const migrationsFolder = path.join(packageRoot, "migrations");
const connectionString = process.env.RENDER_DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "Set the RENDER_DATABASE_URL secret to the external Render PostgreSQL URL before running production migrations.",
  );
}

let connectionUrl;
try {
  connectionUrl = new URL(connectionString);
} catch {
  throw new Error(
    "RENDER_DATABASE_URL must be a valid external Render PostgreSQL URL.",
  );
}

if (
  !["postgres:", "postgresql:"].includes(connectionUrl.protocol) ||
  !connectionUrl.hostname.toLowerCase().endsWith(".render.com")
) {
  throw new Error(
    "RENDER_DATABASE_URL must point to an external Render PostgreSQL endpoint.",
  );
}

const sslMode = connectionUrl.searchParams.get("sslmode")?.toLowerCase();
if (!["require", "verify-ca", "verify-full"].includes(sslMode)) {
  connectionUrl.searchParams.set("sslmode", "require");
}

const pool = new Pool({
  connectionString: connectionUrl.toString(),
  max: 1,
  connectionTimeoutMillis: 10_000,
});

try {
  await assertAppliedMigrationsUnchanged({ pool, migrationsFolder });
} finally {
  await pool.end();
}

const result = spawnSync(
  "drizzle-kit",
  ["migrate", "--config", "./drizzle.production.config.ts"],
  { cwd: packageRoot, stdio: "inherit" },
);

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
