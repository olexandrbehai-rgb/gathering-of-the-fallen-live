# Database migrations

## Generate and review

1. Update the Drizzle schema under `src/schema/`.
2. Generate a versioned migration:

   ```bash
   pnpm --filter @workspace/db run generate
   ```

3. Review the generated SQL in `lib/db/migrations/` and the matching snapshot in
   `lib/db/migrations/meta/`. Confirm that every operation is expected and that
   existing rows are preserved. Keep the SQL, snapshot, and journal in the same
   commit.
4. Test the migration against a disposable development database before
   production.

Run the automated PostgreSQL integration test with:

```bash
pnpm --filter @workspace/db run test:migrations
```

The test starts its own local, disposable PostgreSQL cluster using `initdb` and
`pg_ctl`; those tools must be available on `PATH`. It never reads
`DATABASE_URL` or `RENDER_DATABASE_URL`, and it does not connect to an external
database. It creates the existing sessions and submissions schema, seeds rows,
applies the checked-in baseline and a test-only additive migration, and checks
that the seeded records survive, the migration journal prevents a second
execution, and applied migration hashes match their SQL files. It also verifies
that changing or removing an applied SQL file is rejected. Before the successful
run, the test executes a migration that adds a column and then fails; it checks
that the column and migration-history records are rolled back. It then fixes the
SQL and confirms the migration applies successfully on retry.

The first migration is a no-op baseline for the already-initialized Render
database. Its snapshot records the schema represented by the current Drizzle
models; it does not create application tables on a fresh database. Keep this
baseline migration in history so later generated migrations diff from the
existing production schema.

### Render baseline verification

The live Render database was inspected read-only on 2026-10-02 through
`RENDER_DATABASE_URL`, using a read-only transaction and querying PostgreSQL
catalog metadata only. The connection URL and application rows were not
displayed or changed.

The live tables have the same 6 `sessions` columns and 13 `submissions`
columns as the snapshot, with matching names, types, nullability, and defaults.
The `sessions` defaults are `id=gen_random_uuid()`, `capacity=30`,
`is_open=true`, and `created_at=now()`. The `submissions` defaults are
`id=gen_random_uuid()`, `status='pending'`, and `created_at=now()`; all other
columns have no default. The enum labels and order match: `session_type` is
`artist_spotlight`, `genre_showcase`, `weekend_takeover`; `submission_status`
is `pending`, `approved`, `rejected`, `played`, `skipped`.

The declared indexes match: `sessions_starts_at_unique` (unique on
`starts_at`), `sessions_starts_at_idx` (`starts_at`),
`submissions_session_queue_unique` (unique on `session_id, queue_number`),
and `submissions_session_status_queue_idx` (`session_id, status,
queue_number`). The live primary-key indexes correspond to the snapshot's
primary-key columns. The `submissions.session_id` foreign key is named
`submissions_session_id_fkey` and references `sessions.id` with `NO ACTION` on
delete and update, matching the checked-in snapshot.

No production schema change is needed to apply the no-op baseline, and none
was made during this inspection. Do not apply migrations while any schema
differences remain unexplained.

## Apply to production

Production changes are applied only when an operator deliberately runs this
command after reviewing the migration and arranging a current database backup:

```bash
pnpm --filter @workspace/db run migrate:production
```

The command requires the `RENDER_DATABASE_URL` Replit secret to contain the
external Render PostgreSQL connection URL. The production config rejects
non-Render endpoints and enforces TLS. It does not print the connection URL.
Before invoking Drizzle Kit, the command performs two catalog-only checks in
one PostgreSQL `READ ONLY` transaction:

1. It compares every applied migration's recorded SHA-256 hash with the
   checked-in SQL identified by its journal timestamp. If an applied
   migration's SQL is changed or missing, or its timestamp is absent or
   ambiguous in the checked-in journal, the command stops.
2. It compares the live `public` catalog with the Drizzle snapshot for the
   latest applied migration. Before the no-op baseline has a journal record,
   it checks the baseline snapshot. The comparison covers public tables and
   columns, column types, nullability, defaults and primary-key membership,
   indexes, foreign keys, and enum labels and order. Missing, additional, or
   differently named objects stop the run before DDL.

On a mismatch, use the reported schema object names and difference types to
investigate; the preflight does not read application rows or print the
connection URL. Determine whether the live change was intentional and resolve
it through a reviewed, versioned migration only after confirming the target
and arranging a current backup. Do not edit a historical snapshot just to
silence a mismatch. Rerun the command after resolving the discrepancy. The
migration command records applied migration versions in Drizzle's own
migration bookkeeping table.

This command is not part of application startup, the Render build or start
commands, or the deployment workflow. Do not add automatic migration execution
to those paths.

## Development-only schema push

`pnpm --filter @workspace/db run push` (and `push-force`) is for development
databases only. Do not point either command at production: schema push can
propose changes to tables outside the Drizzle models. Production changes must
use reviewed, versioned migration files and the explicit command above.
