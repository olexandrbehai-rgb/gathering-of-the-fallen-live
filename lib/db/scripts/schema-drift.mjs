import { readFile } from "node:fs/promises";
import path from "node:path";

const migrationSchema = "drizzle";
const migrationTable = "__drizzle_migrations";
const publicSchema = "public";

const tablesQuery = `
  SELECT
    table_namespace.nspname AS schema_name,
    table_row.relname AS table_name,
    column_row.attname AS column_name,
    pg_catalog.format_type(column_row.atttypid, column_row.atttypmod) AS data_type,
    type_namespace.nspname AS type_schema,
    NOT column_row.attnotnull AS nullable,
    pg_catalog.pg_get_expr(default_row.adbin, default_row.adrelid) AS default_value,
    EXISTS (
      SELECT 1
      FROM pg_catalog.pg_constraint AS primary_key
      WHERE primary_key.conrelid = table_row.oid
        AND primary_key.contype = 'p'
        AND column_row.attnum = ANY(primary_key.conkey)
    ) AS is_primary_key
  FROM pg_catalog.pg_class AS table_row
  JOIN pg_catalog.pg_namespace AS table_namespace
    ON table_namespace.oid = table_row.relnamespace
  JOIN pg_catalog.pg_attribute AS column_row
    ON column_row.attrelid = table_row.oid
  JOIN pg_catalog.pg_type AS type_row
    ON type_row.oid = column_row.atttypid
  JOIN pg_catalog.pg_namespace AS type_namespace
    ON type_namespace.oid = type_row.typnamespace
  LEFT JOIN pg_catalog.pg_attrdef AS default_row
    ON default_row.adrelid = table_row.oid
    AND default_row.adnum = column_row.attnum
  WHERE table_namespace.nspname = $1
    AND table_row.relkind IN ('r', 'p')
    AND column_row.attnum > 0
    AND NOT column_row.attisdropped
  ORDER BY table_row.relname, column_row.attnum
`;

const indexesQuery = `
  SELECT
    table_namespace.nspname AS schema_name,
    table_row.relname AS table_name,
    index_row.relname AS index_name,
    index_metadata.indisunique AS is_unique,
    index_metadata.indisprimary AS is_primary,
    access_method.amname AS method,
    index_metadata.indisvalid AS is_valid,
    index_metadata.indisready AS is_ready,
    pg_catalog.pg_get_expr(index_metadata.indpred, index_metadata.indrelid)
      AS predicate,
    index_row.reloptions AS options,
    jsonb_agg(
      jsonb_build_object(
        'expression',
        pg_catalog.pg_get_indexdef(index_metadata.indexrelid, index_key.ordinality::integer, true),
        'isExpression',
        index_key.attnum = 0,
        'asc',
        (COALESCE(index_order.option, 0) & 1) = 0,
        'nulls',
        CASE
          WHEN (COALESCE(index_order.option, 0) & 2) = 2 THEN 'first'
          ELSE 'last'
        END
      )
      ORDER BY index_key.ordinality
    ) AS columns
  FROM pg_catalog.pg_index AS index_metadata
  JOIN pg_catalog.pg_class AS table_row
    ON table_row.oid = index_metadata.indrelid
  JOIN pg_catalog.pg_namespace AS table_namespace
    ON table_namespace.oid = table_row.relnamespace
  JOIN pg_catalog.pg_class AS index_row
    ON index_row.oid = index_metadata.indexrelid
  JOIN pg_catalog.pg_am AS access_method
    ON access_method.oid = index_row.relam
  CROSS JOIN LATERAL unnest(index_metadata.indkey) WITH ORDINALITY
    AS index_key(attnum, ordinality)
  LEFT JOIN LATERAL unnest(index_metadata.indoption) WITH ORDINALITY
    AS index_order(option, ordinality)
    ON index_order.ordinality = index_key.ordinality
  WHERE table_namespace.nspname = $1
    AND table_row.relkind IN ('r', 'p')
  GROUP BY
    table_namespace.nspname,
    table_row.relname,
    index_row.relname,
    index_metadata.indisunique,
    index_metadata.indisprimary,
    access_method.amname,
    index_metadata.indisvalid,
    index_metadata.indisready,
    index_metadata.indpred,
    index_metadata.indrelid,
    index_row.reloptions
  ORDER BY table_row.relname, index_row.relname
`;

