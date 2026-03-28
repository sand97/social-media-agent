#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLIENT_DIR="${ROOT_DIR}/dist/client"
SERVER_DIR="${ROOT_DIR}/dist/server"
OUTPUT_DIR="${ROOT_DIR}/.cloudflare-pages"

if [[ ! -d "${CLIENT_DIR}" ]]; then
  echo "Missing client build directory: ${CLIENT_DIR}" >&2
  exit 1
fi

if [[ ! -d "${SERVER_DIR}" ]]; then
  echo "Missing server build directory: ${SERVER_DIR}" >&2
  exit 1
fi

rm -rf "${OUTPUT_DIR}"
mkdir -p "${OUTPUT_DIR}"

cp -R "${CLIENT_DIR}/." "${OUTPUT_DIR}/"

mkdir -p "${OUTPUT_DIR}/assets"

while IFS= read -r source_file; do
  relative_path="${source_file#"${SERVER_DIR}/assets/"}"
  target_file="${OUTPUT_DIR}/assets/${relative_path}"

  mkdir -p "$(dirname "${target_file}")"

  if [[ -f "${target_file}" ]]; then
    if cmp -s "${source_file}" "${target_file}"; then
      continue
    fi

    echo "Asset collision with different content: assets/${relative_path}" >&2
    exit 1
  fi

  cp "${source_file}" "${target_file}"
done < <(find "${SERVER_DIR}/assets" -type f | sort)

sed 's|//# sourceMappingURL=index.js.map|//# sourceMappingURL=_worker.js.map|' \
  "${SERVER_DIR}/index.js" > "${OUTPUT_DIR}/_worker.js"
cp "${SERVER_DIR}/index.js.map" "${OUTPUT_DIR}/_worker.js.map"

echo "Prepared Cloudflare Pages bundle in ${OUTPUT_DIR}"
