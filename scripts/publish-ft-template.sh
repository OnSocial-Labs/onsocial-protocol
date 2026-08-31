#!/usr/bin/env bash
# Publish contracts/token-onsocial as a NEAR global contract (immutable hash
# mode) so the app's Create-token flow can deploy user FTs via
# UseGlobalContract. Prints the NEXT_PUBLIC_FT_TEMPLATE_CODE_HASH line to set.
#
# Usage:
#   scripts/publish-ft-template.sh --account you.testnet [--network testnet]
#   scripts/publish-ft-template.sh --account you.near --network mainnet --skip-build
set -euo pipefail

NETWORK="testnet"
SIGNER=""
SKIP_BUILD=0
WASM_OVERRIDE=""

while [ $# -gt 0 ]; do
  case "$1" in
    --account) SIGNER="$2"; shift 2 ;;
    --network) NETWORK="$2"; shift 2 ;;
    --wasm) WASM_OVERRIDE="$2"; shift 2 ;;
    --skip-build) SKIP_BUILD=1; shift ;;
    -h|--help)
      grep '^#' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) echo "Unknown arg: $1" >&2; exit 1 ;;
  esac
done

if [ -z "$SIGNER" ]; then
  echo "Error: --account <signer> is required (pays for the global publish)." >&2
  exit 1
fi
case "$NETWORK" in
  testnet|mainnet) ;;
  *) echo "Error: --network must be testnet or mainnet." >&2; exit 1 ;;
esac

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WASM="${WASM_OVERRIDE:-$ROOT/target/near/token_onsocial/token_onsocial.wasm}"

if [ "$SKIP_BUILD" -eq 0 ]; then
  echo "Building token-onsocial (cargo near build)…"
  cd "$ROOT/contracts/token-onsocial"
  cargo near build
  cd "$ROOT"
fi

if [ ! -f "$WASM" ]; then
  echo "Error: wasm not found at $WASM" >&2
  exit 1
fi

# Global-contract code hash = base58(sha256(wasm)) — same value the app probe
# checks via view_global_contract_code. Self-contained (no npm deps).
CODE_HASH="$(node - "$WASM" <<'NODE'
const crypto = require('crypto');
const fs = require('fs');
const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function base58Encode(buf) {
  const digits = [0];
  for (const byte of buf) {
    let carry = byte;
    for (let i = 0; i < digits.length; i++) {
      const v = (digits[i] << 8) + carry;
      digits[i] = v % 58;
      carry = (v / 58) | 0;
    }
    while (carry) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let out = '';
  for (const byte of buf) {
    if (byte === 0) out += '1';
    else break;
  }
  return out + digits.reverse().map((d) => ALPHABET[d]).join('');
}
const wasm = fs.readFileSync(process.argv[2]);
console.log(base58Encode(crypto.createHash('sha256').update(wasm).digest()));
NODE
)"

echo "Wasm: $WASM"
echo "Code hash (base58 sha256): $CODE_HASH"
echo
echo "Publishing as global contract (immutable hash) on $NETWORK as $SIGNER…"
near contract deploy-as-global use-file "$WASM" as-global-hash "$SIGNER" \
  network-config "$NETWORK" sign-with-keychain send

cat <<EOF

Published. Now set the app env and rebuild:

  NEXT_PUBLIC_FT_TEMPLATE_CODE_HASH=$CODE_HASH

Verify from the running app: open /api/ft-template — it should report ready.
EOF
