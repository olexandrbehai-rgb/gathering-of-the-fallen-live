import assert from "node:assert/strict";
import {
  chmodSync,
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

test("fails the release check when the GitHub release lookup fails", () => {
  const result = runReleaseCheck("v1.0.0", {
    pages: [],
    failLookup: true,
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /simulated GitHub release lookup failure/);
});

test("runs the release check before the publication step", () => {
  const workflow = readFileSync(
    new URL("../workflows/create-release.yml", import.meta.url),
    "utf8",
  );
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
  assert.match(workflow, /pnpm run typecheck[\s\S]*pnpm run build/);
  assert.match(workflow, /gh release view "\$candidate_tag"/);
  assert.ok(
    workflow.indexOf("Reject a malformed triggering tag") >
      workflow.indexOf("Publish every missing stable release in order"),
    "a malformed trigger must not stop this run from reconciling stable tags",
  );
});

test("accepts a first stable release", () => {
  assert.doesNotThrow(() => assertReleaseTagIsNewer("v0.1.0", []));
});
