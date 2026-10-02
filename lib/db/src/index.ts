import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";
import { withRenderExternalPostgresTls } from "./connection-url";

const { Pool } = pg;
type Database = ReturnType<typeof drizzle<typeof schema>>;

let poolInstance: InstanceType<typeof Pool> | undefined;
let databaseInstance: Database | undefined;
let configuredConnectionString: string | undefined;

export function configureDatabase(
  connectionString: string,
  options: { maxConnections?: number } = {},
): void {
  if (!connectionString) {
    throw new Error("A PostgreSQL connection string is required.");
  }

  if (databaseInstance) {
    if (configuredConnectionString !== connectionString) {
      throw new Error(
        "The database has already been initialized with a different connection string.",
      );
    }
    return;
  }

  poolInstance = new Pool({
    connectionString: withRenderExternalPostgresTls(connectionString),
    ...(options.maxConnections ? { max: options.maxConnections } : {}),
  });
  databaseInstance = drizzle(poolInstance, { schema });
  configuredConnectionString = connectionString;
}

if (process.env.DATABASE_URL) {
  configureDatabase(process.env.DATABASE_URL);
}

export const pool = new Proxy({} as InstanceType<typeof Pool>, {
  get(_target, property) {
    if (!poolInstance) {
      throw new Error("Call configureDatabase() before using the database pool.");
    }
    const value = Reflect.get(poolInstance, property, poolInstance);
    return typeof value === "function" ? value.bind(poolInstance) : value;
  },
});

export const db = new Proxy({} as Database, {
  get(_target, property) {
    if (!databaseInstance) {
      throw new Error("Call configureDatabase() before running database queries.");
    }
    const value = Reflect.get(databaseInstance, property, databaseInstance);
    return typeof value === "function" ? value.bind(databaseInstance) : value;
  },
});

export * from "./schema";
