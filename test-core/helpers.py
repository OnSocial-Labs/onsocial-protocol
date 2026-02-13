"""Shared helpers for test-core: auth, relay, RPC, views, CLI."""

import base64
import json
import os
import subprocess
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
RPC_URL = os.environ.get("RPC_URL", "https://rpc.testnet.near.org")

# State
_jwt_token: str | None = None

# Multi-account session cache: account_id -> jwt_token
_sessions: dict = {}


# ---------------------------------------------------------------------------
# Keypair
# ---------------------------------------------------------------------------
def load_keypair():
    with open(CREDS_FILE) as f:
        creds = json.load(f)
    secret_bytes = base58.b58decode(creds["private_key"].split(":")[1])
    signing_key = nacl.signing.SigningKey(secret_bytes[:32])
    public_key_str = creds["public_key"]
    return signing_key, public_key_str


def load_keypair_from(creds_file: str):
    """Load keypair from a specific credentials file."""
    with open(creds_file) as f:
        creds = json.load(f)
    secret_bytes = base58.b58decode(creds["private_key"].split(":")[1])
    signing_key = nacl.signing.SigningKey(secret_bytes[:32])
    return signing_key, creds["public_key"]


# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------
def _http(method: str, url: str, body=None, headers=None):
    data = json.dumps(body).encode() if body else None
    hdrs = {"Content-Type": "application/json"}
    if headers:
        hdrs.update(headers)
    req = urllib.request.Request(url, data=data, headers=hdrs, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            return e.code, json.loads(raw)
        except json.JSONDecodeError:
            return e.code, {"raw": raw}


def api(method: str, path: str, body=None, token=None):
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return _http(method, f"{GATEWAY_URL}{path}", body, headers)


# ---------------------------------------------------------------------------
# Auth — JWT login (default account)
# ---------------------------------------------------------------------------
def login() -> str:
    """Login default ACCOUNT_ID and return JWT token. Caches across calls."""
    global _jwt_token
    if _jwt_token:
        return _jwt_token

    signing_key, public_key = load_keypair()
    timestamp = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())
    message = f"OnSocial Auth: {timestamp}"
    signed = signing_key.sign(message.encode())
    sig_b64 = base64.b64encode(signed.signature).decode()

    status, result = api("POST", "/auth/login", {
        "accountId": ACCOUNT_ID,
        "message": message,
        "signature": sig_b64,
        "publicKey": public_key,
    })
    if status != 200:
        print(f"  ❌ Login failed ({status}): {json.dumps(result)}")
        sys.exit(1)

    _jwt_token = result["token"]
    return _jwt_token


# ---------------------------------------------------------------------------
# Auth — Multi-account login
# ---------------------------------------------------------------------------
def login_as(account_id: str, creds_file: str | None = None) -> str:
    """Login as a specific account. Caches JWT across calls."""
    if account_id in _sessions:
        return _sessions[account_id]
    if creds_file is None:
        creds_file = os.path.expanduser(
            f"~/.near-credentials/testnet/{account_id}.json"
        )
    signing_key, public_key = load_keypair_from(creds_file)
    timestamp = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())
    message = f"OnSocial Auth: {timestamp}"
    signed = signing_key.sign(message.encode())
    sig_b64 = base64.b64encode(signed.signature).decode()

    status, result = api("POST", "/auth/login", {
        "accountId": account_id,
        "message": message,
        "signature": sig_b64,
        "publicKey": public_key,
    })
    if status != 200:
        raise RuntimeError(
            f"Login failed for {account_id} ({status}): {json.dumps(result)}"
        )
    _sessions[account_id] = result["token"]
    return _sessions[account_id]


# ---------------------------------------------------------------------------
# Relay — Gasless execute (default account)
# ---------------------------------------------------------------------------
def relay_execute(action: dict, options: dict | None = None) -> dict:
    """Send a gasless execute via the relay. Returns the response body."""
    token = login()
    body = {"action": action}
    if options:
        body["options"] = options

    status, result = api("POST", "/relay/execute", body, token=token)
    if status not in (200, 202):
        raise RuntimeError(f"Relay failed ({status}): {json.dumps(result)}")
    return result


# ---------------------------------------------------------------------------
# Relay — Multi-account execute
# ---------------------------------------------------------------------------
def relay_execute_as(
    account_id: str, action: dict, options: dict | None = None
) -> dict:
    """Relay an action as a specific account. Auto-logs in if needed."""
    token = login_as(account_id)
    body = {"action": action}
    if options:
        body["options"] = options
    status, result = api("POST", "/relay/execute", body, token=token)
    if status not in (200, 202):
        raise RuntimeError(
            f"Relay failed for {account_id} ({status}): {json.dumps(result)}"
        )
    return result


