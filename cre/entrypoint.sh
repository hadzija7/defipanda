#!/usr/bin/env bash
set -euo pipefail

INTERVAL="${CRE_CRON_INTERVAL_SECONDS:-300}"
if ! [[ "$INTERVAL" =~ ^[0-9]+$ ]] || [ "$INTERVAL" -lt 1 ]; then
  echo "WARNING: CRE_CRON_INTERVAL_SECONDS='$INTERVAL' is not a valid positive integer. Falling back to 300."
  INTERVAL=300
fi
TARGET="${CRE_TARGET:-staging-settings}"
WORKFLOW="${CRE_WORKFLOW_NAME:-dca-workflow}"
BROADCAST="${CRE_BROADCAST:-false}"

BROADCAST_FLAG=""
if [ "$BROADCAST" = "true" ]; then
  BROADCAST_FLAG="--broadcast"
fi

# Seed CRE auth from host-mounted file (avoids bind-mount rename issues)
if [ -f /tmp/host-cre-auth.yaml ]; then
  mkdir -p /root/.cre
  cp /tmp/host-cre-auth.yaml /root/.cre/cre.yaml
  echo "CRE auth seeded from host credentials."
fi

echo "=== DefiPanda CRE Automation ==="
echo "  Workflow : $WORKFLOW"
echo "  Target   : $TARGET"
echo "  Interval : ${INTERVAL}s"
echo "  Broadcast: $BROADCAST"
echo "================================"

wait_for_backend() {
  local url="${BACKEND_URL_ALL:-http://web:3000}"
  local max_attempts=30
  local attempt=0

  echo "Waiting for backend at $url ..."
  while [ $attempt -lt $max_attempts ]; do
    if curl -sf "${url}/api/dca/strategy?address=0x0000000000000000000000000000000000000000" > /dev/null 2>&1; then
      echo "Backend is ready."
      return 0
    fi
    attempt=$((attempt + 1))
    echo "  attempt $attempt/$max_attempts — backend not ready, retrying in 5s..."
    sleep 5
  done

  echo "WARNING: Backend did not become ready after $max_attempts attempts. Starting anyway."
  return 0
}

wait_for_backend

run=1
while true; do
  echo ""
  echo "--- Run #$run at $(date -u +%Y-%m-%dT%H:%M:%SZ) ---"

  if cre workflow simulate "$WORKFLOW" \
       --target "$TARGET" \
       --non-interactive \
       --trigger-index 0 \
       $BROADCAST_FLAG; then
    echo "--- Run #$run completed successfully ---"
  else
    echo "--- Run #$run FAILED (exit $?) ---"
  fi

  run=$((run + 1))
  echo "Sleeping ${INTERVAL}s until next run..."
  sleep "$INTERVAL"
done
