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

if ! node -e '
try {
  const serviceUrl = new URL(process.argv[1]);
  if (serviceUrl.protocol !== "https:" || !serviceUrl.hostname) process.exitCode = 1;
} catch {
  process.exitCode = 1;
}
' "$RENDER_SERVICE_URL" >/dev/null 2>&1; then
  echo "::error::RENDER_SERVICE_URL must be a valid absolute HTTPS URL with a hostname."
  exit 1
fi

base_url="${RENDER_SERVICE_URL%/}"
endpoints=("$base_url/" "$base_url/api/healthz")
endpoint_names=("homepage" "health endpoint")
max_attempts=30

for attempt in $(seq 1 "$max_attempts"); do
  all_healthy=true
  failed_endpoint_details=()

  for index in "${!endpoints[@]}"; do
    status_code=""
    if status_code=$(curl \
      --fail \
      --location \
      --silent \
      --show-error \
      --max-time 15 \
      --output /dev/null \
      --write-out '%{http_code}' \
      "${endpoints[$index]}"); then
      echo "Attempt $attempt/$max_attempts: ${endpoint_names[$index]} returned success."
    else
      status_detail="transport failure"
      if [[ "$status_code" =~ ^[45][0-9]{2}$ ]]; then
        status_detail="HTTP $status_code"
      fi
      echo "Attempt $attempt/$max_attempts: ${endpoint_names[$index]} is not ready ($status_detail)."
      all_healthy=false
      failed_endpoint_details+=("${endpoint_names[$index]}: $status_detail")
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
  failed_endpoint_detail_list=$(IFS=,; echo "${failed_endpoint_details[*]}")
  printf 'failed_endpoint_details=%s\n' "$failed_endpoint_detail_list" >> "$GITHUB_OUTPUT"
fi

echo "::error::Render homepage and health endpoint did not both return success after $max_attempts attempts."
exit 1