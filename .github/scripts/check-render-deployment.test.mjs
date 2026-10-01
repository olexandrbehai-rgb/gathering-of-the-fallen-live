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
const workflowPath = new URL(
  "../workflows/check-render-deployment.yml",
  import.meta.url,
);
const serviceUrl = "https://render.example.test";
const expectedEndpoints = [`${serviceUrl}/`, `${serviceUrl}/api/healthz`];
const failureStepName = "Open or update the Render availability issue";
const recoveryStepName = "Comment on and close the Render availability issue";
const outageTitle = "[Render availability] deployment check failed";
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

function getWorkflowStep(name) {
  const workflow = readFileSync(workflowPath, "utf8");
  const marker = `      - name: ${name}\n`;
  const start = workflow.indexOf(marker);
  assert.notEqual(start, -1, `Workflow step "${name}" should exist`);
  const afterMarker = start + marker.length;
  const nextStep = workflow.indexOf("\n      - name: ", afterMarker);
  const step = workflow.slice(
    afterMarker,
    nextStep === -1 ? undefined : nextStep,
  );
  const condition = step.match(/^        if: (.+)$/m)?.[1];
  const scriptMarker = "          script: |\n";
  const scriptStart = step.indexOf(scriptMarker);
  assert.notEqual(
    scriptStart,
    -1,
    `Workflow step "${name}" should have a script`,
  );
  const scriptLines = step.slice(scriptStart + scriptMarker.length).split("\n");
  const script = [];
  for (const line of scriptLines) {
    if (!line.trim()) {
      script.push("");
    } else if (line.startsWith("            ")) {
      script.push(line.slice(12));
    } else {
      break;
    }
  }
  return { condition, script: script.join("\n") };
}

function stepRuns(step, smokeTestResult) {
  assert.ok(
    step.condition,
    "Alert steps should have explicit result conditions",
  );
  const expression = step.condition.replace(
    /needs\.smoke-test\.result/g,
    JSON.stringify(smokeTestResult),
  );
  return new Function(`return (${expression});`)();
}

async function runWorkflowStep(
  step,
  { issueList = [], failedEndpointDetails = "" } = {},
) {
  const calls = [];
  const github = {
    rest: {
      issues: {
        listForRepo: async (options) => {
          calls.push({ method: "listForRepo", options });
          return { data: issueList };
        },
        create: async (options) => {
          calls.push({ method: "create", options });
          return { data: { number: 42 } };
        },
        createComment: async (options) => {
          calls.push({ method: "createComment", options });
          return { data: {} };
        },
        update: async (options) => {
          calls.push({ method: "update", options });
          return { data: {} };
        },
      },
    },
    paginate: async (method, options) => {
      calls.push({ method: "paginate", options });
      return issueList;
    },
  };
  const context = {
    serverUrl: "https://github.com",
    repo: { owner: "example", repo: "service" },
    runId: 123,
    sha: "abc123",
  };
  const core = { info: (message) => calls.push({ method: "info", message }) };
  const process = {
    env: { FAILED_ENDPOINT_DETAILS: failedEndpointDetails },
  };
  await new AsyncFunction("github", "context", "core", "process", step.script)(
    github,
    context,
    core,
    process,
  );
  return calls;
}

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
status_code=200
exit_code=0
if [[ "$CURL_MODE" == "exhausted" ]]; then
  status_code=503
  exit_code=22
elif [[ "$CURL_MODE" == "changing-status" ]]; then
  if [[ "$call_count" -eq 59 ]]; then
    status_code=502
  elif [[ "$call_count" -eq 60 ]]; then
    status_code=504
  else
    status_code=503
  fi
  exit_code=22
elif [[ "$CURL_MODE" == "homepage-exhausted" ]] && [[ "$url" == */ ]]; then
  status_code=503
  exit_code=22
elif [[ "$CURL_MODE" == "health-exhausted" ]] && [[ "$url" == */api/healthz ]]; then
  status_code=502
  exit_code=22
