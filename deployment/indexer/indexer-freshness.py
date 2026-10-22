#!/usr/bin/env python3
"""Restart the indexer when its block height and cursor both stop moving.

A catch-up is left alone: the height climbs while the cursor waits for the
node to finish syncing. Three restarts in an hour stop further restarts so a
poison block cannot boot-loop the database.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

UNIT = "onsocial-indexer.service"
GRACE_SEC = 180
STALL_SEC = 180
RESTART_WINDOW_SEC = 3600
MAX_RESTARTS = 3
RPC_URL = "http://127.0.0.1:3030"
PUBLIC_RPC_URL = "https://test.rpc.fastnear.com"
DB_URL_FILE = Path("/etc/onsocial/credentials/onsocial-indexer/db_url")
STATE_PATH = Path("/var/lib/onsocial/indexer-freshness.state")
HEALTH_PATH = Path("/var/lib/onsocial/indexer-freshness.json")
ALERT_URL_FILE = Path("/etc/onsocial/indexer-alert-url")
NEARCORE_STATE = Path("/var/lib/onsocial/nearcore.json")
UPGRADE_BIN = Path("/usr/local/sbin/nearcore-upgrade")


def decide(
    now: float,
    uptime_sec: float | None,
    rpc_ok: bool,
    height: int | None,
    cursor: int | None,
    state: dict,
    protocol_behind: bool = False,
) -> dict:
    """Choose hold, ok, restart, needs_upgrade, or needs_human. Pure: no I/O."""
    restarts = [
        t for t in state.get("restarts", []) if now - t < RESTART_WINDOW_SEC
    ]
    # Restarting the binary we already have cannot follow a newer protocol.
    if protocol_behind:
        return {
            "action": "needs_upgrade",
            "flat_since": None,
            "restarts": restarts,
            "reason": "protocol",
        }
    if (
        uptime_sec is None
        or uptime_sec < GRACE_SEC
        or not rpc_ok
        or height is None
        or cursor is None
    ):
        reason = "starting" if uptime_sec is not None and uptime_sec < GRACE_SEC else "no_sample"
        return {
            "action": "hold",
            "flat_since": None,
            "restarts": restarts,
            "reason": reason,
        }

    prev_height = state.get("prev_height")
    prev_cursor = state.get("prev_cursor")
    moved = (
        prev_height is None
        or prev_cursor is None
        or height != prev_height
        or cursor != prev_cursor
    )
    if moved:
        return {
            "action": "ok",
            "flat_since": None,
            "restarts": restarts,
            "reason": "moving",
        }

    flat_since = state.get("flat_since")
    if flat_since is None:
        flat_since = now
    flat_for = now - flat_since
    if flat_for < STALL_SEC:
        return {
            "action": "ok",
            "flat_since": flat_since,
            "restarts": restarts,
            "reason": "flat_short",
        }
    if len(restarts) >= MAX_RESTARTS:
        return {
            "action": "needs_human",
            "flat_since": flat_since,
            "restarts": restarts,
            "reason": "restart_budget",
        }
    return {
        "action": "restart",
        "flat_since": None,
        "restarts": restarts + [now],
        "reason": "stalled",
    }


def _self_test() -> None:
    now = 1_000_000.0
    base = {"restarts": [], "prev_height": 10, "prev_cursor": 10, "flat_since": None}
    assert decide(now, 10, True, 10, 10, base)["action"] == "hold"
    assert decide(now, 500, False, None, 10, base)["action"] == "hold"
    first = decide(now, 500, True, 10, 10, {"restarts": []})
    assert first["action"] == "ok" and first["reason"] == "moving"
    moving = decide(now, 500, True, 11, 10, base)
    assert moving["action"] == "ok" and moving["reason"] == "moving"
    short = decide(now, 500, True, 10, 10, {**base, "flat_since": now - 30})
    assert short["action"] == "ok" and short["reason"] == "flat_short"
    stalled = decide(now, 500, True, 10, 10, {**base, "flat_since": now - STALL_SEC})
    assert stalled["action"] == "restart" and len(stalled["restarts"]) == 1
    budget = decide(
        now,
        500,
        True,
        10,
        10,
        {
            **base,
            "flat_since": now - STALL_SEC,
            "restarts": [now - 10, now - 20, now - 30],
        },
    )
    assert budget["action"] == "needs_human"
    old = decide(
        now,
        500,
        True,
        10,
        10,
        {
            **base,
            "flat_since": now - STALL_SEC,
            "restarts": [now - RESTART_WINDOW_SEC - 5] * 3,
        },
    )
    assert old["action"] == "restart"
    behind = decide(
        now, 500, True, 10, 10, {**base, "flat_since": now - STALL_SEC}, True
    )
    assert behind["action"] == "needs_upgrade" and behind["restarts"] == []
    print("self-test ok")


def _rpc_header(url: str) -> tuple[int | None, int | None]:
    body = json.dumps(
        {
            "jsonrpc": "2.0",
            "id": "freshness",
            "method": "block",
            "params": {"finality": "final"},
        }
    ).encode()
    req = urllib.request.Request(
        url, data=body, headers={"content-type": "application/json"}
    )
    try:
        with urllib.request.urlopen(req, timeout=8) as resp:
            payload = json.load(resp)
    except Exception:
        return None, None
    header = payload.get("result", {}).get("header", {})
    try:
        height = int(header["height"])
    except (KeyError, TypeError, ValueError):
        height = None
    try:
        protocol = int(header["latest_protocol_version"])
    except (KeyError, TypeError, ValueError):
        protocol = None
    return height, protocol


def _cursor() -> int | None:
    try:
        db_url = DB_URL_FILE.read_text().strip()
    except OSError:
        return None
    if not db_url:
        return None
    try:
        out = subprocess.check_output(
            [
                "psql",
                db_url,
                "-tAc",
                "SELECT block_num FROM cursors WHERE id = 'indexer'",
            ],
            text=True,
            stderr=subprocess.DEVNULL,
        )
    except (OSError, subprocess.CalledProcessError):
        return None
    text = out.strip()
    if not text:
        return None
    try:
        return int(text)
    except ValueError:
        return None


def _uptime_sec(now: float) -> float | None:
    try:
        out = subprocess.check_output(
            [
                "systemctl",
                "show",
                UNIT,
                "-p",
                "ActiveState",
                "-p",
                "ActiveEnterTimestamp",
                "--timestamp=unix",
            ],
            text=True,
        )
    except (OSError, subprocess.CalledProcessError):
        return None
    fields = {}
    for line in out.splitlines():
        if "=" in line:
            key, value = line.split("=", 1)
            fields[key] = value
    if fields.get("ActiveState") not in ("active", "activating"):
        return None
    raw = (fields.get("ActiveEnterTimestamp") or "").strip().lstrip("@")
    try:
        entered = float(raw)
    except ValueError:
        return None
    if entered <= 0:
        return None
    return max(0.0, now - entered)


def _load_state() -> dict:
    try:
        return json.loads(STATE_PATH.read_text())
    except (OSError, json.JSONDecodeError):
        return {}


def _write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, separators=(",", ":")) + "\n")
    os.chmod(tmp, 0o644)
    tmp.replace(path)


def _alert(health: dict) -> None:
    message = (
        f"indexer freshness {health['action']} "
        f"cursor={health.get('cursor')} height={health.get('height')} "
        f"reason={health.get('reason')}"
    )
    subprocess.run(
        ["logger", "-t", "indexer-freshness", "-p", "user.err", message],
        check=False,
    )
    try:
        url = ALERT_URL_FILE.read_text().strip()
    except OSError:
        return
    if not url:
        return
    req = urllib.request.Request(
        url,
        data=json.dumps(health).encode(),
        headers={"content-type": "application/json"},
    )
    try:
        urllib.request.urlopen(req, timeout=8).close()
    except Exception:
        return


def run(now: float | None = None) -> dict:
    now = time.time() if now is None else now
    state = _load_state()
    uptime = _uptime_sec(now)
    height, local_protocol = _rpc_header(RPC_URL)
    cursor = _cursor()
    public, public_protocol = _rpc_header(PUBLIC_RPC_URL)
    if local_protocol is None:
        local_protocol = _recorded_protocol()
    protocol_behind = (
        local_protocol is not None
        and public_protocol is not None
        and public_protocol > local_protocol
    )
    choice = decide(
        now,
        uptime,
        height is not None,
        height,
        cursor,
        state,
        protocol_behind,
    )
    state.update(
        {
            "prev_height": height if height is not None else state.get("prev_height"),
            "prev_cursor": cursor if cursor is not None else state.get("prev_cursor"),
            "flat_since": choice["flat_since"],
            "restarts": choice["restarts"],
        }
    )
    _write_json(STATE_PATH, state)
    if local_protocol is not None:
        _remember_protocol(local_protocol)
    lag = None
    if public is not None and cursor is not None:
        lag = max(0, public - cursor)
    flat_for = None
    if choice["flat_since"] is not None:
        flat_for = round(now - choice["flat_since"], 1)
    health = {
        "action": choice["action"],
        "reason": choice["reason"],
        "cursor": cursor,
        "height": height,
        "public_tip": public,
        "protocol": local_protocol,
        "public_protocol": public_protocol,
        "lag_blocks": lag,
        "flat_for_seconds": flat_for,
        "needs_human": choice["action"] in ("needs_human", "needs_upgrade"),
        "restarts_in_window": len(choice["restarts"]),
        "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(now)),
    }
    _write_json(HEALTH_PATH, health)
    if choice["action"] in ("restart", "needs_human", "needs_upgrade"):
        _alert(health)
    if choice["action"] == "restart":
        subprocess.run(
            ["systemctl", "restart", "--no-block", UNIT],
            check=False,
        )
    if choice["action"] == "needs_upgrade" and UPGRADE_BIN.exists():
        subprocess.run(
            [str(UPGRADE_BIN), "--protocol-check"],
            check=False,
        )
    return health


def _recorded_protocol() -> int | None:
    try:
        payload = json.loads(NEARCORE_STATE.read_text())
    except (OSError, json.JSONDecodeError):
        return None
    try:
        return int(payload.get("protocol"))
    except (TypeError, ValueError):
        return None


def _remember_protocol(protocol: int) -> None:
    try:
        payload = json.loads(NEARCORE_STATE.read_text())
    except (OSError, json.JSONDecodeError):
        payload = {}
    if payload.get("protocol") == protocol:
        return
    payload["protocol"] = protocol
    _write_json(NEARCORE_STATE, payload)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        _self_test()
        return
    health = run()
    print(
        f"{health['action']} reason={health['reason']} "
        f"cursor={health['cursor']} height={health['height']} "
        f"lag={health['lag_blocks']}"
    )


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)
