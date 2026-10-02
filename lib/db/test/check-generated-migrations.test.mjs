import assert from "node:assert/strict";
import {
  mkdtemp,
  readdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { checkGeneratedMigrations } from "../scripts/check-generated-migrations.mjs";

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const migrationsDirectory = path.join(packageRoot, "migrations");

async function captureTree(directory) {
  const contents = [];

  async function visit(currentDirectory, prefix = "") {
    const entries = await readdir(currentDirectory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      const relativePath = path.join(prefix, entry.name);
      const absolutePath = path.join(currentDirectory, entry.name);
      if (entry.isDirectory()) {
        await visit(absolutePath, relativePath);
      } else {
        contents.push([relativePath, await readFile(absolutePath, "base64")]);
      }
    }
  }

  await visit(directory);
  return contents;
}

test("accepts the checked-in schema without modifying migration history", async () => {
  const before = await captureTree(migrationsDirectory);
  const result = await checkGeneratedMigrations();
  const after = await captureTree(migrationsDirectory);

  assert.deepEqual(result.generatedMigrations, []);
  assert.deepEqual(after, before);
});

test("detects a generated migration without changing checked-in migration history", async () => {
  const temporaryDirectory = await mkdtemp(
    path.join(os.tmpdir(), "drizzle-generation-test-"),
  );
  const schemaPath = path.join(temporaryDirectory, "schema.ts");

  try {
    await writeFile(
      schemaPath,
      [
        'import { pgTable, serial, text } from "drizzle-orm/pg-core";',
        `export * from ${JSON.stringify(
          path.join(packageRoot, "src/schema/sessions.ts"),
        )};`,
        `export * from ${JSON.stringify(
          path.join(packageRoot, "src/schema/submissions.ts"),
        )};`,
        'export const validationProbe = pgTable("validation_probe", {',
        '  id: serial("id").primaryKey(),',
        '  label: text("label").notNull(),',
        "});",
        "",
      ].join("\n"),
    );
    await symlink(
      path.join(packageRoot, "node_modules"),
      path.join(temporaryDirectory, "node_modules"),
      "dir",
    );
    const before = await captureTree(migrationsDirectory);
    const result = await checkGeneratedMigrations({
      schemaPath,
      environment: {
        ...process.env,
        DATABASE_URL: "postgres://unused.invalid/database",
        RENDER_DATABASE_URL: "postgres://unused.invalid/production",
        PGHOST: "unused.invalid",
      },
    });
    const after = await captureTree(migrationsDirectory);

    assert.ok(result.generatedMigrations.length > 0);
    assert.deepEqual(after, before);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test("fails closed when generation needs an interactive choice", async () => {
  const temporaryDirectory = await mkdtemp(
    path.join(os.tmpdir(), "drizzle-generation-prompt-test-"),
  );
  const schemaPath = path.join(temporaryDirectory, "schema.ts");

  try {
    await writeFile(
      schemaPath,
      [
        'import { pgTable, serial, text } from "drizzle-orm/pg-core";',
        'export const validationProbe = pgTable("validation_probe", {',
        '  id: serial("id").primaryKey(),',
        '  label: text("label").notNull(),',
        "});",
        "",
      ].join("\n"),
    );
    await symlink(
      path.join(packageRoot, "node_modules"),
      path.join(temporaryDirectory, "node_modules"),
      "dir",
    );

    await assert.rejects(
      checkGeneratedMigrations({ schemaPath }),
      /Drizzle migration generation failed[\s\S]*Interactive prompts require a TTY/,
    );
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});