elif [[ "$CURL_MODE" == "transport-exhausted" ]]; then
  status_code=000
  exit_code=7
elif [[ "$CURL_MODE" == "retry" ]] && [[ "$call_count" -eq 2 ]]; then
  status_code=503
  exit_code=22
fi
printf '%s' "$status_code"
exit "$exit_code"
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

test("rejects malformed HTTPS service URLs before making any curl calls", () => {
  for (const serviceUrl of [
    "https://",
    "https://?query",
    "https://#fragment",
    "https://:443",
  ]) {
    const { result, requestedEndpoints, sleeps } = runSmokeCheck("success", {
      serviceUrl,
    });

    assert.equal(result.status, 1, serviceUrl);
    assert.match(
      result.stdout,
      /RENDER_SERVICE_URL must be a valid absolute HTTPS URL with a hostname/,
    );
    assert.deepEqual(requestedEndpoints, [], serviceUrl);
    assert.deepEqual(sleeps, [], serviceUrl);
  }
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
  assert.deepEqual(requestedEndpoints, [
    ...expectedEndpoints,
    ...expectedEndpoints,
  ]);
  assert.deepEqual(sleeps, ["30"]);
  assert.match(result.stdout, /health endpoint is not ready/);
  assert.match(
    result.stdout,
    /Attempt 2\/30: health endpoint returned success/,
  );
});

test("fails after exhausting retries and continues checking both endpoints", () => {
  const { result, requestedEndpoints, sleeps, outputs } =
    runSmokeCheck("exhausted");
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
  assert.deepEqual(outputs, [
    "failed_endpoint_details=homepage: HTTP 503,health endpoint: HTTP 503",
  ]);
});

test("reports the final HTTP status for only the homepage when it remains unavailable", () => {
  const { result, outputs } = runSmokeCheck("homepage-exhausted");

  assert.equal(result.status, 1);
  assert.deepEqual(outputs, ["failed_endpoint_details=homepage: HTTP 503"]);
});

test("reports the final HTTP status for only the health endpoint when it remains unavailable", () => {
  const { result, outputs } = runSmokeCheck("health-exhausted");

  assert.equal(result.status, 1);
  assert.deepEqual(outputs, ["failed_endpoint_details=health endpoint: HTTP 502"]);
});

test("reports transport failures without exposing endpoint URLs", () => {
  const { result, outputs } = runSmokeCheck("transport-exhausted");

  assert.equal(result.status, 1);
  assert.deepEqual(outputs, [
    "failed_endpoint_details=homepage: transport failure,health endpoint: transport failure",
  ]);
  assert.equal(outputs.join("\n").includes(serviceUrl), false);
});

test("records each endpoint's status from the final retry attempt", () => {
  const { result, outputs } = runSmokeCheck("changing-status");

  assert.equal(result.status, 1);
  assert.deepEqual(outputs, [
    "failed_endpoint_details=homepage: HTTP 502,health endpoint: HTTP 504",
  ]);
});

test("opens a Render outage issue when a failed check has no matching open issue", async () => {
  const step = getWorkflowStep(failureStepName);
  const calls = await runWorkflowStep(step, {
    failedEndpointDetails: "homepage: HTTP 503,health endpoint: HTTP 502",
  });

  assert.equal(stepRuns(step, "failure"), true);
  assert.deepEqual(
    calls.map(({ method }) => method),
    ["paginate", "create", "info"],
  );
  assert.deepEqual(calls[1].options, {
    owner: "example",
    repo: "service",
    title: outageTitle,
    body: [
      "The Render deployment availability check failed. Endpoints still failing after retries: homepage (HTTP 503), health endpoint (HTTP 502)",
      "",
      "Workflow run: https://github.com/example/service/actions/runs/123",
      "Commit: abc123",
    ].join("\n"),
  });
  assert.equal(calls[1].options.body.includes(serviceUrl), false);
  assert.equal(calls[1].options.body.includes("credential"), false);
});

