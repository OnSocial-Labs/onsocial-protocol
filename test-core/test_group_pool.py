"""Test suite: Group Pool — deposit, sponsor quotas, member usage, pool views.

Tests the group storage pool system where group owners deposit NEAR to sponsor
storage for group members.  Covers:
  - Owner deposits to group pool
  - Pool info view reflects balance
  - Non-owner deposit rejected
  - Below-minimum deposit rejected
  - Sponsor quota set for individual member
  - Default sponsor config for all members
  - Zero-allowance sponsor rejected
  - Non-owner cannot configure sponsorship
  - Member writes data under group path (pool covers storage)
  - Pool info for nonexistent group returns None

Accounts: test01 (group owner), test02 (member), test04 (non-member)
"""

import time
from helpers import (
    near_call, relay_execute, relay_execute_as,
    view_call, get_data, get_tx_result,
    wait_for_chain, login, login_as,
    ok, fail, skip, unique_id, ACCOUNT_ID,
)

MEMBER = "test02.onsocial.testnet"
NON_MEMBER = "test04.onsocial.testnet"

# Shared group — created once, reused across tests
_SHARED_GID = None


def _wait_tx(res: dict):
    """Wait for relay TX to finalize. Falls back to wait_for_chain on timeout."""
    tx = res.get("tx_hash") or res.get("transaction", {}).get("hash", "")
    if tx:
        try:
            get_tx_result(tx)
        except TimeoutError:
            wait_for_chain(10)
    else:
        wait_for_chain(5)


def _ensure_shared_group() -> str:
    """Create a public group with MEMBER joined (once per session)."""
    global _SHARED_GID
    if _SHARED_GID:
        return _SHARED_GID
    gid = f"gpool-{unique_id()}"
    login()
    _wait_tx(relay_execute({
        "type": "create_group",
        "group_id": gid,
        "config": {"is_private": False, "description": f"Group pool test {gid}"},
    }))
    # Wait for group to appear on-chain before join
    for _ in range(10):
        try:
            cfg = view_call("get_group_config", {"group_id": gid})
            if cfg:
                break
        except Exception:
            pass
        time.sleep(3)

    login_as(MEMBER)
    _wait_tx(relay_execute_as(MEMBER, {"type": "join_group", "group_id": gid}))
    time.sleep(2)

    _SHARED_GID = gid
    return gid


def _get_group_pool_info(group_id: str):
    """View group pool info. Returns dict or None."""
    try:
        return view_call("get_group_pool_info", {"group_id": group_id})
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_group_pool_deposit():
    """Owner deposits 0.1 NEAR into the group pool."""
    gid = _ensure_shared_group()
    try:
        near_call(ACCOUNT_ID, {
            "type": "set",
            "data": {"storage/group_pool_deposit": {
                "group_id": gid,
                "amount": "100000000000000000000000",   # 0.1 NEAR
            }},
        }, deposit="0.1")
        wait_for_chain(5)
        ok("group pool deposit", f"deposited 0.1 NEAR into {gid}")
    except Exception as e:
        fail("group pool deposit", str(e))


def test_group_pool_info_shows_balance():
    """Pool info reflects deposited balance after deposit."""
    gid = _ensure_shared_group()
    try:
        info = _get_group_pool_info(gid)
        if info is None:
            fail("pool info balance", "returned None")
            return
        balance = int(info.get("storage_balance", "0"))
        if balance > 0:
            ok("pool info balance",
               f"balance={balance}, used={info.get('used_bytes', 0)}")
        else:
            fail("pool info balance", f"balance is 0: {info}")
    except Exception as e:
        fail("pool info balance", str(e))


def test_group_pool_deposit_non_owner_rejected():
    """A regular member cannot deposit into the group pool."""
    gid = _ensure_shared_group()
    try:
        near_call(MEMBER, {
            "type": "set",
            "data": {"storage/group_pool_deposit": {
                "group_id": gid,
                "amount": "100000000000000000000000",
            }},
        }, deposit="0.1")
        fail("non-owner deposit", "should have been rejected")
    except RuntimeError as e:
        err = str(e).lower()
        if any(w in err for w in ("unauthorized", "denied", "permission", "panicked")):
            ok("non-owner deposit", "correctly rejected")
        else:
            fail("non-owner deposit", str(e))


def test_group_pool_deposit_below_minimum():
    """Deposit below ~0.1 NEAR minimum is rejected."""
    gid = _ensure_shared_group()
    try:
        near_call(ACCOUNT_ID, {
            "type": "set",
            "data": {"storage/group_pool_deposit": {
                "group_id": gid,
                "amount": "1000000000000000000000",    # 0.001 NEAR
            }},
        }, deposit="0.001")
        fail("below-minimum deposit", "should have been rejected")
    except RuntimeError as e:
        err = str(e)
        if "Minimum pool deposit" in err or "panicked" in err:
            ok("below-minimum deposit", "correctly rejected")
        else:
            fail("below-minimum deposit", err)


