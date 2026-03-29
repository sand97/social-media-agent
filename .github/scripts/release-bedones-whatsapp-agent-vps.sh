#!/usr/bin/env bash

set -euo pipefail

WORKFLOW_RECORD_ID="${WORKFLOW_RECORD_ID:?WORKFLOW_RECORD_ID is required}"
SERVER_RECORD_ID="${SERVER_RECORD_ID:?SERVER_RECORD_ID is required}"
SERVER_NAME="${SERVER_NAME:?SERVER_NAME is required}"
PROVIDER_SERVER_ID="${PROVIDER_SERVER_ID:-}"
BACKEND_CALLBACK_URL="${BACKEND_CALLBACK_URL:?BACKEND_CALLBACK_URL is required}"
STACK_INFRA_CALLBACK_SECRET="${STACK_INFRA_CALLBACK_SECRET:-}"
HERZNET_API_KEY="${HERZNET_API_KEY:?HERZNET_API_KEY is required}"
DELETE_SERVER_WHEN_EMPTY="${DELETE_SERVER_WHEN_EMPTY:-false}"
PUBLIC_IPV4="${PUBLIC_IPV4:-}"

callback() {
  local status="$1"
  local stage="$2"
  local completed_jobs="$3"

  jq -n \
    --arg workflowId "${WORKFLOW_RECORD_ID}" \
    --arg status "${status}" \
    --arg stage "${stage}" \
    --argjson totalJobs 1 \
    --argjson completedJobs "${completed_jobs}" \
    '{ workflowId: $workflowId, status: $status, stage: $stage, totalJobs: $totalJobs, completedJobs: $completedJobs }' \
    | curl -fsS -X POST "${BACKEND_CALLBACK_URL}" \
        -H "Content-Type: application/json" \
        -H "x-infra-callback-secret: ${STACK_INFRA_CALLBACK_SECRET}" \
        --data-binary @-
}

callback "running" "STACK_RELEASING" 0

if [[ -n "${PUBLIC_IPV4}" ]]; then
  ssh_opts=(-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null)

  ssh "${ssh_opts[@]}" "root@${PUBLIC_IPV4}" "
    set -euo pipefail
    if [ -f /root/bedones-whatsapp-agent/stack.yml ]; then
      docker compose -f /root/bedones-whatsapp-agent/stack.yml down -v || true
    fi
  "
fi

if [[ "${DELETE_SERVER_WHEN_EMPTY}" == "true" && -n "${PROVIDER_SERVER_ID}" ]]; then
  curl -fsS -X DELETE \
    -H "Authorization: Bearer ${HERZNET_API_KEY}" \
    "https://api.hetzner.cloud/v1/servers/${PROVIDER_SERVER_ID}" >/dev/null
fi

callback "success" "STACK_RELEASING" 1
