import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

const migrationSchema = "drizzle";
const migrationTable = "__drizzle_migrations";

/**
 * Refuse to run migrations if any database-applied migration no longer matches
 * its checked-in SQL file.
 */
export async function assertAppliedMigrationsUnchanged({
  pool,
  migrationsFolder,
}) {
  const table = await pool.query("SELECT to_regclass($1) AS table_name", [
    `${migrationSchema}.${migrationTable}`,
  ]);

  // A new database has no Drizzle journal yet, so there are no applied hashes
  // to validate. Drizzle Kit will create the table when it applies migrations.
  if (!table.rows[0]?.table_name) return;

  let journal;
  try {
    journal = JSON.parse(
      await readFile(
        path.join(migrationsFolder, "meta", "_journal.json"),
        "utf8",
      ),
    );
  } catch (error) {
    throw new Error(
      `Could not read the checked-in Drizzle migration journal: ${error.message}`,
      { cause: error },
    );
  }

  if (!Array.isArray(journal.entries)) {
    throw new Error(
      "The checked-in Drizzle migration journal has no entries list; refusing to run production migrations.",
    );
  }

  const entriesByTimestamp = new Map();
  for (const entry of journal.entries) {
    const timestamp = String(entry.when);
    const matches = entriesByTimestamp.get(timestamp) ?? [];
    matches.push(entry);
    entriesByTimestamp.set(timestamp, matches);
  }

  const applied = await pool.query(
    `SELECT hash, created_at
     FROM ${migrationSchema}.${migrationTable}
     ORDER BY created_at`,
  );

  for (const migration of applied.rows) {
    const timestamp = String(migration.created_at);
    const matches = entriesByTimestamp.get(timestamp) ?? [];
    if (matches.length !== 1) {
      throw new Error(
        `The database records an applied Drizzle migration at timestamp ${timestamp}, but the checked-in journal does not identify exactly one matching migration; refusing to run production migrations.`,
      );
    }

    const { tag } = matches[0];
    const migrationPath = path.join(migrationsFolder, `${tag}.sql`);
    let sql;
    try {
      sql = await readFile(migrationPath);
    } catch (error) {
      if (error.code === "ENOENT") {
        throw new Error(
          `Applied migration "${tag}" is missing from ${migrationPath}; restore the checked-in SQL before running production migrations.`,
          { cause: error },
        );
      }
      throw error;
    }

    const checkedInHash = createHash("sha256").update(sql).digest("hex");
    if (migration.hash !== checkedInHash) {
      throw new Error(
        `Applied migration "${tag}" has changed: its checked-in SQL no longer matches the hash recorded in PostgreSQL. Restore the original migration file before running production migrations.`,
      );
    }
  }
}
