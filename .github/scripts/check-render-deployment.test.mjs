import assert from "node:assert/strict";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const scriptPath = new URL("./check-render-deployment.sh", import.meta.url);
const serviceUrl = "https://render.example.test";
const expectedEndpoints = [
  `${serviceUrl}/`,
  `${serviceUrl}/api/healthz`,
];

function runSmokeCheck(mode, options = {}) {
  const configuredServiceUrl = Object.hasOwn(options, "serviceUrl")
    ? options.serviceUrl
    : serviceUrl;
  const tempDirectory = mkdtempSync(join(tmpdir(), "render-smoke-test-"));
  const binDirectory = join(tempDirectory, "bin");
  mkdirSync(binDirectory);
  const curlLog = join(tempDirectory, "curl.log");
  const sleepLog = join(tempDirectory, "sleep.log");
  const outputPath = join(tempDirectory, "github-output");
  const curlPath = join(binDirectory, "curl");
  const sleepPath = join(binDirectory, "sleep");
  writeFileSync(outputPath, "");

  writeFileSync(
    curlPath,
    `#!/usr/bin/env bash
set -euo pipefail
url="\${!#}"
printf '%s\\n' "$url" >> "$CURL_LOG"
call_count=$(wc -l < "$CURL_LOG")
if [[ "$CURL_MODE" == "exhausted" ]] ||
  { [[ "$CURL_MODE" == "homepage-exhausted" ]] && [[ "$url" == */ ]]; } ||
  { [[ "$CURL_MODE" == "health-exhausted" ]] && [[ "$url" == */api/healthz ]]; } ||
  { [[ "$CURL_MODE" == "retry" ]] && [[ "$call_count" -eq 2 ]]; }; then
  exit 22
fi
`,
  );
  writeFileSync(
    sleepPath,
    `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$SLEEP_LOG"
`,
  );
  chmodSync(curlPath, 0o755);
  chmodSync(sleepPath, 0o755);

  const env = {
    ...process.env,
    PATH: `${binDirectory}:${process.env.PATH}`,
    CURL_LOG: curlLog,
    SLEEP_LOG: sleepLog,
    CURL_MODE: mode,
    GITHUB_OUTPUT: outputPath,
  };
  if (configuredServiceUrl === null) {
    delete env.RENDER_SERVICE_URL;
  } else {
    env.RENDER_SERVICE_URL = configuredServiceUrl;
  }

  const result = spawnSync("bash", [scriptPath.pathname], {
    encoding: "utf8",
    env,
    timeout: 30_000,
  });

  const readLines = (path) => {
    try {
      return readFileSync(path, "utf8").trim().split("\n").filter(Boolean);
    } catch (error) {
      if (error.code === "ENOENT") return [];
      throw error;
    }
  };

  return {
    result,
    requestedEndpoints: readLines(curlLog),
    sleeps: readLines(sleepLog),
    outputs: readLines(outputPath),
  };
}

test("fails with a clear error when RENDER_SERVICE_URL is missing", () => {
  const { result, requestedEndpoints, sleeps } = runSmokeCheck("success", {
    serviceUrl: null,
  });

  assert.equal(result.status, 1);
  assert.match(result.stdout, /Set the non-secret RENDER_SERVICE_URL/);
  assert.deepEqual(requestedEndpoints, []);
  assert.deepEqual(sleeps, []);
});

test("rejects an HTTP service URL before making any curl calls", () => {
  const { result, requestedEndpoints, sleeps } = runSmokeCheck("success", {
    serviceUrl: "http://render.example.test",
  });

  assert.equal(result.status, 1);
  assert.match(result.stdout, /RENDER_SERVICE_URL must be an HTTPS base URL/);
  assert.deepEqual(requestedEndpoints, []);
  assert.deepEqual(sleeps, []);
});

test("succeeds when the homepage and health endpoint are healthy", () => {
  const { result, requestedEndpoints, sleeps } = runSmokeCheck("success");

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(requestedEndpoints, expectedEndpoints);
  assert.deepEqual(sleeps, []);
  assert.match(result.stdout, /responding successfully/);
});

test("retries both endpoints when either endpoint is not ready", () => {
  const { result, requestedEndpoints, sleeps } = runSmokeCheck("retry");

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(requestedEndpoints, [...expectedEndpoints, ...expectedEndpoints]);
  assert.deepEqual(sleeps, ["30"]);
  assert.match(result.stdout, /health endpoint is not ready/);
  assert.match(result.stdout, /Attempt 2\/30: health endpoint returned success/);
});

test("fails after exhausting retries and continues checking both endpoints", () => {
  const { result, requestedEndpoints, sleeps, outputs } = runSmokeCheck("exhausted");
  const attemptedEndpointPairs = Array.from(
    { length: requestedEndpoints.length / expectedEndpoints.length },
    (_, attempt) =>
      requestedEndpoints.slice(
        attempt * expectedEndpoints.length,
        (attempt + 1) * expectedEndpoints.length,
      ),
  );

  assert.equal(result.status, 1);
  assert.equal(attemptedEndpointPairs.length, 30);
  assert.deepEqual(
    attemptedEndpointPairs,
    Array.from({ length: 30 }, () => expectedEndpoints),
  );
  assert.equal(sleeps.length, 29);
  assert.match(result.stdout, /did not both return success after 30 attempts/);
  assert.deepEqual(outputs, ["failed_endpoints=homepage,health endpoint"]);
});

test("reports only the homepage when it remains unavailable after retries", () => {
  const { result, outputs } = runSmokeCheck("homepage-exhausted");

  assert.equal(result.status, 1);
  assert.deepEqual(outputs, ["failed_endpoints=homepage"]);
});

test("reports only the health endpoint when it remains unavailable after retries", () => {
  const { result, outputs } = runSmokeCheck("health-exhausted");

  assert.equal(result.status, 1);
  assert.deepEqual(outputs, ["failed_endpoints=health endpoint"]);
});