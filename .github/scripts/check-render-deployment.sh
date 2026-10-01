#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${RENDER_SERVICE_URL:-}" ]]; then
  echo "::error::Set the non-secret RENDER_SERVICE_URL repository variable to the Render service's public HTTPS base URL."
  exit 1
fi

if [[ ! "$RENDER_SERVICE_URL" =~ ^https:// ]]; then
  echo "::error::RENDER_SERVICE_URL must be an HTTPS base URL."
  exit 1
fi

base_url="${RENDER_SERVICE_URL%/}"
endpoints=("$base_url/" "$base_url/api/healthz")
endpoint_names=("homepage" "health endpoint")
max_attempts=30

for attempt in $(seq 1 "$max_attempts"); do
  all_healthy=true
  failed_endpoints=()

  for index in "${!endpoints[@]}"; do
    if curl \
      --fail \
      --location \
      --silent \
      --show-error \
      --max-time 15 \
      --output /dev/null \
      "${endpoints[$index]}"; then
      echo "Attempt $attempt/$max_attempts: ${endpoint_names[$index]} returned success."
    else
      echo "Attempt $attempt/$max_attempts: ${endpoint_names[$index]} is not ready."
      all_healthy=false
      failed_endpoints+=("${endpoint_names[$index]}")
    fi
  done

  if [[ "$all_healthy" == true ]]; then
    echo "Render homepage and health endpoint are responding successfully."
    exit 0
  fi

  if [[ "$attempt" -lt "$max_attempts" ]]; then
    sleep 30
  fi
done

if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  failed_endpoint_list=$(IFS=,; echo "${failed_endpoints[*]}")
  printf 'failed_endpoints=%s\n' "$failed_endpoint_list" >> "$GITHUB_OUTPUT"
fi

echo "::error::Render homepage and health endpoint did not both return success after $max_attempts attempts."
exit 1