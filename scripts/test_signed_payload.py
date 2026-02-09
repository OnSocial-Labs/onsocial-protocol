#!/usr/bin/env python3
"""Test signed payload relay via /relay/signed endpoint.

This script:
1. Reads an ed25519 keypair from NEAR credentials
2. Constructs a canonical payload matching the contract's format
3. Signs SHA-256(domain\0payload_json)
4. Sends the signed request to the gateway's /relay/signed endpoint
"""

import base64
import hashlib
import json
import os
import sys
import time

import nacl.signing

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
GATEWAY_URL = os.environ.get("GATEWAY_URL", "https://api.onsocial.id")
CONTRACT_ID = os.environ.get("CONTRACT_ID", "core.onsocial.testnet")
ACCOUNT_ID = os.environ.get("ACCOUNT_ID", "test01.onsocial.testnet")
CREDS_FILE = os.environ.get(
    "CREDS_FILE",
    os.path.expanduser(f"~/.near-credentials/testnet/{ACCOUNT_ID}.json"),
)
NONCE = int(os.environ.get("NONCE", "1"))
EXPIRES_IN_MS = int(os.environ.get("EXPIRES_IN_MS", str(5 * 60 * 1000)))  # 5 min

DOMAIN_PREFIX = "onsocial:execute:v1"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def load_keypair(creds_file: str):
    """Load ed25519 keypair from NEAR credentials JSON."""
    with open(creds_file) as f:
        creds = json.load(f)
    private_key_str = creds["private_key"]  # "ed25519:base58bytes"
    public_key_str = creds["public_key"]    # "ed25519:base58bytes"

    # NEAR stores the full 64-byte secret (32-byte seed + 32-byte pubkey)
    # as base58 after the "ed25519:" prefix
    import base58
    secret_bytes = base58.b58decode(private_key_str.split(":")[1])
    # PyNaCl SigningKey takes the 32-byte seed
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
                  delegate_action=None):
    """Build the payload JSON matching the contract's exact key order.

    CRITICAL: near-sdk re-exports serde_json with `preserve_order` enabled,
    so the json!{} macro keeps keys in INSERTION order (not alphabetical).
    The contract constructs the payload as:
        target_account, public_key, nonce, expires_at_ms, action, delegate_action
    Python 3.7+ dicts preserve insertion order, so we must match that.
    """
    action_canonical = canonicalize_json(action)
    # Keys MUST be in this exact order (matches Rust json! macro in auth.rs)
    payload = {
        "target_account": target_account,
        "public_key": public_key_str,
        "nonce": str(nonce),
        "expires_at_ms": str(expires_at_ms),
        "action": action_canonical,
        "delegate_action": (canonicalize_json(delegate_action)
                            if delegate_action is not None else None),
    }
    return payload  # Do NOT sort top-level keys


def sign_payload(signing_key, domain, payload_json_bytes):
    """
    Sign SHA-256(domain\\0payload_json_bytes) using ed25519.
    Returns base64-encoded 64-byte signature.
    """
    message = domain.encode("utf-8") + b"\x00" + payload_json_bytes
    message_hash = hashlib.sha256(message).digest()
    # PyNaCl sign returns 64-byte signature + message; we want just the signature
    signed = signing_key.sign(message_hash)
    signature = signed.signature  # 64 bytes
    return base64.b64encode(signature).decode("ascii")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    # Check for base58
    try:
        import base58
    except ImportError:
        print("Installing base58...")
        os.system("pip3 install --break-system-packages base58 >/dev/null 2>&1")
        import base58

    print(f"Account:  {ACCOUNT_ID}")
    print(f"Contract: {CONTRACT_ID}")
    print(f"Gateway:  {GATEWAY_URL}")
    print(f"Nonce:    {NONCE}")
    print()

    # 1. Load keypair
    signing_key, public_key_str = load_keypair(CREDS_FILE)
    print(f"Public key: {public_key_str}")

    # 2. Construct the action
    timestamp = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    action = {
        "type": "set",
        "data": {
            "profile/signed_test": f"Written via signed_payload at {timestamp}",
        },
    }
    print(f"Action: {json.dumps(action, indent=2)}")

    # 3. Build and sign payload
    expires_at_ms = int(time.time() * 1000) + EXPIRES_IN_MS
    domain = f"{DOMAIN_PREFIX}:{CONTRACT_ID}"
    payload = build_payload(ACCOUNT_ID, public_key_str, NONCE, expires_at_ms, action)
    payload_json_bytes = json.dumps(payload, separators=(",", ":")).encode("utf-8")

    print(f"\nDomain: {domain}")
    print(f"Canonical payload: {payload_json_bytes.decode()}")

    signature_b64 = sign_payload(signing_key, domain, payload_json_bytes)
    print(f"Signature (base64): {signature_b64[:40]}...")

    # 4. Build the request for /relay/signed
    request_body = {
        "target_account": ACCOUNT_ID,
        "action": action,
        "auth": {
            "type": "signed_payload",
            "public_key": public_key_str,
            "nonce": str(NONCE),
            "expires_at_ms": str(expires_at_ms),
            "signature": signature_b64,
        },
    }

    print(f"\n--- Sending to {GATEWAY_URL}/relay/signed ---")
    print(json.dumps(request_body, indent=2))

    # 5. Send request
    import urllib.request

    req = urllib.request.Request(
        f"{GATEWAY_URL}/relay/signed",
        data=json.dumps(request_body).encode("utf-8"),
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


if __name__ == "__main__":
    main()
