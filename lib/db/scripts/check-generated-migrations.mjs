import {
  cp,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

function withoutDatabaseEnvironment(environment) {
  const isolatedEnvironment = { ...environment };

  for (const key of Object.keys(isolatedEnvironment)) {
    if (
      key === "DATABASE_URL" ||
      key === "RENDER_DATABASE_URL" ||
      key.startsWith("PG")
    ) {
      delete isolatedEnvironment[key];
    }
  }

  return isolatedEnvironment;
}

async function readJournalEntries(migrationsDirectory) {
  const journalPath = path.join(migrationsDirectory, "meta", "_journal.json");
  const journal = JSON.parse(await readFile(journalPath, "utf8"));
  return journal.entries;
}

async function listMigrationSql(migrationsDirectory) {
  const entries = await readdir(migrationsDirectory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort();
}

export async function checkGeneratedMigrations({
  schemaPath = path.join(packageRoot, "src/schema/index.ts"),
  migrationsDirectory = path.join(packageRoot, "migrations"),
  environment = process.env,
} = {}) {
  const temporaryDirectory = await mkdtemp(
    path.join(os.tmpdir(), "drizzle-generation-check-"),
  );
  const isolatedMigrationsDirectory = path.join(
    temporaryDirectory,
    "migrations",
  );

  try {
    await cp(migrationsDirectory, isolatedMigrationsDirectory, {
      recursive: true,
    });

    const configPath = path.join(temporaryDirectory, "drizzle.config.ts");
    await writeFile(
      configPath,
      [
        "export default {",
        `  schema: ${JSON.stringify(path.resolve(schemaPath))},`,
        '  dialect: "postgresql",',
        '  out: "./migrations",',
        "};",
        "",
      ].join("\n"),
    );

    const initialJournalEntries = await readJournalEntries(
      isolatedMigrationsDirectory,
    );
    const initialSqlFiles = await listMigrationSql(isolatedMigrationsDirectory);
    const drizzleKitPath = path.join(
      packageRoot,
      "node_modules/drizzle-kit/bin.cjs",
    );
    const generation = spawnSync(
      process.execPath,
      [drizzleKitPath, "generate", "--config", configPath],
      {
        cwd: temporaryDirectory,
        encoding: "utf8",
        env: withoutDatabaseEnvironment(environment),
      },
    );

    if (generation.error) {
      throw new Error(
        `Could not run Drizzle migration generation: ${generation.error.message}`,
      );
    }
    const commandOutput = [generation.stdout?.trim(), generation.stderr?.trim()]
      .filter(Boolean)
      .join("\n");
    if (generation.status !== 0 || /(?:^|\n)Error:/.test(commandOutput)) {
      throw new Error(
        [
          "Drizzle migration generation failed in an isolated temporary directory.",
          commandOutput,
        ]
          .filter(Boolean)
          .join("\n"),
      );
    }

    const finalJournalEntries = await readJournalEntries(
      isolatedMigrationsDirectory,
    );
    const finalSqlFiles = await listMigrationSql(isolatedMigrationsDirectory);
    const initialTags = new Set(
      initialJournalEntries.map((entry) => entry.tag),
    );
    const generatedJournalTags = finalJournalEntries
      .filter((entry) => !initialTags.has(entry.tag))
      .map((entry) => entry.tag);
    const initialSqlSet = new Set(initialSqlFiles);
    const generatedSqlFiles = finalSqlFiles.filter(
      (file) => !initialSqlSet.has(file),
    );

    return {
      generatedMigrations: [
        ...new Set([...generatedJournalTags, ...generatedSqlFiles]),
      ],
      output: commandOutput,
    };
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const { generatedMigrations, output } = await checkGeneratedMigrations();
    if (output) console.log(output);

    if (generatedMigrations.length > 0) {
      console.error(
        [
          "Unexpected Drizzle migration(s) were generated from the checked-in schema and snapshot:",
          ...generatedMigrations.map((migration) => `  - ${migration}`),
          "Review the schema and snapshot. If this change is intentional, generate and review the migration, snapshot, and journal, then commit them together.",
        ].join("\n"),
      );
      process.exitCode = 1;
    } else {
      console.log(
        "Drizzle generated no unreviewed migration from the checked-in schema and snapshot.",
      );
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
