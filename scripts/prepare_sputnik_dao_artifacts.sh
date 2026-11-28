#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# SourceScan-verified Sputnik DAO 2.3.1 (matches live protocol DAOs).
DEFAULT_PIN="2b0f34a3860460f285307ec2ccf36345acbe05a2"

REPO_URL="${SPUTNIK_REPO_URL:-https://github.com/near-daos/sputnik-dao-contract}"
REF="${SPUTNIK_REF:-$DEFAULT_PIN}"
WORK_DIR="${SPUTNIK_WORK_DIR:-$HOME/.cache/onsocial-sputnik-dao-contract}"
OUTPUT_DIR="${SPUTNIK_OUTPUT_DIR:-$REPO_ROOT/deployment/governance-dao/artifacts}"
PATCH_FILE="${SPUTNIK_SELF_UPGRADE_PATCH:-$REPO_ROOT/deployment/governance-dao/patches/upgrade-self-blob.patch}"
# 1 (default): apply OnSocial UpgradeSelf blob-store patch. 0: vanilla upstream.
APPLY_SELF_UPGRADE="${SPUTNIK_SELF_UPGRADE:-1}"
# 1: cargo near build non-reproducible (faster). 0 (default): ./build.sh docker reproducible.
FAST_BUILD="${SPUTNIK_FAST_BUILD:-0}"

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

echo "Checking out $REF (clean tree)"
git -C "$WORK_DIR" checkout --detach "$REF"
git -C "$WORK_DIR" reset --hard "$REF"
git -C "$WORK_DIR" clean -fd

PATCH_APPLIED=0
PATCH_SHA=""
if [ "$APPLY_SELF_UPGRADE" = "1" ]; then
  if [ ! -f "$PATCH_FILE" ]; then
    echo "Self-upgrade patch not found: $PATCH_FILE" >&2
    exit 1
  fi
  echo "Applying OnSocial UpgradeSelf blob-store patch: $PATCH_FILE"
  git -C "$WORK_DIR" apply "$PATCH_FILE"
  PATCH_APPLIED=1
  PATCH_SHA="$(sha256sum "$PATCH_FILE" | awk '{print $1}')"
fi

if [ -n "${SPUTNIK_DAO_VERSION:-}" ]; then
  echo "Setting sputnikdao2 version to $SPUTNIK_DAO_VERSION"
  # Replace only the package version line under [package].
  awk -v ver="$SPUTNIK_DAO_VERSION" '
    BEGIN { in_pkg=0; done=0 }
    /^\[package\]/ { in_pkg=1 }
    in_pkg && /^version = / && !done {
      print "version = \"" ver "\""
      done=1
      next
    }
    /^\[/ && !/^\[package\]/ { in_pkg=0 }
    { print }
  ' "$WORK_DIR/sputnikdao2/Cargo.toml" >"$WORK_DIR/sputnikdao2/Cargo.toml.tmp"
  mv "$WORK_DIR/sputnikdao2/Cargo.toml.tmp" "$WORK_DIR/sputnikdao2/Cargo.toml"
fi

DAO_VERSION="$(
  awk '
    /^\[package\]/ { in_pkg=1 }
    in_pkg && /^version = / {
      gsub(/"/, "", $3)
      print $3
      exit
    }
    /^\[/ && !/^\[package\]/ { in_pkg=0 }
  ' "$WORK_DIR/sputnikdao2/Cargo.toml"
)"

if [ "$FAST_BUILD" = "1" ]; then
  echo "Building sputnikdao2 (fast / non-reproducible)"
  export CARGO_TARGET_DIR="$WORK_DIR/target"
  (
    cd "$WORK_DIR/sputnikdao2"
    cargo near build non-reproducible-wasm
  )
  # Fast path only needs the DAO wasm for self-upgrade work.
  DAO_WASM="$WORK_DIR/target/near/sputnikdao2/sputnikdao2.wasm"
  if [ ! -f "$DAO_WASM" ]; then
    alt="$(find "$WORK_DIR/target" -name 'sputnikdao2.wasm' 2>/dev/null | head -1 || true)"
    if [ -n "$alt" ]; then
      DAO_WASM="$alt"
    fi
  fi
  if [ ! -f "$DAO_WASM" ]; then
    echo "Expected DAO artifact not found after fast build under $CARGO_TARGET_DIR" >&2
    exit 1
  fi
  cp "$DAO_WASM" "$OUTPUT_DIR/sputnikdao2.wasm"
  STAKING_COPIED=0
  FACTORY_COPIED=0
else
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
  STAKING_COPIED=1
  FACTORY_COPIED=1
fi

COMMIT_ID="$(git -C "$WORK_DIR" rev-parse HEAD)"
DAO_SHA256="$(sha256sum "$OUTPUT_DIR/sputnikdao2.wasm" | awk '{print $1}')"

{
  echo "repo=$REPO_URL"
  echo "ref=$REF"
  echo "commit=$COMMIT_ID"
  echo "dao_wasm=sputnikdao2.wasm"
  echo "dao_version=$DAO_VERSION"
  echo "dao_wasm_sha256=$DAO_SHA256"
  echo "self_upgrade_patch=$PATCH_APPLIED"
  if [ "$PATCH_APPLIED" = "1" ]; then
    echo "self_upgrade_patch_file=patches/upgrade-self-blob.patch"
    echo "self_upgrade_patch_sha256=$PATCH_SHA"
  fi
  echo "fast_build=$FAST_BUILD"
  if [ "${STAKING_COPIED:-0}" = "1" ]; then
    echo "staking_wasm=sputnik_staking.wasm"
  fi
  if [ "${FACTORY_COPIED:-0}" = "1" ]; then
    echo "factory_wasm=sputnikdao_factory2.wasm"
  fi
} >"$OUTPUT_DIR/manifest.txt"

echo "Artifacts written to $OUTPUT_DIR"
echo "Pinned commit: $COMMIT_ID"
echo "DAO version: $DAO_VERSION"
echo "DAO sha256: $DAO_SHA256"