const foreignKeysQuery = `
  SELECT
    source_namespace.nspname AS source_schema,
    source_table.relname AS source_table,
    constraint_row.conname AS name,
    target_namespace.nspname AS target_schema,
    target_table.relname AS target_table,
    array_agg(source_column.attname::text ORDER BY source_key.ordinality) AS columns_from,
    array_agg(target_column.attname::text ORDER BY source_key.ordinality) AS columns_to,
    CASE constraint_row.confdeltype
      WHEN 'r' THEN 'restrict'
      WHEN 'c' THEN 'cascade'
      WHEN 'n' THEN 'set null'
      WHEN 'd' THEN 'set default'
      ELSE 'no action'
    END AS on_delete,
    CASE constraint_row.confupdtype
      WHEN 'r' THEN 'restrict'
      WHEN 'c' THEN 'cascade'
      WHEN 'n' THEN 'set null'
      WHEN 'd' THEN 'set default'
      ELSE 'no action'
    END AS on_update,
    constraint_row.condeferrable AS deferrable,
    constraint_row.condeferred AS initially_deferred
  FROM pg_catalog.pg_constraint AS constraint_row
  JOIN pg_catalog.pg_class AS source_table
    ON source_table.oid = constraint_row.conrelid
  JOIN pg_catalog.pg_namespace AS source_namespace
    ON source_namespace.oid = source_table.relnamespace
  JOIN pg_catalog.pg_class AS target_table
    ON target_table.oid = constraint_row.confrelid
  JOIN pg_catalog.pg_namespace AS target_namespace
    ON target_namespace.oid = target_table.relnamespace
  CROSS JOIN LATERAL unnest(constraint_row.conkey) WITH ORDINALITY
    AS source_key(attnum, ordinality)
  JOIN LATERAL unnest(constraint_row.confkey) WITH ORDINALITY
    AS target_key(attnum, ordinality)
    ON target_key.ordinality = source_key.ordinality
  JOIN pg_catalog.pg_attribute AS source_column
    ON source_column.attrelid = source_table.oid
    AND source_column.attnum = source_key.attnum
  JOIN pg_catalog.pg_attribute AS target_column
    ON target_column.attrelid = target_table.oid
    AND target_column.attnum = target_key.attnum
  WHERE constraint_row.contype = 'f'
    AND source_namespace.nspname = $1
  GROUP BY
    source_namespace.nspname,
    source_table.relname,
    constraint_row.conname,
    target_namespace.nspname,
    target_table.relname,
    constraint_row.confdeltype,
    constraint_row.confupdtype,
    constraint_row.condeferrable,
    constraint_row.condeferred
  ORDER BY source_table.relname, constraint_row.conname
`;

const checkConstraintsQuery = `
  SELECT
    table_namespace.nspname AS schema_name,
    table_row.relname AS table_name,
    constraint_row.conname AS name,
    pg_catalog.pg_get_expr(
      constraint_row.conbin,
      constraint_row.conrelid
    ) AS expression
  FROM pg_catalog.pg_constraint AS constraint_row
  JOIN pg_catalog.pg_class AS table_row
    ON table_row.oid = constraint_row.conrelid
  JOIN pg_catalog.pg_namespace AS table_namespace
    ON table_namespace.oid = table_row.relnamespace
  WHERE constraint_row.contype = 'c'
    AND table_namespace.nspname = $1
    AND table_row.relkind IN ('r', 'p')
  ORDER BY table_row.relname, constraint_row.conname
`;

const enumsQuery = `
  SELECT
    type_namespace.nspname AS schema_name,
    type_row.typname AS type_name,
    array_agg(enum_label.enumlabel::text ORDER BY enum_label.enumsortorder) AS labels
  FROM pg_catalog.pg_type AS type_row
  JOIN pg_catalog.pg_namespace AS type_namespace
    ON type_namespace.oid = type_row.typnamespace
  JOIN pg_catalog.pg_enum AS enum_label
    ON enum_label.enumtypid = type_row.oid
  WHERE type_namespace.nspname = $1
  GROUP BY type_namespace.nspname, type_row.typname
  ORDER BY type_row.typname
`;

