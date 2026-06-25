#!/usr/bin/env bash
# Health probe for the IPFS gateway proxy at cdn.{testnet.,}onsocial.id.
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
# Exit codes: 0 = all probes ok, 1 = at least one probe failed.
# Suitable for cron / systemd timers / uptime checks.

set -u

DEFAULT_CID="bafkreigh2akiscaildcqabsyg3dfr6chu3fgpregiymsck7e7aqa4s52zy"
TESTNET_CID="${TESTNET_PROBE_CID:-$DEFAULT_CID}"
MAINNET_CID="${MAINNET_PROBE_CID:-$DEFAULT_CID}"
TIMEOUT_S="${TIMEOUT_S:-10}"

probe() {
  local network="$1" host="$2" cid="$3"
  local url="https://${host}/ipfs/${cid}"
  local code
  code="$(curl -sS -o /dev/null -w '%{http_code}' \
    --max-time "$TIMEOUT_S" \
    -H 'Accept: */*' \
    "$url" 2>/dev/null || echo 000)"

  if [[ "$code" = "200" ]]; then
    echo "OK     ${network}  ${host}  HTTP ${code}"
    return 0
  fi
  echo "FAIL   ${network}  ${host}  HTTP ${code}  (${url})" >&2
  return 1
}

target="${1:-both}"
rc=0

case "$target" in
  testnet)
    probe testnet cdn.testnet.onsocial.id "$TESTNET_CID" || rc=1
    ;;
  mainnet)
    probe mainnet cdn.onsocial.id "$MAINNET_CID" || rc=1
    ;;
  both|"")
    probe testnet cdn.testnet.onsocial.id "$TESTNET_CID" || rc=1
    probe mainnet cdn.onsocial.id "$MAINNET_CID" || rc=1
    ;;
  *)
    echo "Unknown target: $target (expected: testnet | mainnet | both)" >&2
    exit 2
    ;;
esac

exit $rc
