import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile, cp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import test from "node:test";
import { assertAppliedMigrationsUnchanged } from "../scripts/migration-integrity.mjs";
import { assertProductionSchemaMatchesSnapshot } from "../scripts/schema-drift.mjs";

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const fixturePath = path.join(
  packageRoot,
  "test",
  "fixtures",
  "0001_test_additive_submission_column.sql",
);
const fixtureTag = "0001_test_additive_submission_column";
const testCheckConstraintName = "sessions_capacity_positive_check";
const seedSessions = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    sessionType: "artist_spotlight",
    startsAt: "2026-10-05T18:00:00.000Z",
    capacity: 30,
    isOpen: true,
    createdAt: "2026-09-20T12:00:00.000Z",
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    sessionType: "genre_showcase",
    startsAt: "2026-10-06T18:00:00.000Z",
    capacity: 18,
    isOpen: false,
    createdAt: "2026-09-21T12:00:00.000Z",
  },
];
const seedSubmissions = [
  {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    sessionId: seedSessions[0].id,
    queueNumber: 1,
    artistName: "Existing Artist",
    songTitle: "Existing Track",
    intro: "An existing submission.",
    genre: "Electronic",
    country: "Canada",
    socialUrl: "https://example.com/artist",
    trackUrl: "https://example.com/track",
    rightsAccepted: true,
    status: "pending",
    createdAt: "2026-09-22T12:00:00.000Z",
  },
  {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    sessionId: seedSessions[1].id,
    queueNumber: 3,
    artistName: "Another Artist",
    songTitle: "Another Track",
    intro: "Another existing submission.",
    genre: "Jazz",
    country: "United Kingdom",
    socialUrl: null,
    trackUrl: "https://example.com/another-track",
    rightsAccepted: true,
    status: "approved",
    createdAt: "2026-09-23T12:00:00.000Z",
  },
];
const expectedSubmissionForeignKeys = [
  {
    name: "submissions_session_id_fkey",
    source_schema: "public",
    source_table: "submissions",
    source_column: "session_id",
    target_schema: "public",
    target_table: "sessions",
    target_column: "id",
    delete_action: "a",
    update_action: "a",
    deferrable: false,
    initially_deferred: false,
  },
];

function runPostgresTool(command, args, tempRoot) {
  try {
    return execFileSync(command, args, {
      encoding: "utf8",
      env: {
        PATH: process.env.PATH ?? "",
        HOME: tempRoot,
        LANG: "C",
      },
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 30_000,
    });
  } catch (error) {
    const toolOutput = [error.stdout, error.stderr]
      .filter(Boolean)
      .join("\n")
      .trim();
    const message =
      error.code === "ENOENT"
        ? `Required PostgreSQL tool "${command}" was not found on PATH.`
        : `PostgreSQL tool "${command}" failed: ${toolOutput || error.message}`;
    throw new Error(message, { cause: error });
  }
}

async function createMigrationsFixture(tempRoot) {
  const migrationsDirectory = path.join(tempRoot, "migrations");
  await cp(path.join(packageRoot, "migrations"), migrationsDirectory, {
    recursive: true,
  });

  const journalPath = path.join(migrationsDirectory, "meta", "_journal.json");
  const journal = JSON.parse(await readFile(journalPath, "utf8"));
  const fixtureSql = `${(await readFile(fixturePath, "utf8")).trimEnd()}

--> statement-breakpoint
ALTER TABLE "sessions"
ADD CONSTRAINT "${testCheckConstraintName}" CHECK ("capacity" > 0);
`;
  const baselineSnapshotPath = path.join(
    migrationsDirectory,
    "meta",
    "0000_snapshot.json",
  );
  const baselineSnapshot = JSON.parse(
    await readFile(baselineSnapshotPath, "utf8"),
  );
  const additiveSnapshot = structuredClone(baselineSnapshot);
  additiveSnapshot.id = "11111111-2222-4333-8444-555555555555";
  additiveSnapshot.prevId = baselineSnapshot.id;
  additiveSnapshot.tables["public.submissions"].columns.migration_test_marker =
    {
      name: "migration_test_marker",
      type: "text",
      primaryKey: false,
      notNull: false,
    };
  additiveSnapshot.tables["public.sessions"].checkConstraints[
    testCheckConstraintName
  ] = {
    name: testCheckConstraintName,
    value: "capacity > 0",
  };
  await writeFile(
    path.join(migrationsDirectory, "meta", "0001_snapshot.json"),
    `${JSON.stringify(additiveSnapshot, null, 2)}\n`,
  );
  const failingFixtureSql = `${fixtureSql.trimEnd()}\n\n--> statement-breakpoint\nSELECT 1 / 0;\n`;
  const lastEntry = journal.entries.at(-1);

  journal.entries.push({
    idx: journal.entries.length,
    version: journal.version,
    when: Math.max(Date.now(), lastEntry.when + 1),
    tag: fixtureTag,
    breakpoints: true,
  });
  await writeFile(
    path.join(migrationsDirectory, `${fixtureTag}.sql`),
    failingFixtureSql,
  );
  await writeFile(journalPath, `${JSON.stringify(journal, null, 2)}\n`);

  return { migrationsDirectory, fixtureSql };
}

