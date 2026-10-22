#!/usr/bin/env python3
"""Build the next testnet nearcore release before the chain switches to it.

Every newer testnet release is compiled and staged. The running binary is
replaced when the staged release says PROTOCOL_UPGRADE or SECURITY_UPGRADE
and the node is within MAX_SWAP_LAG of the tip, or when the public chain
protocol is already ahead of this node and a staged binary exists. A
bugfix release stays staged. A large catch-up is not interrupted unless
the chain has already moved to a protocol this node cannot speak.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

RELEASES_URL = "https://api.github.com/repos/near/nearcore/releases?per_page=20"
STATE_PATH = Path("/var/lib/onsocial/nearcore.json")
STAGED_DIR = Path("/var/lib/onsocial/staged")
STAGED_META = STAGED_DIR / "current.json"
BUILD_LOCK = Path("/var/lib/onsocial/nearcore-build.lock")
BUILD_LOG = Path("/var/log/onsocial-nearcore-build.log")
BUILD_PID = Path("/var/lib/onsocial/nearcore-build.pid")
# Present until the first binary swap has been watched. The job still builds.
SWAP_HOLD = Path("/var/lib/onsocial/nearcore-swap-hold")
SRC = Path("/root/src/onsocial-indexer-build/indexers/onsocial-indexer")
CARGO_TOML = SRC / "Cargo.toml"
BINARY_NAME = "onsocial-indexer"
INSTALLED = Path("/usr/local/bin/onsocial-indexer")
UNIT = "onsocial-indexer.service"
HEALTH_PATH = Path("/var/lib/onsocial/indexer-freshness.json")
# Don't restart a node that is still downloading a large hole.
MAX_SWAP_LAG = 500
PUBLIC_RPC_URL = "https://test.rpc.fastnear.com"
LOCAL_RPC_URL = "http://127.0.0.1:3030"


def version_key(tag: str) -> tuple[int, int, int, int]:
    match = re.match(r"v?(\d+)\.(\d+)\.(\d+)(?:-rc\.(\d+))?$", tag.strip())
    if not match:
        return (0, 0, 0, -1)
    major, minor, patch, rc = match.groups()
    # A final release sorts after every rc of the same version.
    rc_n = int(rc) if rc is not None else 10**6
    return (int(major), int(minor), int(patch), rc_n)


def is_newer(left: str, right: str) -> bool:
    return version_key(left) > version_key(right)


def with_swap_hold(decision: str, held: bool) -> str:
    """A held swap stays staged. Removing the hold file is the watched restart."""
    if decision == "swap" and held:
        return "held"
    return decision


def should_swap(
    running: str | None,
    staged: str | None,
    local_protocol: int | None,
    public_protocol: int | None,
    lag: int | None,
    protocol_upgrade: bool,
    security_upgrade: bool = False,
) -> str:
    """Return swap, wait_for_sync, staged, or current.

    ``staged`` means a newer binary is built and left unused. Bugfix
    releases stay there until a person swaps them. A protocol or
    security upgrade waits out a large hole, then swaps on its own
    once the node is caught up. A chain that has already moved swaps
    immediately.
    """
    if not staged or not running or not is_newer(staged, running):
        return "current"
    behind = (
        local_protocol is not None
        and public_protocol is not None
        and public_protocol > local_protocol
    )
    if behind:
        return "swap"
    if not protocol_upgrade and not security_upgrade:
        return "staged"
    if lag is None or lag > MAX_SWAP_LAG:
        return "wait_for_sync"
    return "swap"


def select_testnet_release(releases: list[dict]) -> dict | None:
    chosen: dict | None = None
    for release in releases:
        body = release.get("body") or ""
        color = re.search(r"CODE_COLOR:\s*(\S+)", body)
        if not color or "TESTNET" not in color.group(1):
            continue
        tag = str(release.get("tag_name") or "").strip()
        if version_key(tag)[0] == 0:
            continue
        upgrade = bool(re.search(r"PROTOCOL_UPGRADE:\s*TRUE", body))
        security = bool(re.search(r"SECURITY_UPGRADE:\s*TRUE", body))
        row = {
            "tag": tag,
            "protocol_upgrade": upgrade,
            "security_upgrade": security,
        }
        if chosen is None or is_newer(tag, chosen["tag"]):
            chosen = row
    return chosen


def _self_test() -> None:
    assert is_newer("2.14.0-rc.5", "2.14.0-rc.2")
    assert is_newer("2.14.0", "2.14.0-rc.5")
    assert not is_newer("2.14.0-rc.4", "2.14.0-rc.5")
    assert (
        should_swap("2.14.0-rc.2", "2.14.0-rc.5", 87, 88, 70_000, False)
        == "swap"
    )
    assert (
        should_swap("2.14.0-rc.5", "2.14.0-rc.6", 88, 88, 60_000, True)
        == "wait_for_sync"
    )
    assert (
        should_swap("2.14.0-rc.5", "2.14.0-rc.6", 88, 88, None, True)
        == "wait_for_sync"
    )
    assert should_swap("2.14.0-rc.5", "2.14.0-rc.6", 88, 88, 20, True) == "swap"
    assert should_swap("2.14.0-rc.5", "2.14.0-rc.6", 88, 88, 500, True) == "swap"
    assert (
        should_swap("2.14.0-rc.5", "2.14.0-rc.6", 88, 88, 20, False) == "staged"
    )
    assert (
        should_swap("2.14.0-rc.5", "2.14.0-rc.6", 88, 88, 20, False, True)
        == "swap"
    )
    assert (
        should_swap("2.14.0-rc.5", "2.14.0-rc.6", 88, 88, 60_000, False, True)
        == "wait_for_sync"
    )
    assert should_swap("2.14.0-rc.5", "2.14.0-rc.5", 88, 88, 10, True) == "current"
    assert with_swap_hold("swap", True) == "held"
    assert with_swap_hold("swap", False) == "swap"
    assert with_swap_hold("staged", True) == "staged"
    releases = [
        {
            "tag_name": "2.14.0-rc.4",
            "body": "CODE_COLOR: CODE_YELLOW_TESTNET\nPROTOCOL_UPGRADE: TRUE\n",
        },
        {
            "tag_name": "2.14.0-rc.5",
            "body": "CODE_COLOR: CODE_GREEN_TESTNET\nPROTOCOL_UPGRADE: FALSE\nSECURITY_UPGRADE: TRUE\n",
        },
        {
            "tag_name": "2.14.0",
            "body": "CODE_COLOR: CODE_GREEN_MAINNET\nPROTOCOL_UPGRADE: FALSE\n",
        },
    ]
    chosen = select_testnet_release(releases)
    assert chosen is not None
    assert chosen["tag"] == "2.14.0-rc.5"
    assert chosen["protocol_upgrade"] is False
    assert chosen["security_upgrade"] is True
    print("self-test ok")


def _read_json(path: Path) -> dict:
    try:
        payload = json.loads(path.read_text())
    except (OSError, json.JSONDecodeError):
        return {}
    return payload if isinstance(payload, dict) else {}


def _write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, separators=(",", ":")) + "\n")
    os.chmod(tmp, 0o644)
    tmp.replace(path)


def _rpc_protocol(url: str) -> tuple[int | None, int | None]:
    body = json.dumps(
        {
            "jsonrpc": "2.0",
            "id": "upgrade",
            "method": "block",
            "params": {"finality": "final"},
        }
    ).encode()
    req = urllib.request.Request(
        url, data=body, headers={"content-type": "application/json"}
    )
    try:
        with urllib.request.urlopen(req, timeout=8) as resp:
            header = json.load(resp)["result"]["header"]
        return int(header["height"]), int(header["latest_protocol_version"])
    except Exception:
        return None, None


def _running_rev() -> str | None:
    rev = _read_json(STATE_PATH).get("rev")
    return str(rev) if rev else None


def _local_protocol() -> int | None:
    _, protocol = _rpc_protocol(LOCAL_RPC_URL)
    if protocol is not None:
        return protocol
    recorded = _read_json(STATE_PATH).get("protocol")
    try:
        return int(recorded)
    except (TypeError, ValueError):
        return None


def _lag() -> int | None:
    health = _read_json(HEALTH_PATH)
    lag = health.get("lag_blocks")
    try:
        return int(lag)
    except (TypeError, ValueError):
        return None


def _latest_release() -> dict | None:
    req = urllib.request.Request(
        RELEASES_URL,
        headers={
            "accept": "application/vnd.github+json",
            "user-agent": "onsocial-nearcore-upgrade",
        },
    )
    with urllib.request.urlopen(req, timeout=20) as resp:
        payload = json.load(resp)
    if not isinstance(payload, list):
        return None
    return select_testnet_release(payload)


def _build_running() -> bool:
    try:
        pid = int(BUILD_PID.read_text().strip())
    except (OSError, ValueError):
        return False
    try:
        os.kill(pid, 0)
    except OSError:
        return False
    return True


def _start_build(tag: str, protocol_upgrade: bool, security_upgrade: bool) -> None:
    if _build_running():
        print(f"build already running for a release, want {tag}")
        return
    if not CARGO_TOML.exists():
        print("indexer source is missing, cannot build")
        return
    script = f"""
