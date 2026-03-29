#!/usr/bin/env bash

set -euo pipefail

WORKFLOW_RECORD_ID="${WORKFLOW_RECORD_ID:?WORKFLOW_RECORD_ID is required}"
SERVER_RECORD_ID="${SERVER_RECORD_ID:?SERVER_RECORD_ID is required}"
SERVER_NAME="${SERVER_NAME:?SERVER_NAME is required}"
SERVER_TYPE="${SERVER_TYPE:-CPX21}"
SERVER_LOCATION="${SERVER_LOCATION:-fsn1}"
STACKS_PER_VPS="${STACKS_PER_VPS:-2}"
BACKEND_CALLBACK_URL="${BACKEND_CALLBACK_URL:?BACKEND_CALLBACK_URL is required}"
BACKEND_INTERNAL_URL="${BACKEND_INTERNAL_URL:?BACKEND_INTERNAL_URL is required}"
STACK_INFRA_CALLBACK_SECRET="${STACK_INFRA_CALLBACK_SECRET:-}"
HERZNET_API_KEY="${HERZNET_API_KEY:?HERZNET_API_KEY is required}"
HERZNET_SSH_KEY_NAMES="${HERZNET_SSH_KEY_NAMES:?HERZNET_SSH_KEY_NAMES is required}"
WHATSAPP_AUTOSTART_TARGET_SLOT="${WHATSAPP_AUTOSTART_TARGET_SLOT:-0}"
PRIVATE_NETWORK_NAME="bedones_private"
STEP_CA_URL="${STEP_CA_URL:?STEP_CA_URL is required}"
STEP_CA_FINGERPRINT="${STEP_CA_FINGERPRINT:?STEP_CA_FINGERPRINT is required}"
STEP_CA_PROVISIONER_NAME="${STEP_CA_PROVISIONER_NAME:?STEP_CA_PROVISIONER_NAME is required}"
STEP_CA_PROVISIONER_PASSWORD="${STEP_CA_PROVISIONER_PASSWORD:?STEP_CA_PROVISIONER_PASSWORD is required}"

api_url="https://api.hetzner.cloud/v1"
job_total=3

runtime_dir="${RUNNER_TEMP:-/tmp}/bedones-whatsapp-agent-runtime/${SERVER_NAME}"
rendered_stack_file="${runtime_dir}/stack.yml"
stacks_json_file="${runtime_dir}/stacks.json"
certs_dir="${runtime_dir}/certs"
caddy_dir="${runtime_dir}/caddy"
step_password_file="${runtime_dir}/step-provisioner-password.txt"

callback() {
  local status="$1"
  local stage="$2"
  local completed_jobs="$3"
  local extra_json="${4:-{}}"

  jq -n \
    --arg workflowId "${WORKFLOW_RECORD_ID}" \
    --arg status "${status}" \
    --arg stage "${stage}" \
    --argjson totalJobs "${job_total}" \
    --argjson completedJobs "${completed_jobs}" \
    --argjson extra "${extra_json}" \
    '{
      workflowId: $workflowId,
      status: $status,
      stage: $stage,
      totalJobs: $totalJobs,
      completedJobs: $completedJobs
    } + $extra' \
    | curl -fsS -X POST "${BACKEND_CALLBACK_URL}" \
        -H "Content-Type: application/json" \
        -H "x-infra-callback-secret: ${STACK_INFRA_CALLBACK_SECRET}" \
        --data-binary @-
}

poll_action() {
  local action_id="$1"
  while true; do
    local action_json
    action_json="$(
      curl -fsS \
        -H "Authorization: Bearer ${HERZNET_API_KEY}" \
        "${api_url}/actions/${action_id}"
    )"
    local action_status
    action_status="$(echo "${action_json}" | jq -r '.action.status')"
    local progress
    progress="$(echo "${action_json}" | jq -r '.action.progress // 0')"

    if [[ "${action_status}" == "success" ]]; then
      break
    fi

    if [[ "${action_status}" == "error" ]]; then
      echo "${action_json}" >&2
      exit 1
    fi

    sleep 5
    echo "Waiting for Hetzner action ${action_id} (${progress}%)"
  done
}

extract_server_info() {
  local server_id="$1"
  curl -fsS \
    -H "Authorization: Bearer ${HERZNET_API_KEY}" \
    "${api_url}/servers/${server_id}"
}

require_step_cli() {
  if ! command -v step >/dev/null 2>&1; then
    echo "step CLI is required on the self-hosted runner." >&2
    exit 1
  fi
}

bootstrap_step_ca() {
  mkdir -p "${runtime_dir}"
  printf '%s' "${STEP_CA_PROVISIONER_PASSWORD}" > "${step_password_file}"
  chmod 600 "${step_password_file}"
  step ca bootstrap \
    --ca-url "${STEP_CA_URL}" \
    --fingerprint "${STEP_CA_FINGERPRINT}" \
    --force >/dev/null
}

