import assert from "node:assert/strict";
import { test } from "node:test";
import { withRequiredPostgresTls } from "./connection-url";

test("requires TLS for external Render Postgres URLs", () => {
  const connectionString =
    "postgresql://user:password@dpg-example.frankfurt-postgres.render.com:5432/app";

  const result = new URL(withRequiredPostgresTls(connectionString));

  assert.equal(result.searchParams.get("sslmode"), "require");
});

test("preserves other parameters when requiring TLS", () => {
  const connectionString =
    "postgresql://user:password@dpg-example.frankfurt-postgres.render.com:5432/app?application_name=live";

  const result = new URL(withRequiredPostgresTls(connectionString));

  assert.equal(result.searchParams.get("application_name"), "live");
  assert.equal(result.searchParams.get("sslmode"), "require");
});

test("preserves stronger TLS modes for external Render Postgres URLs", () => {
  const connectionString =
    "postgresql://user:password@dpg-example.frankfurt-postgres.render.com:5432/app?sslmode=verify-full";

  assert.equal(
    withRequiredPostgresTls(connectionString),
    connectionString,
  );
});

test("does not add external TLS settings to internal Render URLs", () => {
  const connectionString =
    "postgresql://user:password@dpg-internal-a:5432/app";

  assert.equal(
    withRequiredPostgresTls(connectionString),
    connectionString,
  );
});

test("does not modify non-Render database URLs", () => {
  const connectionString = "postgresql://user:password@localhost:5432/app";

  assert.equal(
    withRequiredPostgresTls(connectionString),
    connectionString,
  );
});

test("can require TLS for production database URLs outside Render", () => {
  const connectionString =
    "postgresql://user:password@database.example.net:5432/app";

  const result = new URL(withRequiredPostgresTls(connectionString, true));

  assert.equal(result.searchParams.get("sslmode"), "require");
});