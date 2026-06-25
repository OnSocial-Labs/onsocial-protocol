#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

REPO_URL="${SPUTNIK_REPO_URL:-https://github.com/near-daos/sputnik-dao-contract}"
REF="${SPUTNIK_REF:-main}"
WORK_DIR="${SPUTNIK_WORK_DIR:-$HOME/.cache/onsocial-sputnik-dao-contract}"
OUTPUT_DIR="${SPUTNIK_OUTPUT_DIR:-$REPO_ROOT/deployment/governance-dao/artifacts}"

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 1
  }
}

require_cmd git
require_cmd cargo
require_cmd near

mkdir -p "$WORK_DIR" "$OUTPUT_DIR"

if [ ! -d "$WORK_DIR/.git" ]; then
  echo "Cloning Sputnik DAO repo into $WORK_DIR"
  git clone "$REPO_URL" "$WORK_DIR"
fi

echo "Fetching latest refs"
git -C "$WORK_DIR" fetch --tags --prune origin

echo "Checking out $REF"
git -C "$WORK_DIR" checkout "$REF"

if git -C "$WORK_DIR" rev-parse --verify "origin/$REF" >/dev/null 2>&1; then
  git -C "$WORK_DIR" reset --hard "origin/$REF"
fi

echo "Building reproducible Sputnik DAO artifacts"
(
  cd "$WORK_DIR"
  ./build.sh
)

DAO_WASM="$WORK_DIR/target/near/sputnikdao2/sputnikdao2.wasm"
STAKING_WASM="$WORK_DIR/target/near/sputnik_staking/sputnik_staking.wasm"
FACTORY_WASM="$WORK_DIR/target/near/sputnikdao_factory2/sputnikdao_factory2.wasm"

for file in "$DAO_WASM" "$STAKING_WASM" "$FACTORY_WASM"; do
  if [ ! -f "$file" ]; then
    echo "Expected artifact not found: $file" >&2
    exit 1
  fi
done

cp "$DAO_WASM" "$OUTPUT_DIR/"
cp "$STAKING_WASM" "$OUTPUT_DIR/"
cp "$FACTORY_WASM" "$OUTPUT_DIR/"

COMMIT_ID="$(git -C "$WORK_DIR" rev-parse HEAD)"

cat > "$OUTPUT_DIR/manifest.txt" <<EOF
repo=$REPO_URL
ref=$REF
commit=$COMMIT_ID
dao_wasm=sputnikdao2.wasm
staking_wasm=sputnik_staking.wasm
factory_wasm=sputnikdao_factory2.wasm
EOF

echo "Artifacts written to $OUTPUT_DIR"
echo "Pinned commit: $COMMIT_ID"