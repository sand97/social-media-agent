#!/usr/bin/env bash

set -euo pipefail

WORKFLOW_RECORD_ID="${WORKFLOW_RECORD_ID:?WORKFLOW_RECORD_ID is required}"
SERVER_RECORD_ID="${SERVER_RECORD_ID:?SERVER_RECORD_ID is required}"
SERVER_NAME="${SERVER_NAME:?SERVER_NAME is required}"
SERVER_TYPE="${SERVER_TYPE:-cpx22}"
SERVER_LOCATION="${SERVER_LOCATION:-nbg1}"
STACKS_PER_VPS="${STACKS_PER_VPS:-2}"
PUBLIC_IPV4="${PUBLIC_IPV4:?PUBLIC_IPV4 is required}"
PRIVATE_IPV4="${PRIVATE_IPV4:-}"
PROVIDER_SERVER_ID="${PROVIDER_SERVER_ID:-}"
BACKEND_CALLBACK_URL="${BACKEND_CALLBACK_URL:?BACKEND_CALLBACK_URL is required}"
BACKEND_INTERNAL_URL="${BACKEND_INTERNAL_URL:?BACKEND_INTERNAL_URL is required}"
STACK_INFRA_CALLBACK_SECRET="${STACK_INFRA_CALLBACK_SECRET:-}"
WHATSAPP_AUTOSTART_TARGET_SLOT="${WHATSAPP_AUTOSTART_TARGET_SLOT:-0}"
PRIVATE_NETWORK_NAME="bedones_private"
STEP_CA_URL="${STEP_CA_URL:?STEP_CA_URL is required}"
STEP_CA_FINGERPRINT="${STEP_CA_FINGERPRINT:?STEP_CA_FINGERPRINT is required}"
STEP_CA_PROVISIONER_NAME="${STEP_CA_PROVISIONER_NAME:?STEP_CA_PROVISIONER_NAME is required}"
STEP_CA_PROVISIONER_PASSWORD="${STEP_CA_PROVISIONER_PASSWORD:?STEP_CA_PROVISIONER_PASSWORD is required}"

job_total=3
current_stage="STACK_INSTALLING"
current_completed_jobs=1

log() {
  printf '[%s] %s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$*"
}

sanitize_server_name() {
  local value="$1"

  value="$(printf '%s' "${value}" \
    | tr '[:upper:]' '[:lower:]' \
    | sed -e "s/[\"']//g" -e 's/[^a-z0-9-]/-/g' -e 's/-\\{2,\\}/-/g' -e 's/^-//' -e 's/-$//')"

  if [[ -z "${value}" ]]; then
    echo "SERVER_NAME is empty after sanitization" >&2
    exit 1
  fi

  printf '%s' "${value}"
}

sanitize_server_type() {
  local value="$1"

  value="$(printf '%s' "${value}" | tr '[:upper:]' '[:lower:]' | xargs)"

  if [[ -z "${value}" ]]; then
    echo "SERVER_TYPE is empty after sanitization" >&2
    exit 1
  fi

  printf '%s' "${value}"
}

SERVER_NAME="$(sanitize_server_name "${SERVER_NAME}")"
SERVER_TYPE="$(sanitize_server_type "${SERVER_TYPE}")"

runtime_dir="${RUNNER_TEMP:-/tmp}/bedones-whatsapp-agent-runtime/${SERVER_NAME}"
rendered_stack_file="${runtime_dir}/stack.yml"
stacks_json_file="${runtime_dir}/stacks.json"
certs_dir="${runtime_dir}/certs"
caddy_dir="${runtime_dir}/caddy"
step_password_file="${runtime_dir}/step-provisioner-password.txt"

