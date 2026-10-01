import assert from "node:assert/strict";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  assertReleaseTagIsNewer,
  extractStableReleaseTags,
  findLatestStableTag,
} from "./check-release-version.mjs";

const scriptPath = fileURLToPath(
  new URL("./check-release-version.sh", import.meta.url),
);
const workflowPath = new URL(
  "../workflows/create-release.yml",
  import.meta.url,
);

function getPublishScript(workflow) {
  const publishStepStart = workflow.indexOf(
    "      - name: Publish every missing stable release in order\n",
  );
  assert.notEqual(
    publishStepStart,
    -1,
    "workflow must contain the publish step",
  );

  const nextStepStart = workflow.indexOf(
    "\n      - name:",
    publishStepStart + 1,
  );
  const publishStep = workflow.slice(
    publishStepStart,
    nextStepStart === -1 ? undefined : nextStepStart,
  );
  const runMarker = "        run: |\n";
  const runStart = publishStep.indexOf(runMarker);
  assert.notEqual(runStart, -1, "publish step must contain a shell script");

  const scriptLines = [];
  for (const line of publishStep
    .slice(runStart + runMarker.length)
    .split("\n")) {
    if (line.length > 0 && !line.startsWith("          ")) break;
    scriptLines.push(line.length === 0 ? "" : line.slice(10));
  }
  return scriptLines.join("\n");
}

