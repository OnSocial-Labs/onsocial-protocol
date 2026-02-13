#!/usr/bin/env python3
"""End-to-end developer experience: JWT login → gasless write via relay.

1. Sign "OnSocial Auth: <timestamp>" with the account's ed25519 key
2. POST /auth/login → get JWT
3. POST /relay/execute with JWT → gasless write to core contract
4. Read back the written data from NEAR RPC

Usage:
  python3 scripts/test_jwt_gasless.py

Environment:
  GATEWAY_URL  - Gateway base URL (default: https://api.onsocial.id)
  ACCOUNT_ID   - NEAR account  (default: test01.onsocial.testnet)
  CREDS_FILE   - Path to NEAR credentials JSON
"""

import base64
import json
import os
import sys
import time
import urllib.request
import urllib.error

import base58
import nacl.signing

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
GATEWAY_URL = os.environ.get("GATEWAY_URL", "https://api.onsocial.id")
ACCOUNT_ID = os.environ.get("ACCOUNT_ID", "test01.onsocial.testnet")
CONTRACT_ID = os.environ.get("CONTRACT_ID", "core.onsocial.testnet")
CREDS_FILE = os.environ.get(
    "CREDS_FILE",
    os.path.expanduser(f"~/.near-credentials/testnet/{ACCOUNT_ID}.json"),
)


def load_keypair(creds_file: str):
    with open(creds_file) as f:
        creds = json.load(f)
    secret_bytes = base58.b58decode(creds["private_key"].split(":")[1])
    signing_key = nacl.signing.SigningKey(secret_bytes[:32])
    public_key_str = creds["public_key"]
    return signing_key, public_key_str


def api(method: str, path: str, body=None, token=None):
    """Make an HTTP request to the gateway."""
    url = f"{GATEWAY_URL}{path}"
    data = json.dumps(body).encode() if body else None
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read())
            return resp.status, result
    except urllib.error.HTTPError as e:
        body_text = e.read().decode()
        try:
            return e.code, json.loads(body_text)
        except json.JSONDecodeError:
            return e.code, {"raw": body_text}