# Build a callback payload as a single jq call — no merge needed.
# Usage: callback <status> <stage> <completed_jobs> [extra_jq_args...] [extra_jq_filter]
# The base fields (workflowId, status, stage, totalJobs, completedJobs, server)
# are always included. Any extra jq filter is merged via `* <extra>`.
callback() {
  local status="$1"
  local stage="$2"
  local completed_jobs="$3"
  shift 3

  local payload
  local response_file
  local http_status

  mkdir -p "${runtime_dir}"

  payload="$(
    jq -c -n \
      --arg workflowId "${WORKFLOW_RECORD_ID}" \
      --arg status "${status}" \
      --arg stage "${stage}" \
      --arg totalJobs "${job_total}" \
      --arg completedJobs "${completed_jobs}" \
      --arg providerServerId "${PROVIDER_SERVER_ID}" \
      --arg publicIpv4 "${PUBLIC_IPV4}" \
      --arg privateIpv4 "${PRIVATE_IPV4}" \
      --arg serverName "${SERVER_NAME}" \
      --arg serverType "${SERVER_TYPE}" \
      --arg location "${SERVER_LOCATION}" \
      "$@" \
      '{
        "workflowId": $workflowId,
        "status": $status,
        "stage": $stage,
        "totalJobs": ($totalJobs | tonumber),
        "completedJobs": ($completedJobs | tonumber),
        "server": {
          "providerServerId": $providerServerId,
          "publicIpv4": $publicIpv4,
          "privateIpv4": $privateIpv4,
          "name": $serverName,
          "serverType": $serverType,
          "location": $location
        }
      }'
  )"

  response_file="${runtime_dir}/callback-response-${stage}.json"

  log "Callback stage=${stage} status=${status} progress=${completed_jobs}/${job_total} url=${BACKEND_CALLBACK_URL}"
  log "Callback payload=${payload}"

  http_status="$(
    curl -sS -o "${response_file}" -w '%{http_code}' -X POST "${BACKEND_CALLBACK_URL}" \
      -H "Content-Type: application/json" \
      -H "x-infra-callback-secret: ${STACK_INFRA_CALLBACK_SECRET}" \
      --data-binary "${payload}"
  )"

  log "Callback response status=${http_status} body=$(cat "${response_file}")"

  if [[ ! "${http_status}" =~ ^2 ]]; then
    log "Callback failed for stage=${stage} url=${BACKEND_CALLBACK_URL}"
    exit 1
  fi
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
  log "Bootstrapping step-ca url=${STEP_CA_URL}"
  step ca bootstrap \
    --ca-url "${STEP_CA_URL}" \
    --fingerprint "${STEP_CA_FINGERPRINT}" \
    --force >/dev/null
  log "step-ca bootstrap completed"
}

issue_certificate() {
  local subject="$1"
  local cert_file="$2"
  local key_file="$3"
  shift 3

  log "Issuing certificate subject=${subject} cert=${cert_file}"
  step ca certificate \
    "${subject}" \
    "${cert_file}" \
    "${key_file}" \
    --ca-url "${STEP_CA_URL}" \
    --root "$(step path)/certs/root_ca.crt" \
    --provisioner "${STEP_CA_PROVISIONER_NAME}" \
    --provisioner-password-file "${step_password_file}" \
    --force \
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
  log "Preparing runtime assets for server=${SERVER_NAME} public_ipv4=${PUBLIC_IPV4}"
  mkdir -p "${certs_dir}/shared" "${caddy_dir}"
  cp "$(step path)/certs/root_ca.crt" "${certs_dir}/shared/root_ca.crt"

  issue_certificate \
    "node-server:${SERVER_NAME}" \
    "${certs_dir}/shared/server.crt" \
    "${certs_dir}/shared/server.key" \
    --san "${PUBLIC_IPV4}" \
    --not-after 24h

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
      --not-after 24h

    issue_certificate \
      "connector:${stack_label}" \
      "${certs_dir}/${stack_name}_connector/client.crt" \
      "${certs_dir}/${stack_name}_connector/client.key" \
      --not-after 24h

    write_caddyfile "${stack_name}" "${agent_port}" "${connector_port}"
    log "Prepared stack assets stack=${stack_name} agent_port=${agent_port} connector_port=${connector_port}"
  done
}

require_step_cli
log "Starting install workflow server_name=${SERVER_NAME} server_type=${SERVER_TYPE} location=${SERVER_LOCATION} public_ipv4=${PUBLIC_IPV4} stacks_per_vps=${STACKS_PER_VPS}"
log "jq version: $(jq --version 2>&1 || echo 'unknown')"
log "Using backend_callback_url=${BACKEND_CALLBACK_URL}"
log "Using backend_internal_url=${BACKEND_INTERNAL_URL}"
log "Using step_ca_url=${STEP_CA_URL}"
bootstrap_step_ca

callback "running" "STACK_INSTALLING" 1

prepare_runtime_assets

STACK_PREFIX="${SERVER_NAME}" \
OUTPUT_FILE="${rendered_stack_file}" \
WHATSAPP_AUTOSTART_TARGET_SLOT="${WHATSAPP_AUTOSTART_TARGET_SLOT}" \
STACKS_PER_VPS="${STACKS_PER_VPS}" \
BACKEND_INTERNAL_URL="${BACKEND_INTERNAL_URL}" \
bash .github/scripts/render-bedones-whatsapp-agent-stack.sh

