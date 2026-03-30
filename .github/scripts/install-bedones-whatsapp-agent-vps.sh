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
CLOUDFLARE_ORIGIN_CERT="${CLOUDFLARE_ORIGIN_CERT:?CLOUDFLARE_ORIGIN_CERT is required}"
CLOUDFLARE_ORIGIN_KEY="${CLOUDFLARE_ORIGIN_KEY:?CLOUDFLARE_ORIGIN_KEY is required}"

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
    | sed -e "s/[\"']//g" -e 's/[^a-z0-9-]/-/g' -e 's/-\{2,\}/-/g' -e 's/^-//' -e 's/-$//')"

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

# Build a callback payload as a single jq call.
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

write_global_caddyfile() {
  local output_file="${caddy_dir}/Caddyfile"

  cat > "${output_file}" <<CADDYEOF
{
  auto_https off
  admin off
}

CADDYEOF

  for slot in $(seq 1 "${STACKS_PER_VPS}"); do
    local stack_name="${SERVER_NAME}-s${slot}"
    local stack_label="${SERVER_NAME}-slot-${slot}"
    local agent_port=$((3100 + slot))
    local connector_port=$((3200 + slot))
    local subdomain="vps-${SERVER_NAME}-s${slot}.bedones.com"

    cat >> "${output_file}" <<CADDYEOF
${subdomain} {
  tls /certs/origin.crt /certs/origin.key

  handle_path /agent/* {
    reverse_proxy ${stack_name}_agent:${agent_port}
  }

  handle_path /connector/* {
    reverse_proxy ${stack_name}_connector:${connector_port}
  }

  handle /agent {
    reverse_proxy ${stack_name}_agent:${agent_port}
  }

  handle /connector {
    reverse_proxy ${stack_name}_connector:${connector_port}
  }
}

CADDYEOF
  done

  log "Generated global Caddyfile at ${output_file}"
}

prepare_runtime_assets() {
  log "Preparing runtime assets for server=${SERVER_NAME} public_ipv4=${PUBLIC_IPV4}"
  mkdir -p "${certs_dir}" "${caddy_dir}"

  # Deploy Cloudflare Origin Certificate (wildcard *.bedones.com)
  printf '%s\n' "${CLOUDFLARE_ORIGIN_CERT}" > "${certs_dir}/origin.crt"
  printf '%s\n' "${CLOUDFLARE_ORIGIN_KEY}" > "${certs_dir}/origin.key"
  chmod 600 "${certs_dir}/origin.key"
  log "Deployed Cloudflare Origin Certificate"

  # Generate global Caddyfile with hostname-based routing
  write_global_caddyfile

  for slot in $(seq 1 "${STACKS_PER_VPS}"); do
    local stack_name="${SERVER_NAME}-s${slot}"
    local agent_port=$((3100 + slot))
    local connector_port=$((3200 + slot))
    log "Prepared stack assets stack=${stack_name} agent_port=${agent_port} connector_port=${connector_port}"
  done
}

log "Starting install workflow server_name=${SERVER_NAME} server_type=${SERVER_TYPE} location=${SERVER_LOCATION} public_ipv4=${PUBLIC_IPV4} stacks_per_vps=${STACKS_PER_VPS}"
log "jq version: $(jq --version 2>&1 || echo 'unknown')"
log "Using backend_callback_url=${BACKEND_CALLBACK_URL}"
log "Using backend_internal_url=${BACKEND_INTERNAL_URL}"

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

log "Waiting for SSH to become available on root@${PUBLIC_IPV4}"
ssh_attempts=0
until ssh "${ssh_opts[@]}" -o ConnectTimeout=5 "root@${PUBLIC_IPV4}" "true" 2>/dev/null; do
  ssh_attempts=$((ssh_attempts + 1))
  if [ "${ssh_attempts}" -ge 30 ]; then
    log "SSH not available after ${ssh_attempts} attempts"
    exit 1
  fi
  log "SSH not ready yet, attempt ${ssh_attempts}/30..."
  sleep 10
done
log "SSH is available on root@${PUBLIC_IPV4}"

log "Preparing remote workspace on root@${PUBLIC_IPV4}"
ssh "${ssh_opts[@]}" "root@${PUBLIC_IPV4}" "mkdir -p /root/bedones-whatsapp-agent"
log "Uploading runtime assets to root@${PUBLIC_IPV4}:/root/bedones-whatsapp-agent/"
tar -C "${runtime_dir}" -cf - . | ssh "${ssh_opts[@]}" "root@${PUBLIC_IPV4}" "tar -C /root/bedones-whatsapp-agent/ -xf -"

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
  docker compose -f /root/bedones-whatsapp-agent/stack.yml up -d || {
    echo '=== DOCKER COMPOSE FAILED - Collecting container logs ==='
    docker compose -f /root/bedones-whatsapp-agent/stack.yml ps -a
    echo '=== Container logs ==='
    docker compose -f /root/bedones-whatsapp-agent/stack.yml logs --tail=100
    exit 1
  }
"

stack_entries=()
for slot in $(seq 1 "${STACKS_PER_VPS}"); do
  stack_name="${SERVER_NAME}-s${slot}"
  stack_label="${SERVER_NAME}-slot-${slot}"
  agent_port=$((3100 + slot))
  connector_port=$((3200 + slot))
  subdomain="vps-${SERVER_NAME}-s${slot}.bedones.com"

  compose_file="/root/bedones-whatsapp-agent/stack.yml"
  compose_project="bedones-whatsapp-agent"

  log "Healthcheck agent stack=${stack_name} via docker exec"
  ssh "${ssh_opts[@]}" "root@${PUBLIC_IPV4}" "\
    docker compose -f ${compose_file} -p ${compose_project} \
      exec -T ${stack_name}_agent curl -fsS http://127.0.0.1:${agent_port}/health >/dev/null"

  log "Healthcheck connector stack=${stack_name} via docker exec"
  ssh "${ssh_opts[@]}" "root@${PUBLIC_IPV4}" "\
    docker compose -f ${compose_file} -p ${compose_project} \
      exec -T ${stack_name}_connector curl -fsS http://127.0.0.1:${connector_port}/health >/dev/null"

  log "Stack healthy stack=${stack_name} agent_port=${agent_port} connector_port=${connector_port} subdomain=${subdomain}"

  stack_entries+=("{\"stackSlot\":${slot},\"stackLabel\":\"${stack_label}\",\"agentPort\":${agent_port},\"connectorPort\":${connector_port},\"privateIpv4\":\"${PRIVATE_IPV4}\",\"publicBaseUrl\":\"https://${subdomain}\"}")
done

printf '[%s]\n' "$(IFS=,; echo "${stack_entries[*]}")" > "${stacks_json_file}"
log "Install workflow completed successfully for server=${SERVER_NAME}"

# Build the success payload with stacks included
success_payload="$(
  jq -c -n \
    --arg workflowId "${WORKFLOW_RECORD_ID}" \
    --arg status "success" \
    --arg stage "STACK_STARTING" \
    --arg totalJobs "${job_total}" \
    --arg completedJobs "3" \
    --arg providerServerId "${PROVIDER_SERVER_ID}" \
    --arg publicIpv4 "${PUBLIC_IPV4}" \
    --arg privateIpv4 "${PRIVATE_IPV4}" \
    --arg serverName "${SERVER_NAME}" \
    --arg serverType "${SERVER_TYPE}" \
    --arg location "${SERVER_LOCATION}" \
    --slurpfile stacks "${stacks_json_file}" \
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
      },
      "stacks": $stacks[0]
    }'
)"

log "Callback stage=STACK_STARTING status=success progress=3/${job_total} url=${BACKEND_CALLBACK_URL}"
log "Callback payload=${success_payload}"

response_file="${runtime_dir}/callback-response-success.json"
http_status="$(
  curl -sS -o "${response_file}" -w '%{http_code}' -X POST "${BACKEND_CALLBACK_URL}" \
    -H "Content-Type: application/json" \
    -H "x-infra-callback-secret: ${STACK_INFRA_CALLBACK_SECRET}" \
    --data-binary "${success_payload}"
)"

log "Callback response status=${http_status} body=$(cat "${response_file}")"

if [[ ! "${http_status}" =~ ^2 ]]; then
  log "Success callback failed url=${BACKEND_CALLBACK_URL}"
  exit 1
fi