const tablesListQuery = `
  SELECT table_row.relname AS table_name
  FROM pg_catalog.pg_class AS table_row
  JOIN pg_catalog.pg_namespace AS table_namespace
    ON table_namespace.oid = table_row.relnamespace
  WHERE table_namespace.nspname = $1
    AND table_row.relkind IN ('r', 'p')
  ORDER BY table_row.relname
`;

const normalizeType = (type) =>
  type
    .replace(/^character varying/, "varchar")
    .replace(/^timestamp with time zone$/, "timestamptz")
    .replace(/^timestamp without time zone$/, "timestamp");

function normalizeDefault(value) {
  if (value === null || value === undefined) return null;
  let normalized = String(value).trim();
  normalized = normalized.replace(/::(?:"?[\w$]+"?\.)?"?[\w$]+"?/g, "");
  while (normalized.startsWith("(") && normalized.endsWith(")")) {
    normalized = normalized.slice(1, -1).trim();
  }
  return normalized.replace(/\s+/g, " ");
}

function stripOuterParentheses(value) {
  let expression = value;
  while (expression.startsWith("(") && expression.endsWith(")")) {
    let depth = 0;
    let wrapsExpression = true;
    for (let index = 0; index < expression.length; index += 1) {
      const character = expression[index];
      if (character === "'" || character === '"') {
        const quote = character;
        let end = index + 1;
        while (end < expression.length) {
          if (expression[end] !== quote) {
            end += 1;
            continue;
          }
          if (expression[end + 1] === quote) {
            end += 2;
            continue;
          }
          end += 1;
          break;
        }
        index = end - 1;
        continue;
      }
      if (character === "$") {
        const delimiter = expression
          .slice(index)
          .match(/^\$(?:[a-zA-Z_][\w$]*)?\$/)?.[0];
        if (delimiter) {
          const end = expression.indexOf(delimiter, index + delimiter.length);
          if (end !== -1) {
            index = end + delimiter.length - 1;
            continue;
          }
        }
      }
      if (character === "(") depth += 1;
      if (character === ")") {
        depth -= 1;
        if (depth === 0 && index !== expression.length - 1) {
          wrapsExpression = false;
          break;
        }
      }
    }
    if (!wrapsExpression || depth !== 0) break;
    expression = expression.slice(1, -1).trim();
  }
  return expression;
}

function normalizeSqlExpression(value) {
  const input = String(value).trim();
  let normalized = "";
  let pendingSpace = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (/\s/.test(character)) {
      pendingSpace = true;
      continue;
    }
    if (pendingSpace && normalized.length > 0) normalized += " ";
    pendingSpace = false;

    if (character === "'") {
      let end = index + 1;
      while (end < input.length) {
        if (input[end] !== "'") {
          end += 1;
          continue;
        }
        if (input[end + 1] === "'") {
          end += 2;
          continue;
        }
        end += 1;
        break;
      }
      normalized += input.slice(index, end);
      index = end - 1;
      continue;
    }

    if (character === "$") {
      const delimiter = input
        .slice(index)
        .match(/^\$(?:[a-zA-Z_][\w$]*)?\$/)?.[0];
      if (delimiter) {
        const end = input.indexOf(delimiter, index + delimiter.length);
        if (end !== -1) {
          normalized += input.slice(index, end + delimiter.length);
          index = end + delimiter.length - 1;
          continue;
        }
      }
    }

    if (character === '"') {
      let identifier = "";
      let end = index + 1;
      let closed = false;
      while (end < input.length) {
        if (input[end] !== '"') {
          identifier += input[end];
          end += 1;
          continue;
        }
        if (input[end + 1] === '"') {
          identifier += '"';
          end += 2;
          continue;
        }
        closed = true;
        end += 1;
        break;
      }
      if (closed) {
        normalized += /^[a-z_][a-z0-9_$]*$/.test(identifier)
          ? identifier
          : `"${identifier.replaceAll('"', '""')}"`;
        index = end - 1;
        continue;
      }
    }

    normalized += character;
  }

  return stripOuterParentheses(normalized.trim());
}

