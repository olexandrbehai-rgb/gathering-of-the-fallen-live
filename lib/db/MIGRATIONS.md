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
that the seeded records survive and the migration journal prevents a second
execution.

The first migration is a no-op baseline for the already-initialized Render
database. Its snapshot records the schema represented by the current Drizzle
models; it does not create application tables on a fresh database. Keep this
baseline migration in history so later generated migrations diff from the
existing production schema. Before the first production run, compare the live
tables with the snapshot; the baseline intentionally performs no application
schema validation or creation.

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
primary-key columns. The `submissions.session_id` foreign key references
`sessions.id` with `NO ACTION` on delete and update, as expected, but its live
name is `submissions_session_id_fkey` rather than the snapshot name
`submissions_session_id_sessions_id_fk`. This is a name-only difference; the
constraint is non-deferrable and its relationship and behavior match.

No production schema change is needed to apply the no-op baseline, and none
was made during this inspection. Preserve the existing foreign key rather
than dropping and recreating it. Before a future migration needs to alter or
remove that foreign key, explicitly account for the live constraint name in a
reviewed versioned migration, after confirming the live schema and arranging
a current backup. Do not apply migrations while any other schema differences
remain unexplained.

## Apply to production

Production changes are applied only when an operator deliberately runs this
command after reviewing the migration and arranging a current database backup:

```bash
pnpm --filter @workspace/db run migrate:production
```

The command requires the `RENDER_DATABASE_URL` Replit secret to contain the
external Render PostgreSQL connection URL. The production config rejects
non-Render endpoints and enforces TLS. It does not print the connection URL.
The migration command records applied migration versions in Drizzle's own
migration bookkeeping table.

This command is not part of application startup, the Render build or start
commands, or the deployment workflow. Do not add automatic migration execution
to those paths.

## Development-only schema push

`pnpm --filter @workspace/db run push` (and `push-force`) is for development
databases only. Do not point either command at production: schema push can
propose changes to tables outside the Drizzle models. Production changes must
use reviewed, versioned migration files and the explicit command above.
