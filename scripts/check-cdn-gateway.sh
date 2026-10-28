#!/usr/bin/env bash
# Health probe for the IPFS gateway proxy at cdn.{testnet.,}onsocial.id,
# including the imgproxy variant route (/img/<w>/ipfs/<cid>).
#
# Usage:
#   scripts/check-cdn-gateway.sh                     # checks both testnet + mainnet
#   scripts/check-cdn-gateway.sh testnet             # checks only testnet
#   scripts/check-cdn-gateway.sh mainnet             # checks only mainnet
#
# Env overrides:
#   TESTNET_PROBE_CID  default: bafkreigh2akiscaildcqabsyg3dfr6chu3fgpregiymsck7e7aqa4s52zy (IPFS hello-world)
#   MAINNET_PROBE_CID  default: same as testnet
#   TIMEOUT_S          default: 10
#
# Variant probe (imgproxy resizes):
#   VARIANT_PROBE_CID  pinned *image* CID to request through /img/<w>/ipfs/.
#                      Optional: when unset the variant probe is skipped with a
#                      notice (exit code stays 0). The dedicated Lighthouse
#                      gateway only serves pinned CIDs, so pick any image CID
#                      from a recent post/avatar (copy image address in the app).
#   VARIANT_PROBE_SUBPATH
#                      Optional variation seat-art suffix (e.g. "/3.png")
#                      appended to the CID — probes the subpath variant route
#                      (g9). Needs a CID whose folder actually holds that file.
#   VARIANT_WIDTH      default: 384 (must be one of 128/384/1080/1920)
#
# Base URL overrides (soak a stack before DNS, e.g. local Docker):
#   TESTNET_CDN_BASE   default: https://cdn.testnet.onsocial.id
#   MAINNET_CDN_BASE   default: https://cdn.onsocial.id
#
# Exit codes: 0 = all probes ok, 1 = at least one probe failed.
# Suitable for cron / systemd timers / uptime checks.

set -u

DEFAULT_CID="bafkreigh2akiscaildcqabsyg3dfr6chu3fgpregiymsck7e7aqa4s52zy"
TESTNET_CID="${TESTNET_PROBE_CID:-$DEFAULT_CID}"
MAINNET_CID="${MAINNET_PROBE_CID:-$DEFAULT_CID}"
TIMEOUT_S="${TIMEOUT_S:-10}"

TESTNET_BASE="${TESTNET_CDN_BASE:-https://cdn.testnet.onsocial.id}"
MAINNET_BASE="${MAINNET_CDN_BASE:-https://cdn.onsocial.id}"

VARIANT_WIDTH="${VARIANT_WIDTH:-384}"
VARIANT_CID="${VARIANT_PROBE_CID:-}${VARIANT_PROBE_SUBPATH:-}"

probe() {
  local network="$1" base="$2" cid="$3"
  local url="${base}/ipfs/${cid}"
  local code
  code="$(curl -sS -o /dev/null -w '%{http_code}' \
    --max-time "$TIMEOUT_S" \
    -H 'Accept: */*' \
    "$url" 2>/dev/null || echo 000)"

  if [[ "$code" = "200" ]]; then
    echo "OK     ${network}  ${base}  HTTP ${code}"
    return 0
  fi
  echo "FAIL   ${network}  ${base}  HTTP ${code}  (${url})" >&2
  return 1
}

# A variant URL must return 200 *and* an image body — a pass-through of an
# upstream 403/404 would prove nothing about the resize pipeline.
probe_variant() {
  local network="$1" base="$2" cid="$3" width="$4"
  local url="${base}/img/${width}/ipfs/${cid}"
  local code ctype
  code="$(curl -sS -o /dev/null -w '%{http_code}' \
    --max-time "$TIMEOUT_S" \
    -H 'Accept: image/avif,image/webp,image/*' \
    "$url" 2>/dev/null || echo 000)"
  ctype="$(curl -sS -o /dev/null -w '%{content_type}' \
    --max-time "$TIMEOUT_S" \
    -H 'Accept: image/avif,image/webp,image/*' \
    "$url" 2>/dev/null || echo '')"

  if [[ "$code" = "200" && "$ctype" = image/* ]]; then
    echo "OK     ${network}  variant ${width}w  HTTP ${code}  ${ctype}"
    return 0
  fi
  echo "FAIL   ${network}  variant ${width}w  HTTP ${code}  ${ctype}  (${url})" >&2
  return 1
}

probe_network() {
  local network="$1" base="$2" cid="$3"
  local rc=0
  probe "$network" "$base" "$cid" || rc=1
  if [[ -n "$VARIANT_CID" ]]; then
    probe_variant "$network" "$base" "$VARIANT_CID" "$VARIANT_WIDTH" || rc=1
  else
    echo "SKIP   ${network}  variant probe (set VARIANT_PROBE_CID to a pinned image CID)"
  fi
  return "$rc"
}

target="${1:-both}"
rc=0

case "$target" in
  testnet)
    probe_network testnet "$TESTNET_BASE" "$TESTNET_CID" || rc=1
    ;;
  mainnet)
    probe_network mainnet "$MAINNET_BASE" "$MAINNET_CID" || rc=1
    ;;
  both|"")
    probe_network testnet "$TESTNET_BASE" "$TESTNET_CID" || rc=1
    probe_network mainnet "$MAINNET_BASE" "$MAINNET_CID" || rc=1
    ;;
  *)
    echo "Unknown target: $target (expected: testnet | mainnet | both)" >&2
    exit 2
    ;;
esac

exit "$rc"
