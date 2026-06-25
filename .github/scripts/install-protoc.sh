#!/usr/bin/env bash
# Install protoc from official GitHub releases (no Node.js action required).
set -euo pipefail

PROTOC_VERSION="${PROTOC_VERSION:-28.3}"
OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"

case "${OS}-${ARCH}" in
  linux-x86_64) ASSET="protoc-${PROTOC_VERSION}-linux-x86_64.zip" ;;
  linux-aarch64 | linux-arm64) ASSET="protoc-${PROTOC_VERSION}-linux-aarch_64.zip" ;;
  darwin-x86_64) ASSET="protoc-${PROTOC_VERSION}-osx-x86_64.zip" ;;
  darwin-arm64) ASSET="protoc-${PROTOC_VERSION}-osx-aarch_64.zip" ;;
  *)
    echo "error: unsupported platform ${OS} ${ARCH}" >&2
    exit 1
    ;;
esac

URL="https://github.com/protocolbuffers/protobuf/releases/download/v${PROTOC_VERSION}/${ASSET}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "Installing protoc ${PROTOC_VERSION} (${ASSET})"
curl -fsSL -o "${TMP}/protoc.zip" "$URL"
sudo unzip -oq "${TMP}/protoc.zip" -d /usr/local bin/protoc 'include/*'
protoc --version