function runPublishScript({ failCommand } = {}) {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "release-workflow-test-"));
  const binDir = path.join(tempDir, "bin");
  const runnerTemp = path.join(tempDir, "runner-temp");
  const commandLog = path.join(tempDir, "command-log");
  const releaseMarker = path.join(tempDir, "release-created");
  mkdirSync(binDir);
  mkdirSync(runnerTemp);

  const gitStub = path.join(binDir, "git");
  writeFileSync(
    gitStub,
    [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      'printf "git %s\\n" "$*" >> "$RELEASE_COMMAND_LOG"',
      'if [[ "$1" == "tag" ]]; then',
      '  printf "v1.2.4\\n"',
      'elif [[ "$1" == "worktree" && "$2" == "add" ]]; then',
      '  mkdir -p "$4"',
      'elif [[ "$1" == "worktree" && "$2" == "remove" ]]; then',
      '  rm -rf "$4"',
      "else",
      '  echo "unexpected git command: $*" >&2',
      "  exit 91",
      "fi",
      "",
    ].join("\n"),
  );
  chmodSync(gitStub, 0o755);

  const ghStub = path.join(binDir, "gh");
  writeFileSync(
    ghStub,
    [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      'printf "gh %s\\n" "$*" >> "$RELEASE_COMMAND_LOG"',
      'if [[ "$1" == "api" ]]; then',
      '  printf "[]\\n"',
      'elif [[ "$1" == "release" && "$2" == "view" ]]; then',
      "  exit 1",
      'elif [[ "$1" == "release" && "$2" == "create" ]]; then',
      '  touch "$RELEASE_MARKER"',
      "else",
      '  echo "unexpected gh command: $*" >&2',
      "  exit 92",
      "fi",
      "",
    ].join("\n"),
  );
  chmodSync(ghStub, 0o755);

  const pnpmStub = path.join(binDir, "pnpm");
  writeFileSync(
    pnpmStub,
    [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      'printf "pnpm %s\\n" "$*" >> "$RELEASE_COMMAND_LOG"',
      'if [[ "$1" == "${RELEASE_FAIL_COMMAND:-}" || "$2" == "${RELEASE_FAIL_COMMAND:-}" ]]; then',
      "  exit 19",
      "fi",
      "",
    ].join("\n"),
  );
  chmodSync(pnpmStub, 0o755);

  try {
    const workflow = readFileSync(workflowPath, "utf8");
    const result = spawnSync(
      "bash",
      ["--noprofile", "--norc", "-e", "-o", "pipefail"],
      {
        cwd: path.resolve(
          path.dirname(fileURLToPath(import.meta.url)),
          "../..",
        ),
        encoding: "utf8",
        input: getPublishScript(workflow),
        env: {
          ...process.env,
          PATH: `${binDir}${path.delimiter}${process.env.PATH}`,
          RUNNER_TEMP: runnerTemp,
          GITHUB_REPOSITORY: "example/repo",
          RELEASE_COMMAND_LOG: commandLog,
          RELEASE_MARKER: releaseMarker,
          RELEASE_FAIL_COMMAND: failCommand ?? "",
        },
      },
    );

    return {
      ...result,
      commands: readFileSync(commandLog, "utf8").trim().split("\n"),
      published: existsSync(releaseMarker),
    };
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function runReleaseCheck(candidateTag, { pages, failLookup = false }) {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "release-version-test-"));
  const ghPath = path.join(tempDir, "gh");
  const callLogPath = path.join(tempDir, "gh-call-args");
  const responsePath = path.join(tempDir, "gh-response.json");

  writeFileSync(
    ghPath,
    [
      "#!/usr/bin/env bash",
      "printf '%s\\0' \"$@\" > \"$GH_CALL_LOG\"",
      'if [[ "${GH_FAIL_LOOKUP:-0}" == "1" ]]; then',
      '  echo "simulated GitHub release lookup failure" >&2',
      "  exit 17",
      "fi",
      'cat "$GH_RESPONSE_FILE"',
      "",
    ].join("\n"),
  );
  chmodSync(ghPath, 0o755);
  writeFileSync(responsePath, JSON.stringify(pages));

  try {
    const result = spawnSync("bash", [scriptPath, candidateTag], {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${tempDir}${path.delimiter}${process.env.PATH}`,
        GITHUB_REPOSITORY: "example/repo",
        GH_CALL_LOG: callLogPath,
        GH_RESPONSE_FILE: responsePath,
        GH_FAIL_LOOKUP: failLookup ? "1" : "0",
      },
    });

    const ghArgs = readFileSync(callLogPath, "utf8")
      .split("\0")
      .filter(Boolean);
    return { ...result, ghArgs };
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

test("accepts a patch upgrade", () => {
  assert.doesNotThrow(() =>
    assertReleaseTagIsNewer("v1.2.4", ["v1.2.3", "v1.1.9"]),
  );
});

test("orders minor and major components numerically", () => {
  assert.doesNotThrow(() =>
    assertReleaseTagIsNewer("v2.0.0", ["v1.99.99", "v1.10.0"]),
  );
  assert.equal(
    findLatestStableTag(["v2.0.0", "v10.0.0", "v3.25.8"]),
    "v10.0.0",
  );
});

test("uses the highest stable version regardless of release-list order", () => {
  assert.equal(
    findLatestStableTag(["v3.0.0", "v1.20.0", "v2.99.99"]),
    "v3.0.0",
  );
});

test("rejects a duplicate version", () => {
  assert.throws(
    () => assertReleaseTagIsNewer("v1.2.3", ["v1.2.3"]),
    /must be newer than the latest stable release v1\.2\.3/,
  );
});

test("rejects a lower version", () => {
  assert.throws(
    () => assertReleaseTagIsNewer("v1.9.9", ["v1.10.0"]),
    /must be newer than the latest stable release v1\.10\.0/,
  );
});

test("rejects malformed candidate versions", () => {
  for (const tag of [
    "1.2.3",
    "v1.2",
    "v01.2.3",
    "v1.2.3-rc.1",
    "v1.2.3+build.1",
  ]) {
    assert.throws(
      () => assertReleaseTagIsNewer(tag, ["v1.2.3"]),
      /Release tags must use vMAJOR\.MINOR\.PATCH/,
    );
  }
});

test("ignores prerelease and non-version tags when finding stable releases", () => {
  assert.equal(
    findLatestStableTag(["v20.0.0-rc.1", "latest", "v1.2.3"]),
    "v1.2.3",
  );
  assert.doesNotThrow(() =>
    assertReleaseTagIsNewer("v1.2.4", ["v20.0.0-rc.1", "v1.2.3"]),
  );
});

test("filters prereleases from release pages", () => {
  assert.deepEqual(
    extractStableReleaseTags([
      [
        { tag_name: "v1.2.3", prerelease: false },
        { tag_name: "v99.0.0-rc.1", prerelease: true },
      ],
      [{ tag_name: "v1.10.0", prerelease: false }],
    ]),
    ["v1.2.3", "v1.10.0"],
  );
});

test("checks stable releases across all paginated GitHub release pages", () => {
  const pages = [
    [
      { tag_name: "v1.5.0", prerelease: false },
      { tag_name: "v99.0.0-rc.1", prerelease: true },
    ],
    [{ tag_name: "v1.10.0", prerelease: false }],
  ];

  const olderTag = runReleaseCheck("v1.9.9", { pages });
  assert.equal(olderTag.status, 1, olderTag.stderr);
  assert.match(
    olderTag.stderr,
    /must be newer than the latest stable release v1\.10\.0/,
  );
  assert.deepEqual(olderTag.ghArgs, [
    "api",
    "--paginate",
    "--slurp",
    "repos/example/repo/releases?per_page=100",
  ]);

  const upgrade = runReleaseCheck("v1.10.1", { pages });
  assert.equal(upgrade.status, 0, upgrade.stderr);
  assert.match(upgrade.stdout, /newer than the latest stable release v1\.10\.0/);
});

test("fails closed on malformed GitHub release page structures", () => {
  const invalidResponses = [
    {
      pages: { releases: [[{ tag_name: "v2.0.0", prerelease: false }]] },
      error: /must return an array of pages/,
    },
    {
      pages: [[{ tag_name: "v2.0.0", prerelease: false }], null],
      error: /returned an invalid page/,
    },
    {
      pages: [[{ tag_name: "v2.0.0", prerelease: false }], { releases: [] }],
      error: /returned an invalid page/,
    },
  ];

  for (const { pages, error } of invalidResponses) {
    const result = runReleaseCheck("v1.9.9", { pages });

    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, error);
    assert.equal(result.stdout, "");
  }
});

test("fails closed when GitHub release entries are missing required metadata", () => {
  const invalidReleases = [
    { tag_name: "v2.0.0" },
    { prerelease: false },
    { tag_name: "v2.0.0", prerelease: "false" },
    { tag_name: 2, prerelease: false },
  ];

  for (const invalidRelease of invalidReleases) {
    const result = runReleaseCheck("v1.9.9", {
      pages: [
        [{ tag_name: "v2.0.0", prerelease: false }],
        [invalidRelease],
      ],
    });

    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /returned an invalid release/);
    assert.equal(result.stdout, "");
  }
});

test("fails the release check when the GitHub release lookup fails", () => {
  const result = runReleaseCheck("v1.0.0", {
    pages: [],
    failLookup: true,
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /simulated GitHub release lookup failure/);
});

test("runs the release check before the publication step", () => {
  const workflow = readFileSync(workflowPath, "utf8");
  const publishScript = getPublishScript(workflow);
  const checkIndex = workflow.indexOf(
    'bash .github/scripts/check-release-version.sh "$candidate_tag"',
  );
  const publishIndex = workflow.indexOf(
    'gh release create "$candidate_tag" --verify-tag --generate-notes',
  );

  assert.notEqual(checkIndex, -1, "workflow must run the tested release check");
  assert.ok(
    publishIndex > checkIndex,
    "release check must run before publishing the release",
  );
  assert.match(workflow, /fetch-depth: 0/);
  assert.match(workflow, /git tag --list 'v\*'/);
  assert.match(workflow, /sort -V/);
  assert.match(workflow, /for candidate_tag in "\$\{release_tags\[@\]\}"/);
  const requiredChecks = [
    "pnpm install --frozen-lockfile",
    "pnpm run typecheck",
    "pnpm run build",
    'gh release create "$candidate_tag" --verify-tag --generate-notes',
  ];
  const checkPositions = requiredChecks.map((command) =>
    publishScript.indexOf(command),
  );
  assert.ok(
    checkPositions.every(
      (position, index) =>
        position !== -1 &&
        (index === 0 || position > checkPositions[index - 1]),
    ),
    "install, typecheck, and build must all appear before release publication",
  );
  assert.match(
    publishScript,
    /cd "\$build_dir" &&\s*pnpm install --frozen-lockfile &&\s*pnpm run typecheck &&\s*pnpm run build/,
    "each pre-publication check must stop the chain when it fails",
  );
  assert.match(workflow, /gh release view "\$candidate_tag"/);
  assert.ok(
    workflow.indexOf("Reject a malformed triggering tag") >
      workflow.indexOf("Publish every missing stable release in order"),
    "a malformed trigger must not stop this run from reconciling stable tags",
  );
});

test("does not publish if install, typecheck, or build fails", () => {
  for (const failedCheck of ["install", "typecheck", "build"]) {
    const result = runPublishScript({ failCommand: failedCheck });
    assert.equal(result.status, 1, result.stderr);
    assert.equal(
      result.published,
      false,
      `release must not publish when ${failedCheck} fails`,
    );
    assert.ok(
      !result.commands.some((command) =>
        command.startsWith("gh release create "),
      ),
      `publish command must not run when ${failedCheck} fails`,
    );

    const expectedPnpmCommand =
      failedCheck === "install"
        ? "pnpm install --frozen-lockfile"
        : `pnpm run ${failedCheck}`;
    const failedCommandIndex = result.commands.indexOf(expectedPnpmCommand);
    assert.notEqual(
      failedCommandIndex,
      -1,
      `${failedCheck} must run; commands: ${JSON.stringify(result.commands)}; stderr: ${result.stderr}`,
    );
    assert.ok(
      !result.commands
        .slice(failedCommandIndex + 1)
        .some((command) => command.startsWith("pnpm ")),
      `later package checks must not run after ${failedCheck} fails`,
    );
  }

  const successfulBuild = runPublishScript();
  assert.equal(successfulBuild.status, 0, successfulBuild.stderr);
  assert.equal(successfulBuild.published, true);
});

test("accepts a first stable release", () => {
  assert.doesNotThrow(() => assertReleaseTagIsNewer("v0.1.0", []));
});
