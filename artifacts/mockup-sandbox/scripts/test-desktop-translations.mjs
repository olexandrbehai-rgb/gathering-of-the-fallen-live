import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";

const packageRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const previewRoot = path.join(
  packageRoot,
  "src/components/mockups/gofl-current",
);
const previewFiles = [
  "_shared.tsx",
  "CurrentSessions.tsx",
  "CurrentSubmit.tsx",
  "CurrentHost.tsx",
  "CurrentLive.tsx",
].map((file) => path.join(previewRoot, file));
const locales = ["en", "fr", "ua"];

function getPropertyName(property) {
  if (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) {
    return property.name.text;
  }
  return undefined;
}

function getObjectProperties(objectLiteral) {
  return new Map(
    objectLiteral.properties
      .filter(ts.isPropertyAssignment)
      .map((property) => [getPropertyName(property), property.initializer])
      .filter(([name]) => name !== undefined),
  );
}

function findVariableInitializer(sourceFile, variableName) {
  let initializer;
  const visit = (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === variableName
    ) {
      initializer = node.initializer;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return initializer;
}

function getTranslationCatalogs(sourceFile) {
  const initializer = findVariableInitializer(sourceFile, "translations");
  assert.ok(
    initializer && ts.isObjectLiteralExpression(initializer),
    "Could not find the translations dictionary in _shared.tsx",
  );

  const catalogs = new Map();
  for (const [locale, catalog] of getObjectProperties(initializer)) {
    assert.ok(
      ts.isObjectLiteralExpression(catalog),
      `Expected the ${locale} translations to be an object literal`,
    );
    catalogs.set(
      locale,
      new Map(
        [...getObjectProperties(catalog)].map(([key, value]) => [
          key,
          ts.isStringLiteralLike(value) ? value.text : undefined,
        ]),
      ),
    );
  }
  return catalogs;
}

function stringLiteralValues(type) {
  if (type.isUnion()) {
    return type.types.flatMap(stringLiteralValues);
  }
  return type.flags & ts.TypeFlags.StringLiteral ? [type.value] : [];
}

function getCallTranslationKeys(sourceFile, checker) {
  const keys = new Set();
  const unresolved = [];

  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      (node.expression.text === "t" || node.expression.text === "translate")
    ) {
      const keyArgument =
        node.expression.text === "translate" ? node.arguments[1] : node.arguments[0];

      const isLanguageProviderForwarder =
        node.expression.text === "translate" &&
        sourceFile.fileName.endsWith(`${path.sep}_shared.tsx`) &&
        keyArgument &&
        ts.isIdentifier(keyArgument) &&
        keyArgument.text === "key" &&
        ts.isArrowFunction(node.parent);

      if (isLanguageProviderForwarder) {
        ts.forEachChild(node, visit);
        return;
      }

      if (!keyArgument) {
        unresolved.push(
          `${sourceFile.fileName}:${sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1}: missing translation-key argument`,
        );
      } else {
        const values = stringLiteralValues(checker.getTypeAtLocation(keyArgument));
        if (values.length === 0) {
          const line =
            sourceFile.getLineAndCharacterOfPosition(keyArgument.getStart()).line + 1;
          unresolved.push(
            `${sourceFile.fileName}:${line}: cannot determine translation keys for "${keyArgument.getText(sourceFile)}"`,
          );
        }
        for (const value of values) keys.add(value);
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return { keys, unresolved };
}

async function loadTranslationCoverage() {
  const configPath = path.join(packageRoot, "tsconfig.json");
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  assert.equal(config.error, undefined, `Could not read ${configPath}`);
  const parsedConfig = ts.parseJsonConfigFileContent(
    config.config,
    ts.sys,
    packageRoot,
  );
  const program = ts.createProgram(parsedConfig.fileNames, parsedConfig.options);
  const checker = program.getTypeChecker();
  const sharedFile = previewFiles[0];
  const sharedSource = program.getSourceFile(sharedFile);
  assert.ok(sharedSource, `Could not load ${sharedFile} in the TypeScript program`);

  const catalogs = getTranslationCatalogs(sharedSource);
  const usedKeys = new Set();
  const unresolved = [];

  for (const file of previewFiles) {
    const sourceFile = program.getSourceFile(file);
    assert.ok(sourceFile, `Could not load ${file} in the TypeScript program`);
    const coverage = getCallTranslationKeys(sourceFile, checker);
    for (const key of coverage.keys) usedKeys.add(key);
    unresolved.push(...coverage.unresolved);
  }

  return { catalogs, usedKeys, unresolved };
}

test("shared Gathering of the Fallen catalogs have identical key sets", async () => {
  const { catalogs } = await loadTranslationCoverage();
  const catalogKeys = new Set();

  for (const locale of locales) {
    const catalog = catalogs.get(locale);
    assert.ok(catalog, `Missing translation catalog for locale "${locale}"`);
    for (const key of catalog.keys()) catalogKeys.add(key);
  }

  const missing = [];
  for (const locale of locales) {
    const catalog = catalogs.get(locale);
    for (const key of catalogKeys) {
      if (!catalog.has(key)) {
        missing.push(`Missing translation for locale "${locale}" key "${key}"`);
      }
    }
  }

  assert.deepEqual(missing, [], missing.join("\n"));
});

test("desktop French and Ukrainian translations are non-empty", async () => {
  const { catalogs, usedKeys, unresolved } = await loadTranslationCoverage();

  assert.deepEqual(
    unresolved,
    [],
    `Every dynamic translation call must have statically known string-literal keys:\n${unresolved.join("\n")}`,
  );
  assert.ok(usedKeys.size > 0, "No translation calls were found in the desktop previews");

  const blank = [];
  for (const locale of ["fr", "ua"]) {
    const catalog = catalogs.get(locale);
    assert.ok(catalog, `Missing translation catalog for locale "${locale}"`);
    for (const key of usedKeys) {
      const value = catalog.get(key);
      if (typeof value !== "string" || value.trim().length === 0) {
        blank.push(`Blank translation for locale "${locale}" key "${key}"`);
      }
    }
  }

  assert.deepEqual(blank, [], blank.join("\n"));
});

test("desktop Gathering of the Fallen previews have every translation key", async () => {
  const { catalogs, usedKeys, unresolved } = await loadTranslationCoverage();

  assert.deepEqual(
    unresolved,
    [],
    `Every dynamic translation call must have statically known string-literal keys:\n${unresolved.join("\n")}`,
  );
  assert.ok(usedKeys.size > 0, "No translation calls were found in the desktop previews");

  const missing = [];
  for (const locale of locales) {
    const catalog = catalogs.get(locale);
    assert.ok(catalog, `Missing translation catalog for locale "${locale}"`);
    for (const key of usedKeys) {
      if (!catalog.has(key)) {
        missing.push(`Missing translation for locale "${locale}" key "${key}"`);
      }
    }
  }

  assert.deepEqual(missing, [], missing.join("\n"));
});