test("comments on the existing outage issue when a failed check repeats", async () => {
  const step = getWorkflowStep(failureStepName);
  const calls = await runWorkflowStep(step, {
    issueList: [
      { number: 18, title: outageTitle },
      {
        number: 19,
        title: outageTitle,
        pull_request: { url: "https://example.test/pr" },
      },
    ],
    failedEndpointDetails: "health endpoint: transport failure",
  });

  assert.equal(stepRuns(step, "failure"), true);
  assert.deepEqual(
    calls.map(({ method }) => method),
    ["paginate", "createComment", "info"],
  );
  assert.equal(calls[1].options.issue_number, 18);
  assert.match(calls[1].options.body, /health endpoint \(transport failure\)/);
  assert.equal(calls[1].options.body.includes("Workflow run:"), true);
});

test("ignores unsafe endpoint details before writing an outage issue", async () => {
  const step = getWorkflowStep(failureStepName);
  const calls = await runWorkflowStep(step, {
    failedEndpointDetails:
      `homepage: HTTP 503,health endpoint: transport failure,${serviceUrl}: credential`,
  });
  const body = calls.find(({ method }) => method === "create").options.body;

  assert.match(body, /homepage \(HTTP 503\), health endpoint \(transport failure\)/);
  assert.equal(body.includes(serviceUrl), false);
  assert.equal(body.includes("credential"), false);
});

test("comments on and closes the matching outage issue after recovery", async () => {
  const step = getWorkflowStep(recoveryStepName);
  const calls = await runWorkflowStep(step, {
    issueList: [
      { number: 21, title: "Another issue" },
      { number: 22, title: outageTitle },
      {
        number: 23,
        title: outageTitle,
        pull_request: { url: "https://example.test/pr" },
      },
    ],
  });

  assert.equal(stepRuns(step, "success"), true);
  assert.deepEqual(
    calls.map(({ method }) => method),
    ["paginate", "createComment", "update", "info"],
  );
  assert.equal(calls[1].options.issue_number, 22);
  assert.match(calls[1].options.body, /responding successfully again/);
  assert.equal(calls[2].options.issue_number, 22);
  assert.equal(calls[2].options.state, "closed");
  assert.equal(calls[2].options.state_reason, "completed");
});

test("a successful check with no open outage issue does nothing beyond looking for one", async () => {
  const step = getWorkflowStep(recoveryStepName);
  const calls = await runWorkflowStep(step);

  assert.equal(stepRuns(step, "success"), true);
  assert.deepEqual(
    calls.map(({ method }) => method),
    ["paginate", "info"],
  );
  assert.match(calls[1].message, /No open Render availability issue to close/);
});

test("a successful check skips the failure alert and runs only recovery handling", async () => {
  const failureStep = getWorkflowStep(failureStepName);
  const recoveryStep = getWorkflowStep(recoveryStepName);
  const failureCalls = stepRuns(failureStep, "success")
    ? await runWorkflowStep(failureStep)
    : [];
  const recoveryCalls = stepRuns(recoveryStep, "success")
    ? await runWorkflowStep(recoveryStep)
    : [];

  assert.equal(stepRuns(failureStep, "failure"), true);
  assert.equal(stepRuns(recoveryStep, "failure"), false);
  assert.deepEqual(failureCalls, []);
  assert.deepEqual(
    recoveryCalls.map(({ method }) => method),
    ["paginate", "info"],
  );
});

test("serializes push and manual checks through the incident update", () => {
  const workflow = readFileSync(workflowPath, "utf8");

  assert.match(workflow, /^on:\n  push:\n/m);
  assert.match(workflow, /^  workflow_dispatch:\n/m);
  assert.match(
    workflow,
    /^concurrency:\n  group: render-deployment-availability-\$\{\{ github\.repository \}\}$/m,
  );
  assert.match(workflow, /^  cancel-in-progress: false$/m);
});
