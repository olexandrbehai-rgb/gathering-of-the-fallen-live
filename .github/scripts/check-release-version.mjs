import { pathToFileURL } from "node:url";

const STABLE_TAG_PATTERN =
  /^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;

function parseStableTag(tag) {
  const match = STABLE_TAG_PATTERN.exec(tag);
  if (!match) return null;

  return {
    tag,
    version: match.slice(1).map((part) => BigInt(part)),
  };
}

function compareVersions(left, right) {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] > right[index]) return 1;
    if (left[index] < right[index]) return -1;
  }

  return 0;
}

export function findLatestStableTag(tags) {
  let latest = null;

  for (const tag of tags) {
    const parsed = parseStableTag(tag);
    if (!parsed) continue;

    if (!latest || compareVersions(parsed.version, latest.version) > 0) {
      latest = parsed;
    }
  }

  return latest?.tag ?? null;
}

export function assertReleaseTagIsNewer(candidateTag, existingTags) {
  const candidate = parseStableTag(candidateTag);
  if (!candidate) {
    throw new Error(
      "Release tags must use vMAJOR.MINOR.PATCH, for example v1.2.3.",
    );
  }

  const latestTag = findLatestStableTag(existingTags);
  if (!latestTag) return;

  const latest = parseStableTag(latestTag);
  if (compareVersions(candidate.version, latest.version) <= 0) {
    throw new Error(
      `Release tag ${candidateTag} must be newer than the latest stable release ${latestTag}.`,
    );
  }
}

export function extractStableReleaseTags(pages) {
  if (!Array.isArray(pages)) {
    throw new Error("GitHub release lookup must return an array of pages.");
  }

  return pages.flatMap((page) => {
    if (!Array.isArray(page)) {
      throw new Error("GitHub release lookup returned an invalid page.");
    }

    return page.map((release) => {
      if (
        !release ||
        typeof release !== "object" ||
        typeof release.prerelease !== "boolean" ||
        typeof release.tag_name !== "string"
      ) {
        throw new Error("GitHub release lookup returned an invalid release.");
      }

      return release;
    })
      .filter((release) => release.prerelease === false)
      .map((release) => release.tag_name);
  });
}

async function main() {
  const candidateTag = process.argv[2];
  if (!candidateTag) {
    throw new Error("Pass the release tag as the first argument.");
  }

  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  const pages = JSON.parse(input);
  const existingTags = extractStableReleaseTags(pages);

  assertReleaseTagIsNewer(candidateTag, existingTags);
  const latestTag = findLatestStableTag(existingTags);

  if (latestTag) {
    console.log(
      `Release tag ${candidateTag} is newer than the latest stable release ${latestTag}.`,
    );
  } else {
    console.log(
      `Release tag ${candidateTag} is the first stable release.`,
    );
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`::error::${error.message}`);
    process.exitCode = 1;
  });
}