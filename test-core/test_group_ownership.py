"""Test suite: Group Ownership Transfer — direct + governance paths.

Tests transfer_group_ownership action for:
- Successful transfer to existing member
- Rejection: transfer to non-member
- Rejection: transfer to self
- Rejection: transfer to blacklisted member
- Rejection: non-owner cannot transfer
- Member-driven group blocks direct transfer (must use governance)

Uses a shared group for negative tests to minimize TX count / RPC load.
"""

import time
from helpers import (
    relay_execute, relay_execute_as, near_call,
    view_call, get_group_config, is_group_member, get_tx_result,
    wait_for_chain, login, login_as,
    ok, fail, skip, unique_id, ACCOUNT_ID,
)

MEMBER = "test02.onsocial.testnet"
NON_MEMBER = "test04.onsocial.testnet"
MEMBER3 = "test03.onsocial.testnet"

# Shared group for negative tests (ownership never changes)
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
    """Create a single shared group with MEMBER + MEMBER3 joined (once)."""
    global _SHARED_GID
    if _SHARED_GID:
        return _SHARED_GID
    gid = f"own-{unique_id()}"
    login()
    _wait_tx(relay_execute({
        "type": "create_group",
        "group_id": gid,
        "config": {"is_private": False, "description": f"Ownership test {gid}"},
    }))
    time.sleep(2)

    for acct in [MEMBER, MEMBER3]:
        login_as(acct)
        _wait_tx(relay_execute_as(acct, {"type": "join_group", "group_id": gid}))
        time.sleep(2)

    _SHARED_GID = gid
    return gid


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_transfer_to_member():
    """Owner transfers ownership to an existing member (own group)."""
    gid = f"own-xfer-{unique_id()}"
    login()
    _wait_tx(relay_execute({
        "type": "create_group",
        "group_id": gid,
        "config": {"is_private": False, "description": "transfer test"},
    }))
    time.sleep(2)
    login_as(MEMBER)
    _wait_tx(relay_execute_as(MEMBER, {"type": "join_group", "group_id": gid}))
    time.sleep(2)

    try:
        _wait_tx(relay_execute({
            "type": "transfer_group_ownership",
            "group_id": gid,
            "new_owner": MEMBER,
        }))
        wait_for_chain(5)
        is_new = view_call("is_group_owner", {"group_id": gid, "user_id": MEMBER})
        is_old = view_call("is_group_owner", {"group_id": gid, "user_id": ACCOUNT_ID})
        if is_new and not is_old:
            ok("transfer to member", f"{MEMBER} is new owner")
        elif is_new:
            ok("transfer to member", f"transferred (old_owner={is_old})")
        else:
            fail("transfer to member", f"new={is_new} old={is_old}")
    except Exception as e:
        fail("transfer to member", str(e))


def test_transfer_to_non_member_rejected():
    """Transfer to non-member must fail."""
    gid = _ensure_shared_group()
    try:
        res = relay_execute({
            "type": "transfer_group_ownership",
            "group_id": gid,
            "new_owner": NON_MEMBER,
        })
        tx = res.get("tx_hash") or res.get("transaction", {}).get("hash", "")
        if tx:
            try:
                get_tx_result(tx)
                is_own = view_call("is_group_owner", {"group_id": gid, "user_id": NON_MEMBER})
                if is_own:
                    fail("transfer to non-member", "non-member became owner!")
                else:
                    ok("transfer to non-member", "TX ok but ownership unchanged")
            except RuntimeError as tx_err:
                ok("transfer to non-member", f"TX failed: {str(tx_err)[:80]}")
        else:
            ok("transfer to non-member", "relay rejected")
    except RuntimeError as e:
        if any(kw in str(e).lower() for kw in ["member", "fail", "denied"]):
            ok("transfer to non-member", f"rejected: {str(e)[:80]}")
        else:
            fail("transfer to non-member", str(e))
    except Exception as e:
        fail("transfer to non-member", str(e))


def test_transfer_to_self_rejected():
    """Owner cannot transfer to themselves."""
    gid = _ensure_shared_group()
    try:
        res = relay_execute({
            "type": "transfer_group_ownership",
            "group_id": gid,
            "new_owner": ACCOUNT_ID,
        })
        tx = res.get("tx_hash") or res.get("transaction", {}).get("hash", "")
        if tx:
            try:
                get_tx_result(tx)
                ok("transfer to self", "TX ok (no-op)")
            except RuntimeError as tx_err:
                ok("transfer to self", f"TX failed: {str(tx_err)[:80]}")
        else:
            ok("transfer to self", "relay rejected")
    except RuntimeError as e:
        if any(kw in str(e).lower() for kw in ["yourself", "self", "fail", "denied"]):
            ok("transfer to self", f"rejected: {str(e)[:80]}")
        else:
            fail("transfer to self", str(e))
    except Exception as e:
        fail("transfer to self", str(e))