function stableJson(value) {
  if (Array.isArray(value)) {
    return JSON.stringify(value.map((item) => JSON.parse(stableJson(item))));
  }
  if (value && typeof value === "object") {
    return JSON.stringify(
      Object.fromEntries(
        Object.keys(value)
          .sort()
          .map((key) => [key, JSON.parse(stableJson(value[key]))]),
      ),
    );
  }
  return JSON.stringify(value);
}

function objectKey(schema, table, name) {
  return `${schema}.${table}.${name}`;
}

function expectedIndexes(snapshot) {
  const indexes = new Map();
  for (const [tableKey, table] of Object.entries(snapshot.tables ?? {})) {
    const [schema, tableName] = tableKey.split(".");
    for (const index of Object.values(table.indexes ?? {})) {
      indexes.set(objectKey(schema, tableName, index.name), {
        schema,
        tableName,
        name: index.name,
        unique: Boolean(index.isUnique),
        primary: false,
        method: index.method ?? "btree",
        predicate: null,
        options: index.with ?? {},
        columns: index.columns.map((column) => ({
          expression: column.expression,
          isExpression: Boolean(column.isExpression),
          asc: column.asc !== false,
          nulls: column.nulls ?? "last",
        })),
      });
    }

    const primaryKeyColumns = Object.entries(table.columns ?? {})
      .filter(([, column]) => column.primaryKey)
      .map(([name]) => name);
    const compositePrimaryKeys = Object.values(
      table.compositePrimaryKeys ?? {},
    );
    if (primaryKeyColumns.length > 0 && compositePrimaryKeys.length === 0) {
      const name = `${tableName}_pkey`;
      indexes.set(objectKey(schema, tableName, name), {
        schema,
        tableName,
        name,
        unique: true,
        primary: true,
        method: "btree",
        predicate: null,
        options: {},
        columns: primaryKeyColumns.map((expression) => ({
          expression,
          isExpression: false,
          asc: true,
          nulls: "last",
        })),
      });
    }

    for (const constraint of compositePrimaryKeys) {
      indexes.set(objectKey(schema, tableName, constraint.name), {
        schema,
        tableName,
        name: constraint.name,
        unique: true,
        primary: true,
        method: "btree",
        predicate: null,
        options: {},
        columns: constraint.columns.map((expression) => ({
          expression,
          isExpression: false,
          asc: true,
          nulls: "last",
        })),
      });
    }

    for (const constraint of Object.values(table.uniqueConstraints ?? {})) {
      indexes.set(objectKey(schema, tableName, constraint.name), {
        schema,
        tableName,
        name: constraint.name,
        unique: true,
        primary: false,
        method: "btree",
        predicate: null,
        options: {},
        columns: constraint.columns.map((expression) => ({
          expression,
          isExpression: false,
          asc: true,
          nulls: "last",
        })),
      });
    }
  }
  return indexes;
}

function expectedForeignKeys(snapshot) {
  const foreignKeys = new Map();
  for (const [tableKey, table] of Object.entries(snapshot.tables ?? {})) {
    const [schema, tableName] = tableKey.split(".");
    for (const foreignKey of Object.values(table.foreignKeys ?? {})) {
      const key = objectKey(schema, tableName, foreignKey.name);
      foreignKeys.set(key, {
        sourceSchema: schema,
        sourceTable: tableName,
        name: foreignKey.name,
        targetSchema: foreignKey.schemaTo ?? schema,
        targetTable: foreignKey.tableTo,
        columnsFrom: foreignKey.columnsFrom,
        columnsTo: foreignKey.columnsTo,
        onDelete: foreignKey.onDelete ?? "no action",
        onUpdate: foreignKey.onUpdate ?? "no action",
        deferrable: Boolean(foreignKey.deferrable),
        initiallyDeferred: Boolean(foreignKey.initiallyDeferred),
      });
    }
  }
  return foreignKeys;
}

function expectedCheckConstraints(snapshot) {
  const checkConstraints = new Map();
  for (const [tableKey, table] of Object.entries(snapshot.tables ?? {})) {
    const [schema, tableName] = tableKey.split(".");
    for (const constraint of Object.values(table.checkConstraints ?? {})) {
      if (
        typeof constraint.name !== "string" ||
        typeof constraint.value !== "string"
      ) {
        throw new Error(
          `The expected snapshot has invalid check-constraint metadata for ${tableKey}; refusing to check production schema.`,
        );
      }
      checkConstraints.set(
        objectKey(schema, tableName, constraint.name),
        normalizeSqlExpression(constraint.value),
      );
    }
  }
  return checkConstraints;
}

