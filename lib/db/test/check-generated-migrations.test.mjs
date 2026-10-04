import assert from "node:assert/strict";
import {
  cp,
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
const renamedUniqueIndexFixture = JSON.parse(
  await readFile(
    new URL("./fixtures/renamed-unique-index.json", import.meta.url),
    "utf8",
  ),
);
const renamedForeignKeyFixture = JSON.parse(
  await readFile(
    new URL("./fixtures/renamed-foreign-key.json", import.meta.url),
    "utf8",
  ),
);
const changedUniqueIndexFixture = JSON.parse(
  await readFile(
    new URL("./fixtures/changed-unique-index.json", import.meta.url),
    "utf8",
  ),
);
const changedUniqueIndexUniquenessFixture = JSON.parse(
  await readFile(
    new URL("./fixtures/changed-unique-index-uniqueness.json", import.meta.url),
    "utf8",
  ),
);

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

test("detects a renamed existing unique index without changing migration history", async () => {
  const temporaryDirectory = await mkdtemp(
    path.join(os.tmpdir(), "drizzle-unique-index-rename-test-"),
  );
  const schemaDirectory = path.join(temporaryDirectory, "schema");
  const schemaPath = path.join(schemaDirectory, "index.ts");

  try {
    await cp(path.join(packageRoot, "src/schema"), schemaDirectory, {
      recursive: true,
    });

    const fixtureSchemaPath = path.join(
      schemaDirectory,
      renamedUniqueIndexFixture.schemaFile,
    );
    const originalSchema = await readFile(fixtureSchemaPath, "utf8");
    const originalIndex = `uniqueIndex("${renamedUniqueIndexFixture.originalName}")`;
    assert.equal(originalSchema.split(originalIndex).length - 1, 1);
    await writeFile(
      fixtureSchemaPath,
      originalSchema.replace(
        originalIndex,
        `uniqueIndex("${renamedUniqueIndexFixture.renamedName}")`,
      ),
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

test("detects a renamed existing foreign key without changing migration history", async () => {
  const temporaryDirectory = await mkdtemp(
    path.join(os.tmpdir(), "drizzle-foreign-key-rename-test-"),
  );
  const schemaDirectory = path.join(temporaryDirectory, "schema");
  const schemaPath = path.join(schemaDirectory, "index.ts");

  try {
    await cp(path.join(packageRoot, "src/schema"), schemaDirectory, {
      recursive: true,
    });

    const fixtureSchemaPath = path.join(
      schemaDirectory,
      renamedForeignKeyFixture.schemaFile,
    );
    const originalSchema = await readFile(fixtureSchemaPath, "utf8");
    const originalDefinition = `name: "${renamedForeignKeyFixture.originalName}"`;
    assert.equal(originalSchema.split(originalDefinition).length - 1, 1);
    await writeFile(
      fixtureSchemaPath,
      originalSchema.replace(
        originalDefinition,
        `name: "${renamedForeignKeyFixture.renamedName}"`,
      ),
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

test("detects changed columns on an existing unique index without changing migration history", async () => {
  const temporaryDirectory = await mkdtemp(
    path.join(os.tmpdir(), "drizzle-unique-index-definition-test-"),
  );
  const schemaDirectory = path.join(temporaryDirectory, "schema");
  const schemaPath = path.join(schemaDirectory, "index.ts");

  try {
    await cp(path.join(packageRoot, "src/schema"), schemaDirectory, {
      recursive: true,
    });

    const fixtureSchemaPath = path.join(
      schemaDirectory,
      changedUniqueIndexFixture.schemaFile,
    );
    const originalSchema = await readFile(fixtureSchemaPath, "utf8");
    const originalDefinition = `uniqueIndex("${changedUniqueIndexFixture.indexName}").on(table.${changedUniqueIndexFixture.originalColumn})`;
    const changedDefinition = `uniqueIndex("${changedUniqueIndexFixture.indexName}").on(table.${changedUniqueIndexFixture.changedColumn})`;
    assert.equal(originalSchema.split(originalDefinition).length - 1, 1);
    await writeFile(
      fixtureSchemaPath,
      originalSchema.replace(originalDefinition, changedDefinition),
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

test("detects uniqueness removed from an existing index without changing migration history", async () => {
  const temporaryDirectory = await mkdtemp(
    path.join(os.tmpdir(), "drizzle-unique-index-rule-test-"),
  );
  const schemaDirectory = path.join(temporaryDirectory, "schema");
  const schemaPath = path.join(schemaDirectory, "index.ts");

  try {
    await cp(path.join(packageRoot, "src/schema"), schemaDirectory, {
      recursive: true,
    });

    const fixtureSchemaPath = path.join(
      schemaDirectory,
      changedUniqueIndexUniquenessFixture.schemaFile,
    );
    const originalSchema = await readFile(fixtureSchemaPath, "utf8");
    const originalDefinition = `uniqueIndex("${changedUniqueIndexUniquenessFixture.indexName}").on(table.${changedUniqueIndexUniquenessFixture.column})`;
    const changedDefinition = `index("${changedUniqueIndexUniquenessFixture.indexName}").on(table.${changedUniqueIndexUniquenessFixture.column})`;
    assert.equal(originalSchema.split(originalDefinition).length - 1, 1);
    await writeFile(
      fixtureSchemaPath,
      originalSchema.replace(originalDefinition, changedDefinition),
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