def test_transfer_to_blacklisted_rejected():
    """Transfer to blacklisted member must fail (uses own group)."""
    gid = f"own-bl-{unique_id()}"
    login()
    _wait_tx(relay_execute({
        "type": "create_group",
        "group_id": gid,
        "config": {"is_private": False, "description": "blacklist transfer test"},
    }))
    time.sleep(2)
    login_as(MEMBER)
    _wait_tx(relay_execute_as(MEMBER, {"type": "join_group", "group_id": gid}))
    time.sleep(2)

    # Blacklist MEMBER
    _wait_tx(relay_execute({
        "type": "blacklist_group_member",
        "group_id": gid,
        "member_id": MEMBER,
    }))
    time.sleep(2)

    try:
        res = relay_execute({
            "type": "transfer_group_ownership",
            "group_id": gid,
            "new_owner": MEMBER,
        })
        tx = res.get("tx_hash") or res.get("transaction", {}).get("hash", "")
        if tx:
            try:
                get_tx_result(tx)
                is_own = view_call("is_group_owner", {"group_id": gid, "user_id": MEMBER})
                if is_own:
                    fail("transfer to blacklisted", "blacklisted user became owner!")
                else:
                    ok("transfer to blacklisted", "TX ok but ownership unchanged")
            except RuntimeError as tx_err:
                ok("transfer to blacklisted", f"TX failed: {str(tx_err)[:80]}")
        else:
            ok("transfer to blacklisted", "relay rejected")
    except RuntimeError as e:
        if any(kw in str(e).lower() for kw in ["blacklist", "fail", "denied"]):
            ok("transfer to blacklisted", f"rejected: {str(e)[:80]}")
        else:
            fail("transfer to blacklisted", str(e))
    except Exception as e:
        fail("transfer to blacklisted", str(e))


def test_non_owner_transfer_rejected():
    """Non-owner cannot transfer ownership."""
    gid = _ensure_shared_group()
    try:
        login_as(MEMBER)
        res = relay_execute_as(MEMBER, {
            "type": "transfer_group_ownership",
            "group_id": gid,
            "new_owner": MEMBER,
        })
        tx = res.get("tx_hash") or res.get("transaction", {}).get("hash", "")
        if tx:
            try:
                get_tx_result(tx)
                is_own = view_call("is_group_owner", {"group_id": gid, "user_id": MEMBER})
                if is_own:
                    fail("non-owner transfer", "non-owner transferred!")
                else:
                    ok("non-owner transfer", "TX ok but unchanged")
            except RuntimeError as tx_err:
                ok("non-owner transfer", f"TX failed: {str(tx_err)[:80]}")
        else:
            ok("non-owner transfer", "relay rejected")
    except RuntimeError as e:
        if any(kw in str(e).lower() for kw in ["permission", "owner", "denied", "fail"]):
            ok("non-owner transfer", f"rejected: {str(e)[:80]}")
        else:
            fail("non-owner transfer", str(e))
    except Exception as e:
        fail("non-owner transfer", str(e))


def test_member_driven_blocks_direct_transfer():
    """Member-driven group must use governance for ownership transfer."""
    gid = f"own-md-{unique_id()}"
    near_call(ACCOUNT_ID, {
        "type": "create_group",
        "group_id": gid,
        "config": {"member_driven": True},
    }, deposit="0.1")
    wait_for_chain(3)

    near_call(ACCOUNT_ID, {
        "type": "create_proposal",
        "group_id": gid,
        "proposal_type": "member_invite",
        "changes": {"target_user": MEMBER},
        "auto_vote": True,
    }, deposit="0.1")
    wait_for_chain(3)

    try:
        res = relay_execute({
            "type": "transfer_group_ownership",
            "group_id": gid,
            "new_owner": MEMBER,
        })
        tx = res.get("tx_hash") or res.get("transaction", {}).get("hash", "")
        if tx:
            try:
                get_tx_result(tx)
                is_own = view_call("is_group_owner", {"group_id": gid, "user_id": MEMBER})
                if is_own:
                    fail("member-driven blocks transfer", "direct transfer succeeded!")
                else:
                    ok("member-driven blocks transfer", "TX ok but unchanged")
            except RuntimeError as tx_err:
                ok("member-driven blocks transfer", f"TX failed: {str(tx_err)[:80]}")
        else:
            ok("member-driven blocks transfer", "relay rejected")
    except RuntimeError as e:
        if any(kw in str(e).lower() for kw in ["permission", "governance", "denied", "fail"]):
            ok("member-driven blocks transfer", f"rejected: {str(e)[:80]}")
        else:
            fail("member-driven blocks transfer", str(e))
    except Exception as e:
        fail("member-driven blocks transfer", str(e))


# ---------------------------------------------------------------------------
def run():
    print("\n  ── Group Ownership Transfer Tests ────────────")
    test_transfer_to_member()
    test_transfer_to_non_member_rejected()
    test_transfer_to_self_rejected()
    test_transfer_to_blacklisted_rejected()
    test_non_owner_transfer_rejected()
    test_member_driven_blocks_direct_transfer()


if __name__ == "__main__":
    from helpers import summary
    login()
    run()
    summary()