async function createIncompleteEnumSnapshotFixture(tempRoot) {
  const migrationsDirectory = path.join(tempRoot, "incomplete-enum-snapshot");
  const metadataDirectory = path.join(migrationsDirectory, "meta");
  await mkdir(metadataDirectory, { recursive: true });

  const journalPath = path.join(
    packageRoot,
    "migrations",
    "meta",
    "_journal.json",
  );
  const snapshotPath = path.join(
    packageRoot,
    "migrations",
    "meta",
    "0000_snapshot.json",
  );
  const journal = await readFile(journalPath, "utf8");
  const snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));
  delete snapshot.tables["public.sessions"].columns.session_type.typeSchema;

  await writeFile(path.join(metadataDirectory, "_journal.json"), journal);
  await writeFile(
    path.join(metadataDirectory, "0000_snapshot.json"),
    `${JSON.stringify(snapshot, null, 2)}\n`,
  );
  return migrationsDirectory;
}

async function createExistingSchema(pool) {
  await pool.query(`
    CREATE TYPE session_type AS ENUM (
      'artist_spotlight',
      'genre_showcase',
      'weekend_takeover'
    );
    CREATE TYPE submission_status AS ENUM (
      'pending',
      'approved',
      'rejected',
      'played',
      'skipped'
    );
    CREATE TABLE sessions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      session_type session_type NOT NULL,
      starts_at timestamptz NOT NULL,
      capacity integer NOT NULL DEFAULT 30,
      is_open boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX sessions_starts_at_unique ON sessions (starts_at);
    CREATE INDEX sessions_starts_at_idx ON sessions (starts_at);
    CREATE TABLE submissions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id uuid NOT NULL
        CONSTRAINT submissions_session_id_fkey
        REFERENCES sessions (id) ON DELETE NO ACTION ON UPDATE NO ACTION,
      queue_number integer NOT NULL,
      artist_name varchar(100) NOT NULL,
      song_title varchar(120) NOT NULL,
      intro varchar(300) NOT NULL,
      genre varchar(60) NOT NULL,
      country varchar(80) NOT NULL,
      social_url text,
      track_url text NOT NULL,
      rights_accepted boolean NOT NULL,
      status submission_status NOT NULL DEFAULT 'pending',
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX submissions_session_queue_unique
      ON submissions (session_id, queue_number);
    CREATE INDEX submissions_session_status_queue_idx
      ON submissions (session_id, status, queue_number);
  `);
}