set -euo pipefail
cd {SRC}
python3 - <<'PY'
import pathlib, re
path = pathlib.Path("Cargo.toml")
text = path.read_text()
updated = re.sub(r'rev = "2\\.[^"]+"', 'rev = "{tag}"', text)
if updated == text:
    raise SystemExit("nearcore rev pin not found")
path.write_text(updated)
PY
export PATH="/root/.cargo/bin:$PATH"
export CARGO_TERM_COLOR=never
cargo build --release --features nearcore
install -d -m 755 {STAGED_DIR}
install -m 755 target/release/{BINARY_NAME} {STAGED_DIR}/{BINARY_NAME}-{tag}
python3 - <<'PY'
import json, os, time
from pathlib import Path
meta = {{
    "tag": "{tag}",
    "protocol_upgrade": {str(protocol_upgrade).lower()},
    "security_upgrade": {str(security_upgrade).lower()},
    "built_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    "path": "{STAGED_DIR}/{BINARY_NAME}-{tag}",
}}
path = Path("{STAGED_META}")
path.write_text(json.dumps(meta) + "\\n")
os.chmod(path, 0o644)
PY
"""
    BUILD_LOG.parent.mkdir(parents=True, exist_ok=True)
    log = open(BUILD_LOG, "ab")
    proc = subprocess.Popen(
        ["flock", "-n", str(BUILD_LOCK), "bash", "-c", script],
        stdout=log,
        stderr=subprocess.STDOUT,
        start_new_session=True,
    )
    BUILD_PID.write_text(f"{proc.pid}\n")
    print(f"build started pid={proc.pid} tag={tag}")


def _swap(tag: str, binary: Path) -> None:
    if not binary.is_file():
        print(f"staged binary missing for {tag}")
        return
    backup = Path(f"{INSTALLED}.previous")
    if INSTALLED.exists():
        subprocess.run(["cp", "-a", str(INSTALLED), str(backup)], check=False)
    subprocess.run(["install", "-m", "755", str(binary), str(INSTALLED)], check=True)
    state = _read_json(STATE_PATH)
    state["rev"] = tag
    state["swapped_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    _write_json(STATE_PATH, state)
    subprocess.run(["systemctl", "restart", "--no-block", UNIT], check=False)
    subprocess.run(
        [
            "logger",
            "-t",
            "nearcore-upgrade",
            "-p",
            "user.notice",
            f"swapped indexer to {tag}",
        ],
        check=False,
    )
    print(f"swapped to {tag}")


def _maybe_swap() -> str:
    meta = _read_json(STAGED_META)
    staged = meta.get("tag")
    running = _running_rev()
    _, public_protocol = _rpc_protocol(PUBLIC_RPC_URL)
    local_protocol = _local_protocol()
    decision = should_swap(
        str(running) if running else None,
        str(staged) if staged else None,
        local_protocol,
        public_protocol,
        _lag(),
        bool(meta.get("protocol_upgrade")),
        bool(meta.get("security_upgrade")),
    )
    print(
        f"swap={decision} running={running} staged={staged} "
        f"protocol={local_protocol}/{public_protocol} lag={_lag()}"
    )
    decision = with_swap_hold(decision, SWAP_HOLD.exists())
    if decision == "held":
        print("swap held until the hold file is removed")
    elif decision == "swap":
        _swap(str(staged), Path(str(meta.get("path"))))
    return decision


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument(
        "--protocol-check",
        action="store_true",
        help="Swap only if the chain protocol is already ahead of a staged binary",
    )
    args = parser.parse_args()
    if args.self_test:
        _self_test()
        return

    if args.protocol_check:
        local = _local_protocol()
        _, public_protocol = _rpc_protocol(PUBLIC_RPC_URL)
        behind = (
            local is not None
            and public_protocol is not None
            and public_protocol > local
        )
        if not behind:
            print("protocol current")
            return
        decision = _maybe_swap()
        if decision != "swap":
            subprocess.run(
                [
                    "logger",
                    "-t",
                    "nearcore-upgrade",
                    "-p",
                    "user.err",
                    f"protocol {local} behind {public_protocol}, no staged swap",
                ],
                check=False,
            )
        return

    try:
        latest = _latest_release()
    except Exception as exc:
        print(f"release check failed: {type(exc).__name__}")
        _maybe_swap()
        return
    if latest is None:
        print("no testnet release found")
        return
    running = _running_rev()
    print(
        f"latest={latest['tag']} upgrade={latest['protocol_upgrade']} "
        f"security={latest['security_upgrade']} running={running}"
    )
    if running and not is_newer(latest["tag"], running):
        print("already on the latest testnet release")
        return
    meta = _read_json(STAGED_META)
    if meta.get("tag") == latest["tag"]:
        _maybe_swap()
        return
    _start_build(
        latest["tag"],
        bool(latest["protocol_upgrade"]),
        bool(latest["security_upgrade"]),
    )


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)