issue_certificate() {
  local subject="$1"
  local cert_file="$2"
  local key_file="$3"
  shift 3

  step ca certificate \
    "${subject}" \
    "${cert_file}" \
    "${key_file}" \
    --ca-url "${STEP_CA_URL}" \
    --fingerprint "${STEP_CA_FINGERPRINT}" \
    --provisioner "${STEP_CA_PROVISIONER_NAME}" \
    --provisioner-password-file "${step_password_file}" \
    "$@" >/dev/null
}

write_caddyfile() {
  local stack_name="$1"
  local agent_port="$2"
  local connector_port="$3"
  local output_file="${caddy_dir}/${stack_name}.Caddyfile"

  cat > "${output_file}" <<EOF
{
  auto_https off
  admin off
}

:${agent_port} {
  tls /certs/server.crt /certs/server.key {
    client_auth {
      mode require_and_verify
      trust_pool file {
        pem_file /certs/root_ca.crt
      }
    }
  }

  reverse_proxy ${stack_name}_agent:${agent_port}
}

:${connector_port} {
  tls /certs/server.crt /certs/server.key {
    client_auth {
      mode require_and_verify
      trust_pool file {
        pem_file /certs/root_ca.crt
      }
    }
  }

  reverse_proxy ${stack_name}_connector:${connector_port}
}
EOF
}

prepare_runtime_assets() {
  local public_ipv4="$1"

  mkdir -p "${certs_dir}/shared" "${caddy_dir}"
  cp "$(step path)/certs/root_ca.crt" "${certs_dir}/shared/root_ca.crt"

  issue_certificate \
    "node-server:${SERVER_NAME}" \
    "${certs_dir}/shared/server.crt" \
    "${certs_dir}/shared/server.key" \
    --san "${public_ipv4}" \
    --not-after 720h

  for slot in $(seq 1 "${STACKS_PER_VPS}"); do
    local stack_name="${SERVER_NAME}-s${slot}"
    local stack_label="${SERVER_NAME}-slot-${slot}"
    local agent_port=$((3100 + slot))
    local connector_port=$((3200 + slot))

    mkdir -p \
      "${certs_dir}/${stack_name}_agent" \
      "${certs_dir}/${stack_name}_connector"

    issue_certificate \
      "agent:${stack_label}" \
      "${certs_dir}/${stack_name}_agent/client.crt" \
      "${certs_dir}/${stack_name}_agent/client.key" \
      --not-after 720h

    issue_certificate \
      "connector:${stack_label}" \
      "${certs_dir}/${stack_name}_connector/client.crt" \
      "${certs_dir}/${stack_name}_connector/client.key" \
      --not-after 720h

    write_caddyfile "${stack_name}" "${agent_port}" "${connector_port}"
  done
}

create_payload="$(
  jq -n \
    --arg image "docker-ce" \
    --arg location "${SERVER_LOCATION}" \
    --arg name "${SERVER_NAME}" \
    --arg serverType "${SERVER_TYPE}" \
    --arg sshKeys "${HERZNET_SSH_KEY_NAMES}" \
    '{
      image: $image,
      location: $location,
      name: $name,
      server_type: $serverType,
      public_net: {
        enable_ipv4: true,
        enable_ipv6: true
      },
      labels: {
        app: "bedones-whatsapp-agent",
        managed_by: "github-actions"
      }
    }
    + { ssh_keys: ($sshKeys | split(",") | map(select(length > 0))) }'
)"

require_step_cli
bootstrap_step_ca

callback "running" "SERVER_INITIALIZING" 0

create_response="$(
  curl -fsS -X POST \
    -H "Authorization: Bearer ${HERZNET_API_KEY}" \
    -H "Content-Type: application/json" \
    "${api_url}/servers" \
    -d "${create_payload}"
)"

server_id="$(echo "${create_response}" | jq -r '.server.id')"
action_id="$(echo "${create_response}" | jq -r '.action.id')"

poll_action "${action_id}"

server_json="$(extract_server_info "${server_id}")"
public_ipv4="$(echo "${server_json}" | jq -r '.server.public_net.ipv4.ip')"
private_ipv4="$(echo "${server_json}" | jq -r '.server.private_net[0].ip // empty')"

