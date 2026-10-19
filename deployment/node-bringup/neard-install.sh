#!/usr/bin/env bash
# neard-install.sh — build + install neard 2.14.0-rc.2 (testnet, protocol 87)
# on the node box, then configure and start the systemd unit.
#
# Why a source build: the 2.14.0-rc.2 GitHub release ships NO prebuilt binary
# (source-only RC), and testnet validators run exactly this rev — older
# nearcore does not speak protocol 87. Build runs ON the box (~40-70 min on
# the 3700X), never on a laptop. Monthly rev-bumps re-run this script with a
# new NEARD_REF.
#
# Run as root AFTER bringup.sh:
#   NEARD_REF=2.14.0-rc.2 bash neard-install.sh
set -euo pipefail

NEARD_REF="${NEARD_REF:-2.14.0-rc.2}"
SRC=/opt/nearcore-src
NEAR_HOME=/var/lib/near

echo "=== [1/5] build dependencies ==="
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq \
  build-essential clang cmake pkg-config libssl-dev libclang-dev \
  git curl protobuf-compiler

echo "=== [2/5] rust toolchain ==="
if ! command -v rustup >/dev/null 2>&1; then
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal
fi
# shellcheck disable=SC1091
source "$HOME/.cargo/env"

echo "=== [3/5] fetch nearcore $NEARD_REF ==="
if [ ! -d "$SRC/.git" ]; then
  git clone --depth 1 --branch "$NEARD_REF" https://github.com/near/nearcore "$SRC"
else
  git -C "$SRC" fetch --depth 1 origin "refs/tags/$NEARD_REF:refs/tags/$NEARD_REF"
  git -C "$SRC" checkout "$NEARD_REF"
fi

echo "=== [4/5] build neard (this is the long one — 40-70 min) ==="
# nearcore's rust-toolchain.toml pins the compiler; rustup fetches it on first
# cargo invocation. sha2 picks up SHA-NI at runtime via cpuid, so no special
# RUSTFLAGS are needed for the 3700X.
cargo build --release --bin neard --manifest-path "$SRC/Cargo.toml"
install -m 0755 "$SRC/target/release/neard" /usr/local/bin/neard
neard --version

echo "=== [5/5] init testnet home + config + service ==="
if [ ! -f "$NEAR_HOME/config.json" ]; then
  sudo -u near neard --home "$NEAR_HOME" init --chain-id testnet --download-genesis --download-config
fi

# RPC on loopback only (ufw has no 3030 either — belt and braces). GC stays at
# the default 5 epochs: this box has no spare cold disk; deep history is the
# S3 archive tier's job, not live disk.
jq '.rpc.addr = "127.0.0.1:3030"' "$NEAR_HOME/config.json" > "$NEAR_HOME/config.json.new"
mv "$NEAR_HOME/config.json.new" "$NEAR_HOME/config.json"
chown -R near:near "$NEAR_HOME"

install -m 0644 "$(dirname "$0")/near-node.service" /etc/systemd/system/near-node.service
systemctl daemon-reload
systemctl enable --now near-node

echo
echo 'neard installed and syncing. Watch it:'
echo '  journalctl -fu near-node'
echo '  curl -s 127.0.0.1:3030/status | jq .sync_info'
