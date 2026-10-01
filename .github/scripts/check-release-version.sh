#!/usr/bin/env bash
set -euo pipefail

candidate_tag="${1:?Pass the release tag as the first argument.}"

gh api --paginate --slurp \
  "repos/${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}/releases?per_page=100" |
  node "$(dirname "${BASH_SOURCE[0]}")/check-release-version.mjs" "$candidate_tag"