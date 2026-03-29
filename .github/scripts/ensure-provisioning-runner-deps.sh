#!/usr/bin/env bash

set -euo pipefail

require_step="false"
if [[ "${1:-}" == "--with-step" ]]; then
  require_step="true"
fi

missing=()

for cmd in jq curl ssh scp; do
  if ! command -v "${cmd}" >/dev/null 2>&1; then
    missing+=("${cmd}")
  fi
done

if [[ "${#missing[@]}" -eq 0 ]]; then
  echo "Provisioning runner dependencies already installed."
  exit 0
fi

if ! command -v apt-get >/dev/null 2>&1; then
  echo "Missing required commands: ${missing[*]}" >&2
  echo "apt-get is not available on this self-hosted runner." >&2
  exit 1
fi

apt_runner=(apt-get)
if [[ "$(id -u)" -ne 0 ]]; then
  if command -v sudo >/dev/null 2>&1; then
    if sudo -n true >/dev/null 2>&1; then
      apt_runner=(sudo -n apt-get)
    else
      echo "Missing required commands: ${missing[*]}" >&2
      echo "Runner user cannot use sudo non-interactively." >&2
      echo "Install jq, curl, openssh-client, ca-certificates and step-cli on the runner, or grant passwordless sudo." >&2
      exit 1
    fi
  else
    echo "Missing required commands: ${missing[*]}" >&2
    echo "Runner is not root and sudo is not available." >&2
    exit 1
  fi
fi

"${apt_runner[@]}" update
"${apt_runner[@]}" install -y --no-install-recommends jq curl openssh-client ca-certificates

echo "Installed provisioning runner dependencies: ${missing[*]}"

if [[ "${require_step}" == "true" ]] && ! command -v step >/dev/null 2>&1; then
  echo "step CLI is required on the self-hosted runner but is not installed." >&2
  echo "Install Smallstep step-cli on the runner before rerunning this workflow." >&2
  exit 1
fi