async function readSubmissionForeignKeys(pool) {
  const result = await pool.query(`
    SELECT
      constraint_row.conname AS name,
      source_schema.nspname AS source_schema,
      source_table.relname AS source_table,
      source_column.attname AS source_column,
      target_schema.nspname AS target_schema,
      target_table.relname AS target_table,
      target_column.attname AS target_column,
      constraint_row.confdeltype AS delete_action,
      constraint_row.confupdtype AS update_action,
      constraint_row.condeferrable AS deferrable,
      constraint_row.condeferred AS initially_deferred
    FROM pg_constraint AS constraint_row
    JOIN pg_class AS source_table
      ON source_table.oid = constraint_row.conrelid
    JOIN pg_namespace AS source_schema
      ON source_schema.oid = source_table.relnamespace
    JOIN pg_class AS target_table
      ON target_table.oid = constraint_row.confrelid
    JOIN pg_namespace AS target_schema
      ON target_schema.oid = target_table.relnamespace
    JOIN LATERAL unnest(constraint_row.conkey) WITH ORDINALITY
      AS source_key(attnum, ordinality) ON true
    JOIN LATERAL unnest(constraint_row.confkey) WITH ORDINALITY
      AS target_key(attnum, ordinality)
      ON target_key.ordinality = source_key.ordinality
    JOIN pg_attribute AS source_column
      ON source_column.attrelid = source_table.oid
      AND source_column.attnum = source_key.attnum
    JOIN pg_attribute AS target_column
      ON target_column.attrelid = target_table.oid
      AND target_column.attnum = target_key.attnum
    WHERE constraint_row.contype = 'f'
      AND source_schema.nspname = 'public'
      AND source_table.relname = 'submissions'
    ORDER BY constraint_row.conname, source_key.ordinality
  `);

  return result.rows;
}

async function seedExistingRecords(pool) {
  for (const session of seedSessions) {
    await pool.query(
      `INSERT INTO sessions
        (id, session_type, starts_at, capacity, is_open, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        session.id,
        session.sessionType,
        session.startsAt,
        session.capacity,
        session.isOpen,
        session.createdAt,
      ],
    );
  }

  for (const submission of seedSubmissions) {
    await pool.query(
      `INSERT INTO submissions
        (id, session_id, queue_number, artist_name, song_title, intro, genre,
         country, social_url, track_url, rights_accepted, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        submission.id,
        submission.sessionId,
        submission.queueNumber,
        submission.artistName,
        submission.songTitle,
        submission.intro,
        submission.genre,
        submission.country,
        submission.socialUrl,
        submission.trackUrl,
        submission.rightsAccepted,
        submission.status,
        submission.createdAt,
      ],
    );
  }
}

async function readExistingRecords(pool) {
  const sessions = await pool.query(
    `SELECT id, session_type, starts_at, capacity, is_open, created_at
     FROM sessions ORDER BY id`,
  );
  const submissions = await pool.query(
    `SELECT id, session_id, queue_number, artist_name, song_title, intro,
            genre, country, social_url, track_url, rights_accepted, status,
            created_at
     FROM submissions ORDER BY id`,
  );

  return { sessions: sessions.rows, submissions: submissions.rows };
}

async function assertProductionSchemaMatchesSnapshotWithoutApplicationRows({
  pool,
  migrationsFolder,
}) {
  const statements = [];
  const catalogOnlyPool = {
    query: (query, ...args) => {
      statements.push(typeof query === "string" ? query : query.text);
      return pool.query(query, ...args);
    },
  };

  try {
    await assertProductionSchemaMatchesSnapshot({
      pool: catalogOnlyPool,
      migrationsFolder,
    });
  } finally {
    assert.ok(statements.length > 0, "The preflight should query the catalog.");
    assert.equal(
      statements.some((statement) =>
        /\b(?:FROM|JOIN)\s+(?:(?:"?public"?)\s*\.\s*)?"?(?:sessions|submissions)"?\b/i.test(
          statement ?? "",
        ),
      ),
      false,
      "The preflight must not read application rows.",
    );
  }
}

async function assertSchemaDrift(pool, migrationsFolder, expectedDifferences) {
  let error;
  await assert.rejects(
    assertProductionSchemaMatchesSnapshotWithoutApplicationRows({
      pool,
      migrationsFolder,
    }),
    (caughtError) => {
      error = caughtError;
      return true;
    },
  );

  assert.match(error.message, /no production migration was run\./);
  for (const difference of expectedDifferences) {
    assert.ok(
      error.message.includes(`- ${difference}`),
      `Expected a safe object-level difference: ${difference}\n${error.message}`,
    );
  }
  assert.doesNotMatch(
    error.message,
    /artist_spotlight|genre_showcase|weekend_takeover|pending|approved|rejected|played|skipped/,
    "Drift errors should not expose enum labels.",
  );
  assert.doesNotMatch(
    error.message,
    /capacity\s*(?:>|<|=)/,
    "Drift errors should not expose check-constraint definitions.",
  );
}