# ---------------------------------------------------------------------------
# CLI — Direct NEAR call for deposit-requiring operations
# ---------------------------------------------------------------------------
def near_call(
    account_id: str,
    action: dict,
    deposit: str = "0",
    gas: str = "300000000000000",
) -> str:
    """Call core contract via `near call` CLI. Returns the raw output.

    Use this for operations that require an attached deposit
    (e.g., create_proposal needs 0.1 NEAR) since the relay uses
    FunctionCall keys which cannot attach deposits.
    """
    request_json = json.dumps({"request": {"action": action}})
    cmd = [
        "near", "call", CONTRACT_ID, "execute",
        request_json,
        "--accountId", account_id,
        "--deposit", deposit,
        "--gas", gas,
        "--networkId", "testnet",
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
    output = result.stdout + result.stderr
    if result.returncode != 0:
        raise RuntimeError(f"near call failed: {output[-500:]}")
    return output


def near_call_result(
    account_id: str,
    action: dict,
    deposit: str = "0",
    gas: str = "300000000000000",
) -> str | None:
    """Call core contract via CLI and extract the return value (last line)."""
    output = near_call(account_id, action, deposit, gas)
    # The CLI prints the return value as the last non-empty line
    lines = [l.strip() for l in output.strip().split("\n") if l.strip()]
    if not lines:
        return None
    last = lines[-1]
    # Strip quotes if present
    if last.startswith("'") and last.endswith("'"):
        last = last[1:-1]
    elif last.startswith('"') and last.endswith('"'):
        last = last[1:-1]
    return last if last else None


# ---------------------------------------------------------------------------
# TX result — poll NEAR RPC for finalized return value
# ---------------------------------------------------------------------------
def get_tx_result(
    tx_hash: str,
    sender_id: str = "relayer.onsocial.testnet",
    timeout: int = 30,
):
    """Poll NEAR RPC until tx finalizes. Returns the function-call result."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            rpc_body = {
                "jsonrpc": "2.0", "id": 1,
                "method": "tx",
                "params": [tx_hash, sender_id],
            }
            req = urllib.request.Request(
                RPC_URL,
                data=json.dumps(rpc_body).encode(),
                headers={"Content-Type": "application/json"},
            )
            with urllib.request.urlopen(req, timeout=15) as resp:
                r = json.loads(resp.read())
            if "error" in r:
                time.sleep(2)
                continue
            st = r["result"]["status"]
            if isinstance(st, dict):
                if "SuccessValue" in st:
                    val = st["SuccessValue"]
                    if val:
                        decoded = base64.b64decode(val).decode()
                        try:
                            return json.loads(decoded)
                        except json.JSONDecodeError:
                            return decoded
                    return None
                if "Failure" in st:
                    raise RuntimeError(
                        f"TX failed: {json.dumps(st['Failure'])}"
                    )
        except urllib.error.URLError:
            pass
        time.sleep(2)
    raise TimeoutError(f"TX {tx_hash} not finalized in {timeout}s")


# ---------------------------------------------------------------------------
# RPC — Direct contract view calls
# ---------------------------------------------------------------------------
def view_call(method_name: str, args: dict):
    """Call a view method on the contract via NEAR RPC."""
    args_b64 = base64.b64encode(json.dumps(args).encode()).decode()
    rpc_body = {
        "jsonrpc": "2.0", "id": 1, "method": "query",
        "params": {
            "request_type": "call_function",
            "finality": "final",
            "account_id": CONTRACT_ID,
            "method_name": method_name,
            "args_base64": args_b64,
        },
    }
    req = urllib.request.Request(
        RPC_URL,
        data=json.dumps(rpc_body).encode(),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        r = json.loads(resp.read())
        if "error" in r:
            raise RuntimeError(f"RPC error: {r['error']}")
        raw = bytes(r["result"]["result"]).decode()
        return json.loads(raw)


# ---------------------------------------------------------------------------
# View helpers
# ---------------------------------------------------------------------------
def get_data(key: str, account_id: str | None = None):
    return view_call("get_one", {
        "key": key,
        "account_id": account_id or ACCOUNT_ID,
    })


def get_group_config(group_id: str):
    return view_call("get_group_config", {"group_id": group_id})


def is_group_member(group_id: str, member_id: str) -> bool:
    return view_call("is_group_member", {
        "group_id": group_id, "member_id": member_id,
    })


def get_group_stats(group_id: str):
    return view_call("get_group_stats", {"group_id": group_id})


def get_proposal(group_id: str, proposal_id: str):
    return view_call("get_proposal", {
        "group_id": group_id, "proposal_id": proposal_id,
    })


def get_proposal_tally(group_id: str, proposal_id: str):
    return view_call("get_proposal_tally", {
        "group_id": group_id, "proposal_id": proposal_id,
    })


def has_permission(owner: str, grantee: str, path: str, level: int) -> bool:
    return view_call("has_permission", {
        "owner": owner, "grantee": grantee, "path": path, "level": level,
    })


def get_permissions(owner: str, grantee: str, path: str):
    return view_call("get_permissions", {
        "owner": owner, "grantee": grantee, "path": path,
    })


def get_contract_info():
    return view_call("get_contract_info", {})


def get_vote(group_id: str, proposal_id: str, voter: str):
    return view_call("get_vote", {
        "group_id": group_id,
        "proposal_id": proposal_id,
        "voter": voter,
    })


# ---------------------------------------------------------------------------
# Test runner helpers
# ---------------------------------------------------------------------------
PASS = 0
FAIL = 0


def ok(name: str, detail: str = ""):
    global PASS
    PASS += 1
    print(f"  ✅ {name}" + (f" — {detail}" if detail else ""))


def fail(name: str, detail: str = ""):
    global FAIL
    FAIL += 1
    print(f"  ❌ {name}" + (f" — {detail}" if detail else ""))


def skip(name: str, reason: str = ""):
    print(f"  ⏭️  {name}" + (f" — {reason}" if reason else ""))


def wait_for_chain(seconds: int = 3):
    """Wait for finality."""
    time.sleep(seconds)


def summary():
    total = PASS + FAIL
    print(f"\n  {'=' * 40}")
    print(f"  Results: {PASS}/{total} passed", end="")
    if FAIL:
        print(f", {FAIL} failed")
    else:
        print(" — all good! 🎉")
    print(f"  {'=' * 40}")
    return FAIL == 0


def unique_id(prefix: str = "") -> str:
    """Generate a unique ID for test data."""
    ts = int(time.time())
    return f"{prefix}{ts}" if prefix else str(ts)
