import assert from "node:assert/strict";
import test from "node:test";
import {
  assertReleaseTagIsNewer,
  findLatestStableTag,
} from "./check-release-version.mjs";

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

test("accepts a first stable release", () => {
  assert.doesNotThrow(() => assertReleaseTagIsNewer("v0.1.0", []));
});