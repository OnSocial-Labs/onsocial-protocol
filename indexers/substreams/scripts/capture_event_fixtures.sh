#!/usr/bin/env bash
# capture_event_fixtures.sh — Fetch real EVENT_JSON logs from testnet transactions.
#
# Usage:
#   ./scripts/capture_event_fixtures.sh <tx_hash> <signer_account_id>
#
# Example:
#   ./scripts/capture_event_fixtures.sh 7svezQKXXLirHzWMD1rm9ixgg7Ab5GmLRmD126HxoW6A core.onsocial.testnet
#
# Requirements: curl, python3
# Cost: FREE — uses public NEAR RPC, not StreamingFast.
#
# NOTE: NEAR RPC garbage-collects old transactions after ~2 epochs (~48h).
#       For older txs, use an archival RPC endpoint:
#         NEAR_RPC=https://archival-rpc.testnet.near.org ./scripts/capture_event_fixtures.sh ...

set -euo pipefail

TX_HASH="${1:?Usage: $0 <tx_hash> <signer_account_id>}"
SIGNER="${2:?Usage: $0 <tx_hash> <signer_account_id>}"
NEAR_RPC="${NEAR_RPC:-https://rpc.testnet.near.org}"

TMPFILE=$(mktemp)
trap 'rm -f "$TMPFILE"' EXIT

curl --connect-timeout 10 --max-time 30 -sf "${NEAR_RPC}" \
  -H 'Content-Type: application/json' \
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tx\",\"params\":[\"${TX_HASH}\",\"${SIGNER}\"]}" \
  -o "$TMPFILE"

python3 - "$TMPFILE" << 'PYTHON_EOF'
import json, sys

data = json.load(open(sys.argv[1]))

if "error" in data:
    print(f"RPC Error: {json.dumps(data['error'], indent=2)}", file=sys.stderr)
    sys.exit(1)

result = data["result"]
tx_hash = result["transaction"]["hash"]

found = False
for i, ro in enumerate(result.get("receipts_outcome", [])):
    receipt_id = ro["id"]
    logs = ro["outcome"]["logs"]
    event_logs = [l for l in logs if l.startswith("EVENT_JSON:")]
    if event_logs:
        found = True
        receiver = ro["outcome"].get("executor_account_id", "?")
        for j, log_line in enumerate(event_logs):
            event_json = log_line[len("EVENT_JSON:"):]
            parsed = json.loads(event_json)
            print(f"// Source: tx={tx_hash} receipt={receipt_id} receiver={receiver}")
            print(f"// Event: {parsed.get('event', '?')} standard={parsed.get('standard', '?')}")
            print(json.dumps(parsed))
            print()

if not found:
    print(f"No EVENT_JSON logs found in tx {tx_hash}", file=sys.stderr)
    sys.exit(1)
PYTHON_EOF