async function replaceSessionTypeOrder(pool, labels) {
  await pool.query("BEGIN");
  try {
    await pool.query("ALTER TYPE session_type RENAME TO session_type_original");
    const enumLabels = labels.map((label) => `'${label}'`).join(", ");
    await pool.query(`CREATE TYPE session_type AS ENUM (${enumLabels})`);
    await pool.query(
      `ALTER TABLE sessions
       ALTER COLUMN session_type TYPE session_type
       USING session_type::text::session_type`,
    );
    await pool.query("DROP TYPE session_type_original");
    await pool.query("COMMIT");
  } catch (error) {
    await pool.query("ROLLBACK");
    throw error;
  }
}

function toExpectedRows() {
  return {
    sessions: seedSessions
      .map((row) => ({
        id: row.id,
        session_type: row.sessionType,
        starts_at: new Date(row.startsAt),
        capacity: row.capacity,
        is_open: row.isOpen,
        created_at: new Date(row.createdAt),
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    submissions: seedSubmissions
      .map((row) => ({
        id: row.id,
        session_id: row.sessionId,
        queue_number: row.queueNumber,
        artist_name: row.artistName,
        song_title: row.songTitle,
        intro: row.intro,
        genre: row.genre,
        country: row.country,
        social_url: row.socialUrl,
        track_url: row.trackUrl,
        rights_accepted: row.rightsAccepted,
        status: row.status,
        created_at: new Date(row.createdAt),
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  };
}

test(
  "versioned PostgreSQL migrations preserve existing rows and the Render foreign key",
  { timeout: 120_000 },
  async () => {
    const tempRoot = await mkdtemp(
      path.join(os.tmpdir(), "db-migrations-integration-"),
    );
    const dataDirectory = path.join(tempRoot, "data");
    const socketDirectory = path.join(tempRoot, "socket");
    const serverLog = path.join(tempRoot, "postgres.log");
    await mkdir(socketDirectory, { mode: 0o700 });

    let serverStarted = false;
    let adminPool;
    let testPool;

    try {
      runPostgresTool(
        "initdb",
        [
          "-D",
          dataDirectory,
          "--auth=trust",
          "--username=postgres",
          "--no-instructions",
        ],
        tempRoot,
      );
      runPostgresTool(
        "pg_ctl",
        [
          "-D",
          dataDirectory,
          "-o",
          `-F -c listen_addresses='' -c unix_socket_directories='${socketDirectory}' -p 5432`,
          "-l",
          serverLog,
          "-w",
          "start",
        ],
        tempRoot,
      );
      serverStarted = true;

      adminPool = new Pool({
        host: socketDirectory,
        port: 5432,
        user: "postgres",
        database: "postgres",
        max: 1,
        connectionTimeoutMillis: 5_000,
      });
      await adminPool.query("CREATE DATABASE migration_test");
      await adminPool.end();
      adminPool = undefined;

      testPool = new Pool({
        host: socketDirectory,
        port: 5432,
        user: "postgres",
        database: "migration_test",
        max: 1,
        connectionTimeoutMillis: 5_000,
      });
      await createExistingSchema(testPool);
      assert.deepEqual(
        await readSubmissionForeignKeys(testPool),
        expectedSubmissionForeignKeys,
      );
      await seedExistingRecords(testPool);
      const expectedRecords = toExpectedRows();
      assert.deepEqual(await readExistingRecords(testPool), expectedRecords);
      const migrationsFolder = path.join(packageRoot, "migrations");
      await assertProductionSchemaMatchesSnapshotWithoutApplicationRows({
        pool: testPool,
        migrationsFolder,
      });
      assert.deepEqual(await readExistingRecords(testPool), expectedRecords);

      const incompleteEnumSnapshotDirectory =
        await createIncompleteEnumSnapshotFixture(tempRoot);
      await assert.rejects(
        assertProductionSchemaMatchesSnapshotWithoutApplicationRows({
          pool: testPool,
          migrationsFolder: incompleteEnumSnapshotDirectory,
        }),
        /missing typeSchema metadata for enum-backed column public\.sessions\.session_type; refusing to check production schema\./,
      );

      await testPool.query(`
        CREATE SCHEMA alternate_types;
        CREATE TYPE alternate_types.session_type AS ENUM (
          'artist_spotlight',
          'genre_showcase',
          'weekend_takeover'
        );
        ALTER TABLE sessions
        ALTER COLUMN session_type TYPE alternate_types.session_type
        USING session_type::text::alternate_types.session_type;
      `);
      await assertSchemaDrift(testPool, migrationsFolder, [
        "Column public.sessions.session_type uses a different type schema.",
      ]);
      await testPool.query(`
        ALTER TABLE sessions
        ALTER COLUMN session_type TYPE public.session_type
        USING session_type::text::public.session_type;
        DROP TYPE alternate_types.session_type;
        DROP SCHEMA alternate_types;
      `);
      await assertProductionSchemaMatchesSnapshotWithoutApplicationRows({
        pool: testPool,
        migrationsFolder,
      });
      assert.deepEqual(await readExistingRecords(testPool), expectedRecords);

      await testPool.query(
        `ALTER TYPE session_type
         RENAME VALUE 'genre_showcase' TO 'genre_showcase_drifted'`,
      );
      await assertSchemaDrift(testPool, migrationsFolder, [
        "Enum public.session_type has different labels or label order.",
      ]);
      await testPool.query(
        `ALTER TYPE session_type
         RENAME VALUE 'genre_showcase_drifted' TO 'genre_showcase'`,
      );

      await replaceSessionTypeOrder(testPool, [
        "genre_showcase",
        "artist_spotlight",
        "weekend_takeover",
      ]);
      await assertSchemaDrift(testPool, migrationsFolder, [
        "Enum public.session_type has different labels or label order.",
      ]);
      await replaceSessionTypeOrder(testPool, [
        "artist_spotlight",
        "genre_showcase",
        "weekend_takeover",
      ]);

      await testPool.query(
        "ALTER TABLE sessions ALTER COLUMN capacity SET DEFAULT 31",
      );
      await assertSchemaDrift(testPool, migrationsFolder, [
        "Column public.sessions.capacity has a different default.",
      ]);
      await testPool.query(
        "ALTER TABLE sessions ALTER COLUMN capacity SET DEFAULT 30",
      );

      await testPool.query(`
        ALTER TABLE submissions
        DROP CONSTRAINT submissions_session_id_fkey,
        ADD CONSTRAINT submissions_session_id_fkey
          FOREIGN KEY (session_id) REFERENCES sessions (id) ON DELETE CASCADE
      `);
      await assertSchemaDrift(testPool, migrationsFolder, [
        "Foreign key public.submissions.submissions_session_id_fkey has different onDelete metadata.",
      ]);
      await testPool.query(`
        ALTER TABLE submissions
        DROP CONSTRAINT submissions_session_id_fkey,
        ADD CONSTRAINT submissions_session_id_fkey
          FOREIGN KEY (session_id) REFERENCES sessions (id)
          ON DELETE NO ACTION ON UPDATE NO ACTION
      `);

      await testPool.query(
        `ALTER TABLE submissions
         RENAME CONSTRAINT submissions_session_id_fkey
         TO submissions_session_id_fkey_renamed`,
      );
      await assertSchemaDrift(testPool, migrationsFolder, [
        "Missing foreign key public.submissions.submissions_session_id_fkey.",
        "Unexpected foreign key public.submissions.submissions_session_id_fkey_renamed.",
      ]);
      await testPool.query(
        `ALTER TABLE submissions
         RENAME CONSTRAINT submissions_session_id_fkey_renamed
         TO submissions_session_id_fkey`,
      );
      await assertProductionSchemaMatchesSnapshotWithoutApplicationRows({
        pool: testPool,
        migrationsFolder,
      });
      assert.deepEqual(await readExistingRecords(testPool), expectedRecords);

      await testPool.query("DROP INDEX sessions_starts_at_idx");
      await assert.rejects(
        assertProductionSchemaMatchesSnapshotWithoutApplicationRows({
          pool: testPool,
          migrationsFolder,
        }),
        /Missing index public\.sessions\.sessions_starts_at_idx/,
      );
      await testPool.query(
        "CREATE INDEX sessions_starts_at_idx ON sessions (starts_at)",
      );

      await testPool.query(
        "CREATE INDEX sessions_unexpected_idx ON sessions (capacity)",
      );
      await assert.rejects(
        assertProductionSchemaMatchesSnapshotWithoutApplicationRows({
          pool: testPool,
          migrationsFolder,
        }),
        /Unexpected index public\.sessions\.sessions_unexpected_idx/,
      );
      await testPool.query("DROP INDEX sessions_unexpected_idx");

      await testPool.query(
        "ALTER INDEX sessions_starts_at_idx RENAME TO sessions_starts_at_idx_renamed",
      );
      await assert.rejects(
        assertProductionSchemaMatchesSnapshotWithoutApplicationRows({
          pool: testPool,
          migrationsFolder,
        }),
        (error) =>
          /Missing index public\.sessions\.sessions_starts_at_idx/.test(
            error.message,
          ) &&
          /Unexpected index public\.sessions\.sessions_starts_at_idx_renamed/.test(
            error.message,
          ),
      );
      await testPool.query(
        "ALTER INDEX sessions_starts_at_idx_renamed RENAME TO sessions_starts_at_idx",
      );
      assert.deepEqual(await readExistingRecords(testPool), expectedRecords);

      const { migrationsDirectory, fixtureSql } =
        await createMigrationsFixture(tempRoot);
      const database = drizzle(testPool);
      const migrationOptions = {
        migrationsFolder: migrationsDirectory,
      };

      await assertAppliedMigrationsUnchanged({
        pool: testPool,
        migrationsFolder: migrationsDirectory,
      });

      // The first statement changes the schema; the next deliberately fails.
      // Both the DDL and migration history must roll back so the migration can
      // be corrected and retried.
      await assert.rejects(
        migrate(database, migrationOptions),
        (error) => error.cause?.code === "22012",
      );
      const columnAfterFailedMigration = await testPool.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'submissions'
          AND column_name = 'migration_test_marker'
      `);
      assert.equal(columnAfterFailedMigration.rowCount, 0);
      const checkAfterFailedMigration = await testPool.query(
        `SELECT 1
         FROM pg_catalog.pg_constraint
         WHERE conname = $1`,
        [testCheckConstraintName],
      );
      assert.equal(checkAfterFailedMigration.rowCount, 0);

      const migrationsAfterFailedRun = await testPool.query(
        `SELECT hash, created_at
         FROM drizzle.__drizzle_migrations
         ORDER BY created_at`,
      );
      assert.equal(migrationsAfterFailedRun.rowCount, 0);

      const appliedFixturePath = path.join(
        migrationsDirectory,
        `${fixtureTag}.sql`,
      );
      await writeFile(appliedFixturePath, fixtureSql);
      await migrate(database, migrationOptions);

      assert.deepEqual(await readExistingRecords(testPool), expectedRecords);
      assert.deepEqual(
        await readSubmissionForeignKeys(testPool),
        expectedSubmissionForeignKeys,
      );
      await assertProductionSchemaMatchesSnapshotWithoutApplicationRows({
        pool: testPool,
        migrationsFolder: migrationsDirectory,
      });
      await testPool.query(
        `ALTER TABLE sessions
         DROP CONSTRAINT ${testCheckConstraintName},
         ADD CONSTRAINT ${testCheckConstraintName} CHECK (capacity > 1)`,
      );
      await assertSchemaDrift(testPool, migrationsDirectory, [
        `Check constraint public.sessions.${testCheckConstraintName} has different definition metadata.`,
      ]);
      await testPool.query(
        `ALTER TABLE sessions
         DROP CONSTRAINT ${testCheckConstraintName},
         ADD CONSTRAINT ${testCheckConstraintName} CHECK (capacity > 0)`,
      );

      await testPool.query(
        `ALTER TABLE sessions
         RENAME CONSTRAINT ${testCheckConstraintName}
         TO ${testCheckConstraintName}_renamed`,
      );
      await assertSchemaDrift(testPool, migrationsDirectory, [
        `Missing check constraint public.sessions.${testCheckConstraintName}.`,
        `Unexpected check constraint public.sessions.${testCheckConstraintName}_renamed.`,
      ]);
      await testPool.query(
        `ALTER TABLE sessions
         RENAME CONSTRAINT ${testCheckConstraintName}_renamed
         TO ${testCheckConstraintName}`,
      );

      await testPool.query(
        `ALTER TABLE sessions
         ADD CONSTRAINT sessions_capacity_nonzero_check CHECK (capacity <> 0)`,
      );
      await assertSchemaDrift(testPool, migrationsDirectory, [
        "Unexpected check constraint public.sessions.sessions_capacity_nonzero_check.",
      ]);
      await testPool.query(
        "ALTER TABLE sessions DROP CONSTRAINT sessions_capacity_nonzero_check",
      );
      const addedColumn = await testPool.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'submissions'
          AND column_name = 'migration_test_marker'
      `);
      assert.equal(addedColumn.rowCount, 1);

      const migrationsAfterFirstRun = await testPool.query(
        `SELECT hash, created_at
         FROM drizzle.__drizzle_migrations
         ORDER BY created_at`,
      );
      assert.equal(migrationsAfterFirstRun.rowCount, 2);
      assert.deepEqual(
        migrationsAfterFirstRun.rows.map((row) => row.hash),
        [
          createHash("sha256")
            .update(
              await readFile(
                path.join(
                  packageRoot,
                  "migrations",
                  "0000_existing_production_schema_baseline.sql",
                ),
              ),
            )
            .digest("hex"),
          createHash("sha256").update(fixtureSql).digest("hex"),
        ],
      );
      await assertAppliedMigrationsUnchanged({
        pool: testPool,
        migrationsFolder: migrationsDirectory,
      });

      await writeFile(
        appliedFixturePath,
        `${fixtureSql}\n-- edited after apply\n`,
      );
      await assert.rejects(
        assertAppliedMigrationsUnchanged({
          pool: testPool,
          migrationsFolder: migrationsDirectory,
        }),
        new RegExp(`Applied migration "${fixtureTag}" has changed`),
      );
      await writeFile(appliedFixturePath, fixtureSql);
      await rm(appliedFixturePath);
      await assert.rejects(
        assertAppliedMigrationsUnchanged({
          pool: testPool,
          migrationsFolder: migrationsDirectory,
        }),
        new RegExp(`Applied migration "${fixtureTag}" is missing`),
      );
      await writeFile(appliedFixturePath, fixtureSql);

      // The additive migration deliberately has no IF NOT EXISTS clause; a
      // second execution would fail instead of silently appearing idempotent.
      await migrate(database, migrationOptions);
      const migrationsAfterSecondRun = await testPool.query(
        `SELECT hash, created_at
         FROM drizzle.__drizzle_migrations
         ORDER BY created_at`,
      );
      assert.deepEqual(
        migrationsAfterSecondRun.rows,
        migrationsAfterFirstRun.rows,
      );
      assert.deepEqual(await readExistingRecords(testPool), expectedRecords);
    } finally {
      await Promise.all(
        [adminPool, testPool].filter(Boolean).map((pool) => pool.end()),
      );
      if (serverStarted) {
        try {
          runPostgresTool(
            "pg_ctl",
            ["-D", dataDirectory, "-m", "fast", "-w", "stop"],
            tempRoot,
          );
        } catch (error) {
          console.error(error);
        }
      }
      await rm(tempRoot, { recursive: true, force: true });
    }
  },
);
