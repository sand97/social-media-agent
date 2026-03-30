#!/usr/bin/env bash

set -euo pipefail

TEMPLATE_FILE="${TEMPLATE_FILE:-.github/stack-templates/bedones-whatsapp-agent/stack.template.yml}"
OUTPUT_FILE="${OUTPUT_FILE:-/tmp/bedones-whatsapp-agent-stack.yml}"
STACKS_PER_VPS="${STACKS_PER_VPS:-2}"
STACK_PREFIX="${STACK_PREFIX:-bedones-whatsapp}"
WHATSAPP_AUTOSTART_TARGET_SLOT="${WHATSAPP_AUTOSTART_TARGET_SLOT:-0}"
WHATSAPP_AGENT_IMAGE="${WHATSAPP_AGENT_IMAGE:-}"
WHATSAPP_CROPPER_IMAGE="${WHATSAPP_CROPPER_IMAGE:-}"
WHATSAPP_CONNECTOR_IMAGE="${WHATSAPP_CONNECTOR_IMAGE:-}"
BACKEND_URL="${BACKEND_URL:-}"
BACKEND_INTERNAL_URL="${BACKEND_INTERNAL_URL:-}"
CONNECTOR_SECRET="${CONNECTOR_SECRET:-}"
AGENT_INTERNAL_JWT_SECRET="${AGENT_INTERNAL_JWT_SECRET:-}"
MINIO_ENDPOINT="${MINIO_ENDPOINT:-}"
MINIO_PORT="${MINIO_PORT:-}"
MINIO_USE_SSL="${MINIO_USE_SSL:-false}"
MINIO_ACCESS_KEY="${MINIO_ACCESS_KEY:-}"
MINIO_SECRET_KEY="${MINIO_SECRET_KEY:-}"
MINIO_BUCKET="${MINIO_BUCKET:-}"
GEMINI_API_KEY="${GEMINI_API_KEY:-}"
GEMINI_MODEL="${GEMINI_MODEL:-gemini-2.5-pro}"
XAI_API_KEY="${XAI_API_KEY:-}"
XAI_MODEL="${XAI_MODEL:-grok-3}"
PRIMARY_MODEL="${PRIMARY_MODEL:-gemini}"
FALLBACK_MODEL="${FALLBACK_MODEL:-grok}"
PUPPETEER_EXECUTABLE_PATH="${PUPPETEER_EXECUTABLE_PATH:-/usr/bin/chromium}"

if [[ -z "${WHATSAPP_AGENT_IMAGE}" || -z "${WHATSAPP_CROPPER_IMAGE}" || -z "${WHATSAPP_CONNECTOR_IMAGE}" ]]; then
  echo "WHATSAPP_AGENT_IMAGE, WHATSAPP_CROPPER_IMAGE and WHATSAPP_CONNECTOR_IMAGE are required." >&2
  exit 1
fi

cat > "${OUTPUT_FILE}" <<EOF
services:
EOF

volume_lines=()