function assertEnumColumnTypeSchemas(snapshot, snapshotName) {
  const enumNames = new Set(
    Object.values(snapshot.enums)
      .map((enumType) => enumType?.name)
      .filter((name) => typeof name === "string"),
  );

  for (const [tableKey, table] of Object.entries(snapshot.tables)) {
    for (const [columnName, column] of Object.entries(table.columns ?? {})) {
      if (
        enumNames.has(column.type) &&
        (typeof column.typeSchema !== "string" ||
          column.typeSchema.length === 0)
      ) {
        throw new Error(
          `The expected schema snapshot ${snapshotName} is missing typeSchema metadata for enum-backed column ${tableKey}.${columnName}; refusing to check production schema.`,
        );
      }
    }
  }
}

async function readSnapshotAtCurrentPosition({ pool, migrationsFolder }) {
  const journalPath = path.join(migrationsFolder, "meta", "_journal.json");
  let journal;
  try {
    journal = JSON.parse(await readFile(journalPath, "utf8"));
  } catch (error) {
    throw new Error(
      `Could not read the checked-in Drizzle migration journal: ${error.message}`,
      { cause: error },
    );
  }
  if (!Array.isArray(journal.entries) || journal.entries.length === 0) {
    throw new Error(
      "The checked-in Drizzle migration journal has no entries; refusing to check production schema.",
    );
  }

  const table = await pool.query("SELECT to_regclass($1) AS table_name", [
    `${migrationSchema}.${migrationTable}`,
  ]);
  let currentEntry;
  if (!table.rows[0]?.table_name) {
    currentEntry = journal.entries.find((entry) => entry.idx === 0);
  } else {
    const applied = await pool.query(
      `SELECT created_at
       FROM ${migrationSchema}.${migrationTable}
       ORDER BY created_at DESC
       LIMIT 1`,
    );
    if (applied.rowCount === 0) {
      currentEntry = journal.entries.find((entry) => entry.idx === 0);
    } else {
      const timestamp = String(applied.rows[0].created_at);
      const matches = journal.entries.filter(
        (entry) => String(entry.when) === timestamp,
      );
      if (matches.length !== 1) {
        throw new Error(
          `The latest applied migration at timestamp ${timestamp} does not identify exactly one checked-in snapshot; refusing to run production migrations.`,
        );
      }
      currentEntry = matches[0];
    }
  }

  if (!currentEntry) {
    throw new Error(
      "The checked-in migration journal has no baseline entry at index 0; refusing to check production schema.",
    );
  }

  const snapshotName = `${String(currentEntry.idx).padStart(4, "0")}_snapshot.json`;
  const snapshotPath = path.join(migrationsFolder, "meta", snapshotName);
  let snapshot;
  try {
    snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));
  } catch (error) {
    throw new Error(
      `Could not read the expected schema snapshot ${snapshotName}: ${error.message}`,
      { cause: error },
    );
  }
  if (
    !snapshot.tables ||
    !snapshot.enums ||
    Object.values(snapshot.tables).some(
      (table) =>
        !table.checkConstraints ||
        typeof table.checkConstraints !== "object" ||
        Array.isArray(table.checkConstraints),
    )
  ) {
    throw new Error(
      `The expected schema snapshot ${snapshotName} is missing table, enum, or check-constraint metadata; refusing to check production schema.`,
    );
  }
  assertEnumColumnTypeSchemas(snapshot, snapshotName);
  return { snapshot, snapshotName, migrationTag: currentEntry.tag };
}