def rpc_read(account_id: str, contract_id: str, key: str):
    """Read a value from the core contract via NEAR RPC."""
    args = json.dumps({"keys": [f"{account_id}/{key}"]})
    args_b64 = base64.b64encode(args.encode()).decode()
    rpc_body = {
        "jsonrpc": "2.0", "id": 1, "method": "query",
        "params": {
            "request_type": "call_function",
            "finality": "final",
            "account_id": contract_id,
            "method_name": "get",
            "args_base64": args_b64,
        },
    }
    req = urllib.request.Request(
        "https://rpc.testnet.near.org",
        data=json.dumps(rpc_body).encode(),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        r = json.loads(resp.read())
        return bytes(r["result"]["result"]).decode()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    timestamp = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())

    print("=" * 60)
    print("  OnSocial JWT → Gasless Write (Developer Flow)")
    print("=" * 60)
    print(f"\n  Gateway:  {GATEWAY_URL}")
    print(f"  Account:  {ACCOUNT_ID}")
    print(f"  Contract: {CONTRACT_ID}")

    # ── Step 1: Load keypair ──────────────────────────────────────────
    signing_key, public_key_str = load_keypair(CREDS_FILE)
    print(f"  Key:      {public_key_str[:30]}...\n")

    # ── Step 2: Sign auth message ─────────────────────────────────────
    message = f"OnSocial Auth: {timestamp}"
    signed = signing_key.sign(message.encode())
    signature_b64 = base64.b64encode(signed.signature).decode()

    print(f"[1/5] Logging in...")
    print(f"      Message: {message}")

    # ── Step 3: POST /auth/login → JWT ────────────────────────────────
    status, result = api("POST", "/auth/login", {
        "accountId": ACCOUNT_ID,
        "message": message,
        "signature": signature_b64,
        "publicKey": public_key_str,
    })

    if status != 200:
        print(f"\n  ❌ Login failed ({status}):")
        print(f"     {json.dumps(result, indent=2)}")
        sys.exit(1)

    token = result["token"]
    tier = result.get("tier", "?")
    print(f"      ✅ JWT received (tier: {tier}, expires: {result.get('expiresIn', '?')})")
    print(f"      Token: {token[:40]}...")

    # ── Step 4: Check /auth/me ────────────────────────────────────────
    print(f"\n[2/5] Verifying session...")
    status, me = api("GET", "/auth/me", token=token)
    if status == 200:
        print(f"      ✅ Authenticated as: {me.get('accountId')} (tier: {me.get('tier')})")
    else:
        print(f"      ⚠️  /auth/me returned {status}: {me}")

    # ── Step 5: POST /relay/execute → gasless write ───────────────────
    write_value = f"JWT gasless write at {timestamp}"
    action = {
        "type": "set",
        "data": {
            "profile/jwt_test": write_value,
        },
    }

    print(f"\n[3/5] Sending gasless write...")
    print(f"      Action: set profile/jwt_test = \"{write_value}\"")

    status, relay_result = api("POST", "/relay/execute", {
        "action": action,
    }, token=token)

    if status in (200, 202):
        tx_hash = relay_result.get("tx_hash", relay_result.get("result", {}).get("tx_hash", "?"))
        print(f"      ✅ Transaction sent! (status: {status})")
        print(f"      tx_hash: {tx_hash}")
        print(f"      Full response: {json.dumps(relay_result, indent=2)}")
    else:
        print(f"\n      ❌ Relay failed ({status}):")
        print(f"      {json.dumps(relay_result, indent=2)}")
        sys.exit(1)

    # ── Step 6: Read back from NEAR RPC ───────────────────────────────
    print(f"\n[4/5] Reading back from chain (waiting 3s for finality)...")
    time.sleep(3)

    try:
        data = rpc_read(ACCOUNT_ID, CONTRACT_ID, "profile/jwt_test")
        print(f"      ✅ On-chain value: {data}")
    except Exception as e:
        print(f"      ⚠️  Read failed: {e}")

    # ── Step 7: Query indexed event via Hasura GraphQL ────────────────
    print(f"\n[5/5] Querying indexed events via Hasura...")
    time.sleep(2)

    # First check indexer head block
    head_query = {
        "query": """{ dataUpdates(orderBy: {blockHeight: DESC}, limit: 1) { blockHeight } }""",
    }
    status_h, head_result = api("POST", "/graph/query", head_query, token=token)
    indexer_head = None
    if status_h == 200 and "data" in head_result:
        heads = head_result["data"].get("dataUpdates", [])
        if heads:
            indexer_head = int(heads[0]["blockHeight"])
            print(f"      Indexer head block: {indexer_head:,}")

    graphql_query = {
        "query": """query RecentUpdates($accountId: String!, $limit: Int!) {
  dataUpdates(
    where: { accountId: { _eq: $accountId } }
    orderBy: { blockTimestamp: DESC }
    limit: $limit
  ) {
    id
    operation
    dataType
    path
    value
    blockHeight
    blockTimestamp
    author
    receiptId
  }
}""",
        "variables": {
            "accountId": ACCOUNT_ID,
            "limit": 3,
        },
    }

    status, gql_result = api("POST", "/graph/query", graphql_query, token=token)

    if status == 200 and "data" in gql_result:
        events = gql_result["data"].get("dataUpdates", [])
        if events:
            print(f"      ✅ Found {len(events)} indexed event(s):")
            for i, ev in enumerate(events):
                print(f"\n      ── Event {i + 1} ──")
                print(f"         operation:  {ev.get('operation')}")
                print(f"         path:       {ev.get('path')}")
                print(f"         value:      {ev.get('value', '(none)')[:80]}")
                print(f"         author:     {ev.get('author')}")
                print(f"         block:      {ev.get('blockHeight')}")
                print(f"         receipt:    {ev.get('receiptId')}")
        else:
            if indexer_head and tx_hash != "?":
                print(f"      ⏳ No events for this account yet")
                print(f"         Indexer is at block {indexer_head:,} — write was at a newer block")
                print(f"         The event will appear once the indexer catches up")
            else:
                print(f"      ⚠️  No indexed events yet (indexer may still be catching up)")
    else:
        print(f"      ⚠️  Hasura query returned {status}:")
        print(f"         {json.dumps(gql_result, indent=2)[:300]}")

    print(f"\n{'=' * 60}")
    print(f"  Done! The full developer flow:")
    print(f"    1. Sign message with NEAR key")
    print(f"    2. POST /auth/login → JWT")
    print(f"    3. POST /relay/execute + Bearer JWT → gasless tx")
    print(f"    4. Read back from NEAR RPC (on-chain confirmation)")
    print(f"    5. POST /graph/query + Bearer JWT → indexed event")
    print(f"  Zero gas paid. Full read/write via JWT.")
    print(f"{'=' * 60}")


if __name__ == "__main__":
    main()