def test_group_sponsor_quota_set():
    """Owner enables per-member sponsor quota."""
    gid = _ensure_shared_group()
    try:
        login()
        res = relay_execute({
            "type": "set",
            "data": {"storage/group_sponsor_quota_set": {
                "group_id": gid,
                "target_id": MEMBER,
                "enabled": True,
                "daily_refill_bytes": 50_000,
                "allowance_max_bytes": 100_000,
            }},
        })
        _wait_tx(res)
        ok("sponsor quota set", f"enabled for {MEMBER}")
    except Exception as e:
        fail("sponsor quota set", str(e))


def test_group_sponsor_default_set():
    """Owner enables default sponsor config for all group members."""
    gid = _ensure_shared_group()
    try:
        login()
        res = relay_execute({
            "type": "set",
            "data": {"storage/group_sponsor_default_set": {
                "group_id": gid,
                "enabled": True,
                "daily_refill_bytes": 10_000,
                "allowance_max_bytes": 50_000,
            }},
        })
        _wait_tx(res)
        ok("sponsor default set", f"default enabled for {gid}")
    except Exception as e:
        fail("sponsor default set", str(e))


def test_sponsor_quota_zero_allowance_rejected():
    """enabled=true with allowance_max_bytes=0 must fail."""
    gid = _ensure_shared_group()
    try:
        login()
        res = relay_execute({
            "type": "set",
            "data": {"storage/group_sponsor_quota_set": {
                "group_id": gid,
                "target_id": MEMBER,
                "enabled": True,
                "daily_refill_bytes": 50_000,
                "allowance_max_bytes": 0,
            }},
        })
        # Relay may accept the TX; check finalized result
        tx = res.get("tx_hash") or res.get("transaction", {}).get("hash", "")
        if tx:
            try:
                get_tx_result(tx)
                fail("zero-allowance quota", "should have failed")
            except RuntimeError:
                ok("zero-allowance quota", "correctly rejected on-chain")
        else:
            fail("zero-allowance quota", "no tx hash to verify")
    except RuntimeError as e:
        err = str(e)
        if "allowance_max_bytes" in err or "greater than zero" in err:
            ok("zero-allowance quota", "correctly rejected at relay")
        else:
            fail("zero-allowance quota", err)


def test_non_owner_cannot_set_sponsor():
    """A regular member cannot configure sponsor quotas."""
    gid = _ensure_shared_group()
    try:
        login_as(MEMBER)
        res = relay_execute_as(MEMBER, {
            "type": "set",
            "data": {"storage/group_sponsor_quota_set": {
                "group_id": gid,
                "target_id": MEMBER,
                "enabled": True,
                "daily_refill_bytes": 50_000,
                "allowance_max_bytes": 100_000,
            }},
        })
        tx = res.get("tx_hash") or res.get("transaction", {}).get("hash", "")
        if tx:
            try:
                get_tx_result(tx)
                fail("non-owner sponsor", "should have been rejected")
            except RuntimeError:
                ok("non-owner sponsor", "correctly rejected on-chain")
        else:
            fail("non-owner sponsor", "no tx hash to verify")
    except RuntimeError as e:
        err = str(e).lower()
        if "unauthorized" in err or "denied" in err:
            ok("non-owner sponsor", "correctly rejected at relay")
        else:
            fail("non-owner sponsor", str(e))


def test_member_writes_data_under_group():
    """Sponsored member writes data under group path; pool covers storage."""
    gid = _ensure_shared_group()
    try:
        login_as(MEMBER)
        key = f"groups/{gid}/data/pool-{unique_id()}"
        res = relay_execute_as(MEMBER, {
            "type": "set",
            "data": {key: {"hello": "group-pool-test"}},
        })
        _wait_tx(res)

        # Read back to verify
        val = get_data(key, MEMBER)
        if val and val.get("hello") == "group-pool-test":
            ok("member write under group", f"stored at {key}")
        else:
            fail("member write under group", f"read back: {val}")
    except Exception as e:
        fail("member write under group", str(e))


def test_group_pool_info_nonexistent():
    """Pool info for a nonexistent group returns None or errors gracefully."""
    try:
        info = _get_group_pool_info("nonexistent-group-xyz-99999")
        if info is None:
            ok("nonexistent pool info", "returns None")
        else:
            fail("nonexistent pool info", f"expected None, got {info}")
    except Exception:
        ok("nonexistent pool info", "error for nonexistent group (acceptable)")


# ---------------------------------------------------------------------------
# Manual runner
# ---------------------------------------------------------------------------

def run():
    print("\n🏦 Group Pool tests\n")
    test_group_pool_deposit()
    test_group_pool_info_shows_balance()
    test_group_pool_deposit_non_owner_rejected()
    test_group_pool_deposit_below_minimum()
    test_group_sponsor_quota_set()
    test_group_sponsor_default_set()
    test_sponsor_quota_zero_allowance_rejected()
    test_non_owner_cannot_set_sponsor()
    test_member_writes_data_under_group()
    test_group_pool_info_nonexistent()


if __name__ == "__main__":
    run()
    from helpers import summary
    raise SystemExit(0 if summary() else 1)