function compareTables(snapshot, actualTables, actualColumns, differences) {
  const expectedTables = new Map(
    Object.keys(snapshot.tables).map((key) => {
      const [schema, tableName] = key.split(".");
      return [key, { schema, tableName }];
    }),
  );
  const actualTableNames = new Set(
    actualTables.map((row) => `${publicSchema}.${row.table_name}`),
  );

  for (const [key, table] of expectedTables) {
    if (!actualTableNames.has(key)) {
      differences.push(`Missing table ${key}.`);
      continue;
    }

    const expectedColumns = snapshot.tables[key].columns ?? {};
    const actual = actualColumns.filter(
      (column) =>
        column.schema_name === table.schema &&
        column.table_name === table.tableName,
    );
    const actualByName = new Map(
      actual.map((column) => [column.column_name, column]),
    );

    for (const [columnName, expected] of Object.entries(expectedColumns)) {
      const actualColumn = actualByName.get(columnName);
      const columnKey = `${key}.${columnName}`;
      if (!actualColumn) {
        differences.push(`Missing column ${columnKey}.`);
        continue;
      }

      const expectedType = normalizeType(expected.type);
      const actualType = normalizeType(actualColumn.data_type);
      if (actualType !== expectedType) {
        differences.push(`Column ${columnKey} has a different type.`);
      }
      if (
        expected.typeSchema &&
        actualColumn.type_schema !== expected.typeSchema
      ) {
        differences.push(`Column ${columnKey} uses a different type schema.`);
      }
      if (Boolean(actualColumn.nullable) === Boolean(expected.notNull)) {
        differences.push(`Column ${columnKey} has different nullability.`);
      }
      if (
        normalizeDefault(actualColumn.default_value) !==
        normalizeDefault(expected.default)
      ) {
        differences.push(`Column ${columnKey} has a different default.`);
      }
      if (
        Boolean(actualColumn.is_primary_key) !== Boolean(expected.primaryKey)
      ) {
        differences.push(
          `Column ${columnKey} has different primary-key membership.`,
        );
      }
    }

    for (const columnName of actualByName.keys()) {
      if (!(columnName in expectedColumns)) {
        differences.push(`Unexpected column ${key}.${columnName}.`);
      }
    }
  }

  for (const tableName of actualTableNames) {
    if (!expectedTables.has(tableName)) {
      differences.push(`Unexpected table ${tableName}.`);
    }
  }
}

function compareIndexes(snapshot, actualRows, differences) {
  const expected = expectedIndexes(snapshot);
  const actual = new Map();
  for (const row of actualRows) {
    const key = objectKey(row.schema_name, row.table_name, row.index_name);
    actual.set(key, {
      schema: row.schema_name,
      tableName: row.table_name,
      name: row.index_name,
      unique: Boolean(row.is_unique),
      primary: Boolean(row.is_primary),
      method: row.method,
      valid: Boolean(row.is_valid),
      ready: Boolean(row.is_ready),
      predicate: row.predicate,
      options: Object.fromEntries(
        (row.options ?? []).map((option) => {
          const [name, value = ""] = option.split("=");
          return [name, value];
        }),
      ),
      columns:
        typeof row.columns === "string" ? JSON.parse(row.columns) : row.columns,
    });
  }

  for (const [key, expectedIndex] of expected) {
    const actualIndex = actual.get(key);
    if (!actualIndex) {
      differences.push(`Missing index ${key}.`);
      continue;
    }
    const expectedDetails = {
      unique: expectedIndex.unique,
      primary: expectedIndex.primary,
      method: expectedIndex.method,
      predicate: expectedIndex.predicate,
      options: expectedIndex.options,
      columns: expectedIndex.columns,
    };
    const actualDetails = {
      unique: actualIndex.unique,
      primary: actualIndex.primary,
      method: actualIndex.method,
      predicate: actualIndex.predicate,
      options: actualIndex.options,
      columns: actualIndex.columns,
    };
    if (stableJson(actualDetails) !== stableJson(expectedDetails)) {
      differences.push(`Index ${key} has different definition metadata.`);
    }
    if (!actualIndex.valid || !actualIndex.ready) {
      differences.push(`Index ${key} is not valid and ready.`);
    }
  }

  for (const key of actual.keys()) {
    if (!expected.has(key)) {
      differences.push(`Unexpected index ${key}.`);
    }
  }
}