for slot in $(seq 1 "${STACKS_PER_VPS}"); do
  stack_name="${STACK_PREFIX}-s${slot}"
  stack_label="${STACK_PREFIX}-slot-${slot}"
  agent_port=$((3100 + slot))
  connector_port=$((3200 + slot))

  whatsapp_autostart="false"
  if [[ "${WHATSAPP_AUTOSTART_TARGET_SLOT}" == "${slot}" ]]; then
    whatsapp_autostart="true"
  fi

  sed \
    -e "s#__STACK_NAME__#${stack_name}#g" \
    -e "s#__STACK_LABEL__#${stack_label}#g" \
    -e "s#__WHATSAPP_AGENT_IMAGE__#${WHATSAPP_AGENT_IMAGE}#g" \
    -e "s#__WHATSAPP_CROPPER_IMAGE__#${WHATSAPP_CROPPER_IMAGE}#g" \
    -e "s#__WHATSAPP_CONNECTOR_IMAGE__#${WHATSAPP_CONNECTOR_IMAGE}#g" \
    -e "s#__AGENT_PORT__#${agent_port}#g" \
    -e "s#__CONNECTOR_PORT__#${connector_port}#g" \
    -e "s#__AGENT_INTERNAL_JWT_SECRET__#${AGENT_INTERNAL_JWT_SECRET}#g" \
    -e "s#__BACKEND_URL__#${BACKEND_URL}#g" \
    -e "s#__BACKEND_INTERNAL_URL__#${BACKEND_INTERNAL_URL}#g" \
    -e "s#__CONNECTOR_SECRET__#${CONNECTOR_SECRET}#g" \
    -e "s#__WHATSAPP_AUTOSTART__#${whatsapp_autostart}#g" \
    -e "s#__MINIO_ENDPOINT__#${MINIO_ENDPOINT}#g" \
    -e "s#__MINIO_PORT__#${MINIO_PORT}#g" \
    -e "s#__MINIO_USE_SSL__#${MINIO_USE_SSL}#g" \
    -e "s#__MINIO_ACCESS_KEY__#${MINIO_ACCESS_KEY}#g" \
    -e "s#__MINIO_SECRET_KEY__#${MINIO_SECRET_KEY}#g" \
    -e "s#__MINIO_BUCKET__#${MINIO_BUCKET}#g" \
    -e "s#__GEMINI_API_KEY__#${GEMINI_API_KEY}#g" \
    -e "s#__GEMINI_MODEL__#${GEMINI_MODEL}#g" \
    -e "s#__XAI_API_KEY__#${XAI_API_KEY}#g" \
    -e "s#__XAI_MODEL__#${XAI_MODEL}#g" \
    -e "s#__PRIMARY_MODEL__#${PRIMARY_MODEL}#g" \
    -e "s#__FALLBACK_MODEL__#${FALLBACK_MODEL}#g" \
    -e "s#__PUPPETEER_EXECUTABLE_PATH__#${PUPPETEER_EXECUTABLE_PATH}#g" \
    "${TEMPLATE_FILE}" | sed 's/^/  /' >> "${OUTPUT_FILE}"

  volume_lines+=("  ${stack_name}_redis:")
  volume_lines+=("  ${stack_name}_postgres:")
  volume_lines+=("  ${stack_name}_qdrant:")
  volume_lines+=("  ${stack_name}_connector:")
done

# Add shared Caddy edge service with hostname-based routing
depends_lines=""
for slot in $(seq 1 "${STACKS_PER_VPS}"); do
  stack_name="${STACK_PREFIX}-s${slot}"
  if [[ -n "${depends_lines}" ]]; then
    depends_lines="${depends_lines}
"
  fi
  depends_lines="${depends_lines}      ${stack_name}_agent:
        condition: service_healthy
      ${stack_name}_connector:
        condition: service_healthy"
done

cat >> "${OUTPUT_FILE}" <<EDGE_EOF
  shared_edge:
    image: caddy:2-alpine
    restart: unless-stopped
    depends_on:
${depends_lines}
    ports:
      - "443:443"
      - "80:80"
    volumes:
      - ./caddy/Caddyfile:/etc/caddy/Caddyfile:ro
      - ./certs/origin.crt:/certs/origin.crt:ro
      - ./certs/origin.key:/certs/origin.key:ro
    healthcheck:
      test: ["CMD", "caddy", "validate", "--config", "/etc/caddy/Caddyfile"]
      interval: 20s
      timeout: 5s
      retries: 10
    networks:
      - bedones_private

EDGE_EOF

cat >> "${OUTPUT_FILE}" <<EOF
networks:
  bedones_private:
    external: true
    name: bedones_private

volumes:
EOF

for line in "${volume_lines[@]}"; do
  echo "${line}" >> "${OUTPUT_FILE}"
done

echo "Rendered stack to ${OUTPUT_FILE}"
