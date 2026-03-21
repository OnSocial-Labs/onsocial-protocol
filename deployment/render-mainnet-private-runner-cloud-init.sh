#!/bin/bash
set -euo pipefail

usage() {
  cat <<'EOF'
Render the private mainnet runner cloud-init template with a fresh GitHub runner token.

Required environment:
  GITHUB_RUNNER_TOKEN    Fresh registration token from GitHub Actions

Optional environment:
  GITHUB_RUNNER_URL      Default: https://github.com/OnSocial-Labs/onsocial-protocol
  RUNNER_NAME            Default: onsocial-mainnet-private-runner-1
  RUNNER_GROUP           Default: empty
  OUTPUT_PATH            Default: deployment/cloud-init-mainnet-private-runner.rendered.yaml

Example:
  export GITHUB_RUNNER_TOKEN="$(gh api -X POST repos/OnSocial-Labs/onsocial-protocol/actions/runners/registration-token --jq .token)"
  bash deployment/render-mainnet-private-runner-cloud-init.sh
EOF
}

if [[ "${1:-}" = "-h" || "${1:-}" = "--help" ]]; then
  usage
  exit 0
fi

: "${GITHUB_RUNNER_TOKEN:?Set GITHUB_RUNNER_TOKEN}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE_PATH="$SCRIPT_DIR/cloud-init-mainnet-private-runner.yaml"
OUTPUT_PATH="${OUTPUT_PATH:-$SCRIPT_DIR/cloud-init-mainnet-private-runner.rendered.yaml}"
GITHUB_RUNNER_URL="${GITHUB_RUNNER_URL:-https://github.com/OnSocial-Labs/onsocial-protocol}"
RUNNER_NAME="${RUNNER_NAME:-onsocial-mainnet-private-runner-1}"
RUNNER_GROUP="${RUNNER_GROUP:-}"

python3 - "$TEMPLATE_PATH" "$OUTPUT_PATH" "$GITHUB_RUNNER_URL" "$GITHUB_RUNNER_TOKEN" "$RUNNER_NAME" "$RUNNER_GROUP" <<'PY'
from pathlib import Path
import sys

template_path = Path(sys.argv[1])
output_path = Path(sys.argv[2])
runner_url = sys.argv[3]
runner_token = sys.argv[4]
runner_name = sys.argv[5]
runner_group = sys.argv[6]

content = template_path.read_text()
content = content.replace("__GITHUB_RUNNER_URL__", runner_url)
content = content.replace("__GITHUB_RUNNER_TOKEN__", runner_token)
content = content.replace("__RUNNER_NAME__", runner_name)
content = content.replace("__RUNNER_GROUP__", runner_group)
output_path.write_text(content)
PY

echo "Rendered cloud-init written to $OUTPUT_PATH"