#!/usr/bin/env python3
"""Test delegate action relay via the relayer /execute endpoint.

DelegateAction auth = SignedPayload + an additional `action` (delegate_action)
field that is also covered by the signature. The domain prefix differs:
  onsocial:execute:delegate:v1:{contract_id}

Bypasses the gateway (which gates this behind pro tier) and sends directly
to the relayer at relay.onsocial.id.
"""

import base64
import hashlib
import json
import os
import sys
import time

import base58
import nacl.signing

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
RELAYER_URL = os.environ.get("RELAYER_URL", "https://relay.onsocial.id")
CONTRACT_ID = os.environ.get("CONTRACT_ID", "core.onsocial.testnet")
ACCOUNT_ID = os.environ.get("ACCOUNT_ID", "test01.onsocial.testnet")
CREDS_FILE = os.environ.get(
    "CREDS_FILE",
    os.path.expanduser(f"~/.near-credentials/testnet/{ACCOUNT_ID}.json"),
)
NONCE = int(os.environ.get("NONCE", "3"))
EXPIRES_IN_MS = int(os.environ.get("EXPIRES_IN_MS", str(5 * 60 * 1000)))  # 5 min

DOMAIN_PREFIX = "onsocial:execute:delegate:v1"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def load_keypair(creds_file: str):
    """Load ed25519 keypair from NEAR credentials JSON."""
    with open(creds_file) as f:
        creds = json.load(f)
    private_key_str = creds["private_key"]
    public_key_str = creds["public_key"]
    secret_bytes = base58.b58decode(private_key_str.split(":")[1])
    signing_key = nacl.signing.SigningKey(secret_bytes[:32])
    return signing_key, public_key_str


def canonicalize_json(value):
    """Sort object keys recursively (matches contract's canonical_json)."""
    if isinstance(value, dict):
        return {k: canonicalize_json(v) for k, v in sorted(value.items())}
    elif isinstance(value, list):
        return [canonicalize_json(v) for v in value]
    else:
        return value


def build_payload(target_account, public_key_str, nonce, expires_at_ms, action,
                  delegate_action):
    """Build the payload JSON matching the contract's exact key order.

    With preserve_order, keys are in insertion order from the Rust json! macro:
      target_account, public_key, nonce, expires_at_ms, action, delegate_action
    """
    action_canonical = canonicalize_json(action)
    delegate_canonical = canonicalize_json(delegate_action)
    return {
        "target_account": target_account,
        "public_key": public_key_str,
        "nonce": str(nonce),
        "expires_at_ms": str(expires_at_ms),
        "action": action_canonical,
        "delegate_action": delegate_canonical,
    }


def sign_payload(signing_key, domain, payload_json_bytes):
    """Sign SHA-256(domain\\0payload_json_bytes) using ed25519."""
    message = domain.encode("utf-8") + b"\x00" + payload_json_bytes
    message_hash = hashlib.sha256(message).digest()
    signed = signing_key.sign(message_hash)
    return base64.b64encode(signed.signature).decode("ascii")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    print(f"Account:  {ACCOUNT_ID}")
    print(f"Contract: {CONTRACT_ID}")
    print(f"Relayer:  {RELAYER_URL}")
    print(f"Nonce:    {NONCE}")
    print()

    # 1. Load keypair
    signing_key, public_key_str = load_keypair(CREDS_FILE)
    print(f"Public key: {public_key_str}")

    # 2. Construct the action (the operation to execute on-chain)
    timestamp = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    action = {
        "type": "set",
        "data": {
            "profile/delegate_test": f"Written via delegate_action at {timestamp}",
        },
    }

    # 3. Construct the delegate_action metadata
    #    In the OnSocial DelegateAction model, this is extra JSON context
    #    that the signer commits to in the signature.
    delegate_action = {
        "max_gas": "100000000000000",
        "receiver_id": CONTRACT_ID,
        "nonce_hint": str(NONCE),
    }

    print(f"Action: {json.dumps(action, indent=2)}")
    print(f"Delegate: {json.dumps(delegate_action, indent=2)}")

    # 4. Build and sign payload
    expires_at_ms = int(time.time() * 1000) + EXPIRES_IN_MS
    domain = f"{DOMAIN_PREFIX}:{CONTRACT_ID}"
    payload = build_payload(
        ACCOUNT_ID, public_key_str, NONCE, expires_at_ms,
        action, delegate_action,
    )
    payload_json_bytes = json.dumps(payload, separators=(",", ":")).encode("utf-8")

    print(f"\nDomain: {domain}")
    print(f"Canonical payload: {payload_json_bytes.decode()}")

    signature_b64 = sign_payload(signing_key, domain, payload_json_bytes)
    print(f"Signature (base64): {signature_b64[:40]}...")

    # 5. Build the request for the relayer's /execute endpoint
    #    The contract Request expects auth.type = "delegate_action"
    contract_request = {
        "target_account": ACCOUNT_ID,
        "action": action,
        "auth": {
            "type": "delegate_action",
            "public_key": public_key_str,
            "nonce": str(NONCE),
            "expires_at_ms": str(expires_at_ms),
            "signature": signature_b64,
            "action": delegate_action,  # extra field for delegate_action auth
        },
    }

    print(f"\n--- Sending to {RELAYER_URL}/execute ---")
    print(json.dumps(contract_request, indent=2))

    # 6. Send request
    import urllib.request

    req = urllib.request.Request(
        f"{RELAYER_URL}/execute",
        data=json.dumps(contract_request).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = json.loads(resp.read())
            print(f"\n✅ Status: {resp.status}")
            print(json.dumps(body, indent=2))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8")
        print(f"\n❌ Status: {e.code}")
        try:
            print(json.dumps(json.loads(body), indent=2))
        except json.JSONDecodeError:
            print(body)
    except Exception as e:
        print(f"\n❌ Error: {e}")

    # 7. Read back
    if "tx_hash" in (body if isinstance(body, dict) else {}):
        print("\n--- Reading back from RPC ---")
        import urllib.request as req2

        args = json.dumps({"keys": [f"{ACCOUNT_ID}/profile/delegate_test"]})
        args_b64 = base64.b64encode(args.encode()).decode()
        rpc_req = urllib.request.Request(
            "https://rpc.testnet.near.org",
            data=json.dumps({
                "jsonrpc": "2.0", "id": 1, "method": "query",
                "params": {
                    "request_type": "call_function",
                    "finality": "final",
                    "account_id": CONTRACT_ID,
                    "method_name": "get",
                    "args_base64": args_b64,
                },
            }).encode(),
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(rpc_req, timeout=15) as resp:
            r = json.loads(resp.read())
            data = bytes(r["result"]["result"]).decode()
            print(data)


if __name__ == "__main__":
    main()
