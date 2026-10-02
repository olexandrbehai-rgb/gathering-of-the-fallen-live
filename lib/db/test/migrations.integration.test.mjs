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
  const fixtureSql = await readFile(fixturePath, "utf8");
  const fixtureTag = "0001_test_additive_submission_column";
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
    fixtureSql,
  );
  await writeFile(journalPath, `${JSON.stringify(journal, null, 2)}\n`);

  return { migrationsDirectory, fixtureSql };
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
      id uuid PRIMARY KEY,
      session_type session_type NOT NULL,
      starts_at timestamptz NOT NULL,
      capacity integer NOT NULL DEFAULT 30,
      is_open boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX sessions_starts_at_unique ON sessions (starts_at);
    CREATE INDEX sessions_starts_at_idx ON sessions (starts_at);
    CREATE TABLE submissions (
      id uuid PRIMARY KEY,
      session_id uuid NOT NULL REFERENCES sessions (id),
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
  "versioned PostgreSQL migrations preserve existing rows and run only once",
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
      await seedExistingRecords(testPool);
      const expectedRecords = toExpectedRows();
      assert.deepEqual(await readExistingRecords(testPool), expectedRecords);

      const { migrationsDirectory, fixtureSql } =
        await createMigrationsFixture(tempRoot);
      const database = drizzle(testPool);
      const migrationOptions = {
        migrationsFolder: migrationsDirectory,
      };

      await migrate(database, migrationOptions);

      assert.deepEqual(await readExistingRecords(testPool), expectedRecords);
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