function compareForeignKeys(snapshot, actualRows, differences) {
  const expected = expectedForeignKeys(snapshot);
  const actual = new Map(
    actualRows.map((row) => [
      objectKey(row.source_schema, row.source_table, row.name),
      {
        sourceSchema: row.source_schema,
        sourceTable: row.source_table,
        name: row.name,
        targetSchema: row.target_schema,
        targetTable: row.target_table,
        columnsFrom: row.columns_from,
        columnsTo: row.columns_to,
        onDelete: row.on_delete,
        onUpdate: row.on_update,
        deferrable: Boolean(row.deferrable),
        initiallyDeferred: Boolean(row.initially_deferred),
      },
    ]),
  );

  for (const [key, expectedForeignKey] of expected) {
    const actualForeignKey = actual.get(key);
    if (!actualForeignKey) {
      differences.push(`Missing foreign key ${key}.`);
      continue;
    }
    for (const property of Object.keys(expectedForeignKey)) {
      if (
        stableJson(actualForeignKey[property]) !==
        stableJson(expectedForeignKey[property])
      ) {
        differences.push(
          `Foreign key ${key} has different ${property} metadata.`,
        );
      }
    }
  }

  for (const key of actual.keys()) {
    if (!expected.has(key)) {
      differences.push(`Unexpected foreign key ${key}.`);
    }
  }
}

function compareCheckConstraints(snapshot, actualRows, differences) {
  const expected = expectedCheckConstraints(snapshot);
  const actual = new Map(
    actualRows.map((row) => [
      objectKey(row.schema_name, row.table_name, row.name),
      normalizeSqlExpression(row.expression),
    ]),
  );

  for (const [key, expectedExpression] of expected) {
    if (!actual.has(key)) {
      differences.push(`Missing check constraint ${key}.`);
      continue;
    }
    if (actual.get(key) !== expectedExpression) {
      differences.push(
        `Check constraint ${key} has different definition metadata.`,
      );
    }
  }

  for (const key of actual.keys()) {
    if (!expected.has(key)) {
      differences.push(`Unexpected check constraint ${key}.`);
    }
  }
}

function compareEnums(snapshot, actualRows, differences) {
  const expected = new Map(Object.entries(snapshot.enums));
  const actual = new Map(
    actualRows.map((row) => [
      `${row.schema_name}.${row.type_name}`,
      row.labels,
    ]),
  );
  for (const [key, enumType] of expected) {
    if (!actual.has(key)) {
      differences.push(`Missing enum ${key}.`);
      continue;
    }
    if (stableJson(actual.get(key)) !== stableJson(enumType.values)) {
      differences.push(`Enum ${key} has different labels or label order.`);
    }
  }
  for (const key of actual.keys()) {
    if (!expected.has(key)) {
      differences.push(`Unexpected enum ${key}.`);
    }
  }
}

/**
 * Compare Render's live public catalog with the Drizzle snapshot at the latest
 * applied migration. This function performs catalog reads only.
 */
export async function assertProductionSchemaMatchesSnapshot({
  pool,
  migrationsFolder,
}) {
  const { snapshot, snapshotName, migrationTag } =
    await readSnapshotAtCurrentPosition({ pool, migrationsFolder });
  const [
    tablesResult,
    columnsResult,
    indexesResult,
    foreignKeysResult,
    checkConstraintsResult,
    enumsResult,
  ] = await Promise.all([
    pool.query(tablesListQuery, [publicSchema]),
    pool.query(tablesQuery, [publicSchema]),
    pool.query(indexesQuery, [publicSchema]),
    pool.query(foreignKeysQuery, [publicSchema]),
    pool.query(checkConstraintsQuery, [publicSchema]),
    pool.query(enumsQuery, [publicSchema]),
  ]);

  const differences = [];
  compareTables(snapshot, tablesResult.rows, columnsResult.rows, differences);
  compareIndexes(snapshot, indexesResult.rows, differences);
  compareForeignKeys(snapshot, foreignKeysResult.rows, differences);
  compareCheckConstraints(snapshot, checkConstraintsResult.rows, differences);
  compareEnums(snapshot, enumsResult.rows, differences);

  if (differences.length > 0) {
    const displayedDifferences = differences.slice(0, 100);
    const remainingCount = differences.length - displayedDifferences.length;
    throw new Error(
      [
        `The live public schema differs from ${snapshotName} for migration "${migrationTag}"; no production migration was run.`,
        "Review the named catalog differences, explain or repair them with a reviewed migration, then rerun the preflight:",
        ...displayedDifferences.map((difference) => `- ${difference}`),
        ...(remainingCount > 0
          ? [`- ${remainingCount} additional difference(s) omitted.`]
          : []),
      ].join("\n"),
    );
  }
}
