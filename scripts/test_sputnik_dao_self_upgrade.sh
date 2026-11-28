#!/usr/bin/env bash
# Clone/pin Sputnik, apply OnSocial UpgradeSelf patch, run blob-store upgrade tests.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

DEFAULT_PIN="2b0f34a3860460f285307ec2ccf36345acbe05a2"
REPO_URL="${SPUTNIK_REPO_URL:-https://github.com/near-daos/sputnik-dao-contract}"
REF="${SPUTNIK_REF:-$DEFAULT_PIN}"
WORK_DIR="${SPUTNIK_WORK_DIR:-$HOME/.cache/onsocial-sputnik-dao-contract}"
PATCH_FILE="${SPUTNIK_SELF_UPGRADE_PATCH:-$REPO_ROOT/deployment/governance-dao/patches/upgrade-self-blob.patch}"

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 1
  }
}

require_cmd git
require_cmd cargo

mkdir -p "$(dirname "$WORK_DIR")"

if [ ! -d "$WORK_DIR/.git" ]; then
  echo "Cloning Sputnik DAO repo into $WORK_DIR"
  git clone "$REPO_URL" "$WORK_DIR"
fi

echo "Fetching latest refs"
git -C "$WORK_DIR" fetch --tags --prune origin

echo "Checking out $REF (clean tree)"
git -C "$WORK_DIR" checkout --detach "$REF"
git -C "$WORK_DIR" reset --hard "$REF"
git -C "$WORK_DIR" clean -fd

if [ ! -f "$PATCH_FILE" ]; then
  echo "Self-upgrade patch not found: $PATCH_FILE" >&2
  exit 1
fi

echo "Applying OnSocial UpgradeSelf blob-store patch: $PATCH_FILE"
git -C "$WORK_DIR" apply "$PATCH_FILE"

echo "Verifying Cargo.lock matches package version (--locked)"
(
  cd "$WORK_DIR/sputnikdao2"
  cargo metadata --locked --format-version 1 >/dev/null
)

echo "Running UpgradeSelf blob-store workspaces tests"
(
  cd "$WORK_DIR/sputnikdao2"
  # Filter matches the four OnSocial blob-store cases (happy + 3 negatives).
  cargo test --test test_upgrade test_upgrade_self_ -- --nocapture
)

echo "DAO self-upgrade tests passed."