callback "running" "SERVER_INITIALIZING" 1 "$(jq -n \
  --arg githubRunId "${GITHUB_RUN_ID:-}" \
  --arg githubRunUrl "${GITHUB_SERVER_URL:-https://github.com}/${GITHUB_REPOSITORY:-}/${GITHUB_RUN_ID:-}" \
  --arg providerServerId "${server_id}" \
  --arg publicIpv4 "${public_ipv4}" \
  --arg privateIpv4 "${private_ipv4}" \
  --arg name "${SERVER_NAME}" \
  --arg serverType "${SERVER_TYPE}" \
  --arg location "${SERVER_LOCATION}" \
  '{ githubRunId: $githubRunId, githubRunUrl: $githubRunUrl, server: { providerServerId: $providerServerId, publicIpv4: $publicIpv4, privateIpv4: $privateIpv4, name: $name, serverType: $serverType, location: $location } }')"

prepare_runtime_assets "${public_ipv4}"

STACK_PREFIX="${SERVER_NAME}" \
OUTPUT_FILE="${rendered_stack_file}" \
WHATSAPP_AUTOSTART_TARGET_SLOT="${WHATSAPP_AUTOSTART_TARGET_SLOT}" \
STACKS_PER_VPS="${STACKS_PER_VPS}" \
BACKEND_INTERNAL_URL="${BACKEND_INTERNAL_URL}" \
bash .github/scripts/render-bedones-whatsapp-agent-stack.sh

callback "running" "STACK_INSTALLING" 1

mkdir -p "${HOME}/.ssh"
ssh_opts=(-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null)

ssh "${ssh_opts[@]}" "root@${public_ipv4}" "mkdir -p /root/bedones-whatsapp-agent"
scp "${ssh_opts[@]}" -r "${runtime_dir}/." "root@${public_ipv4}:/root/bedones-whatsapp-agent/"

ssh "${ssh_opts[@]}" "root@${public_ipv4}" "
  set -euo pipefail
  if command -v docker >/dev/null 2>&1; then
    docker network inspect ${PRIVATE_NETWORK_NAME} >/dev/null 2>&1 || docker network create ${PRIVATE_NETWORK_NAME}
  fi
  if [ -n \"${GHCR_USERNAME:-}\" ] && [ -n \"${GHCR_READ_TOKEN:-}\" ]; then
    echo \"${GHCR_READ_TOKEN}\" | docker login ghcr.io -u \"${GHCR_USERNAME}\" --password-stdin
  fi
  docker compose -f /root/bedones-whatsapp-agent/stack.yml up -d
"

callback "running" "STACK_STARTING" 2

stack_entries=()
for slot in $(seq 1 "${STACKS_PER_VPS}"); do
  stack_name="${SERVER_NAME}-s${slot}"
  stack_label="${SERVER_NAME}-slot-${slot}"
  agent_port=$((3100 + slot))
  connector_port=$((3200 + slot))

  ssh "${ssh_opts[@]}" "root@${public_ipv4}" "\
    curl -fsS --cacert /root/bedones-whatsapp-agent/certs/shared/root_ca.crt \
      --cert /root/bedones-whatsapp-agent/certs/${stack_name}_agent/client.crt \
      --key /root/bedones-whatsapp-agent/certs/${stack_name}_agent/client.key \
      https://${public_ipv4}:${agent_port}/health >/dev/null"
  ssh "${ssh_opts[@]}" "root@${public_ipv4}" "\
    curl -fsS --cacert /root/bedones-whatsapp-agent/certs/shared/root_ca.crt \
      --cert /root/bedones-whatsapp-agent/certs/${stack_name}_connector/client.crt \
      --key /root/bedones-whatsapp-agent/certs/${stack_name}_connector/client.key \
      https://${public_ipv4}:${connector_port}/health >/dev/null"

  stack_entries+=("{\"stackSlot\":${slot},\"stackLabel\":\"${stack_label}\",\"agentPort\":${agent_port},\"connectorPort\":${connector_port},\"privateIpv4\":\"${private_ipv4}\",\"publicBaseUrl\":\"https://${public_ipv4}\"}")
done

printf '[%s]\n' "$(IFS=,; echo "${stack_entries[*]}")" > "${stacks_json_file}"

callback "success" "STACK_STARTING" 3 "$(jq -n \
  --arg githubRunId "${GITHUB_RUN_ID:-}" \
  --arg githubRunUrl "${GITHUB_SERVER_URL:-https://github.com}/${GITHUB_REPOSITORY:-}/${GITHUB_RUN_ID:-}" \
  --arg providerServerId "${server_id}" \
  --arg publicIpv4 "${public_ipv4}" \
  --arg privateIpv4 "${private_ipv4}" \
  --arg name "${SERVER_NAME}" \
  --arg serverType "${SERVER_TYPE}" \
  --arg location "${SERVER_LOCATION}" \
  --slurpfile stacks "${stacks_json_file}" \
  '{ githubRunId: $githubRunId, githubRunUrl: $githubRunUrl, server: { providerServerId: $providerServerId, publicIpv4: $publicIpv4, privateIpv4: $privateIpv4, name: $name, serverType: $serverType, location: $location }, stacks: $stacks[0] }')"