log "Rendered stack file path=${rendered_stack_file}"

mkdir -p "${HOME}/.ssh"
chmod 700 "${HOME}/.ssh"

ssh_key_file="${runtime_dir}/ssh_key"
if [[ -n "${HETZNER_SSH_PRIVATE_KEY:-}" ]]; then
  printf '%s\n' "${HETZNER_SSH_PRIVATE_KEY}" > "${ssh_key_file}"
  chmod 600 "${ssh_key_file}"
  ssh_opts=(-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -i "${ssh_key_file}")
else
  log "WARNING: HETZNER_SSH_PRIVATE_KEY not set, using default SSH key"
  ssh_opts=(-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null)
fi

log "Preparing remote workspace on root@${PUBLIC_IPV4}"
ssh "${ssh_opts[@]}" "root@${PUBLIC_IPV4}" "mkdir -p /root/bedones-whatsapp-agent"
log "Uploading runtime assets to root@${PUBLIC_IPV4}:/root/bedones-whatsapp-agent/"
scp -O "${ssh_opts[@]}" -r "${runtime_dir}/." "root@${PUBLIC_IPV4}:/root/bedones-whatsapp-agent/"

current_stage="STACK_STARTING"
current_completed_jobs=2
callback "running" "STACK_STARTING" 2

log "Starting remote docker compose stack on root@${PUBLIC_IPV4}"
ssh "${ssh_opts[@]}" "root@${PUBLIC_IPV4}" "
  set -euo pipefail
  if command -v docker >/dev/null 2>&1; then
    docker network inspect ${PRIVATE_NETWORK_NAME} >/dev/null 2>&1 || docker network create ${PRIVATE_NETWORK_NAME}
  fi
  if [ -n \"${GHCR_USERNAME:-}\" ] && [ -n \"${GHCR_READ_TOKEN:-}\" ]; then
    echo \"${GHCR_READ_TOKEN}\" | docker login ghcr.io -u \"${GHCR_USERNAME}\" --password-stdin
  fi
  docker compose -f /root/bedones-whatsapp-agent/stack.yml up -d
"

stack_entries=()
for slot in $(seq 1 "${STACKS_PER_VPS}"); do
  stack_name="${SERVER_NAME}-s${slot}"
  stack_label="${SERVER_NAME}-slot-${slot}"
  agent_port=$((3100 + slot))
  connector_port=$((3200 + slot))

  log "Healthcheck agent stack=${stack_name} url=https://${PUBLIC_IPV4}:${agent_port}/health"
  ssh "${ssh_opts[@]}" "root@${PUBLIC_IPV4}" "\
    curl -fsS --cacert /root/bedones-whatsapp-agent/certs/shared/root_ca.crt \
      --cert /root/bedones-whatsapp-agent/certs/${stack_name}_agent/client.crt \
      --key /root/bedones-whatsapp-agent/certs/${stack_name}_agent/client.key \
      https://${PUBLIC_IPV4}:${agent_port}/health >/dev/null"

  log "Healthcheck connector stack=${stack_name} url=https://${PUBLIC_IPV4}:${connector_port}/health"
  ssh "${ssh_opts[@]}" "root@${PUBLIC_IPV4}" "\
    curl -fsS --cacert /root/bedones-whatsapp-agent/certs/shared/root_ca.crt \
      --cert /root/bedones-whatsapp-agent/certs/${stack_name}_connector/client.crt \
      --key /root/bedones-whatsapp-agent/certs/${stack_name}_connector/client.key \
      https://${PUBLIC_IPV4}:${connector_port}/health >/dev/null"

  log "Stack healthy stack=${stack_name} agent_port=${agent_port} connector_port=${connector_port}"

  stack_entries+=("{\"stackSlot\":${slot},\"stackLabel\":\"${stack_label}\",\"agentPort\":${agent_port},\"connectorPort\":${connector_port},\"privateIpv4\":\"${PRIVATE_IPV4}\",\"publicBaseUrl\":\"https://${PUBLIC_IPV4}\"}")
done

printf '[%s]\n' "$(IFS=,; echo "${stack_entries[*]}")" > "${stacks_json_file}"
log "Install workflow completed successfully for server=${SERVER_NAME}"

callback "success" "STACK_STARTING" 3 \
  --slurpfile stacks "${stacks_json_file}" \
  '* {"stacks": $stacks[0]}'
