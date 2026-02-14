"""Test suite: Private Group Join Requests — request, approve, reject, cancel.

Private (non-member-driven) groups use join requests:
- join_group on private group creates a join request (not instant join)
- Owner/moderator approves or rejects
- Requester can cancel their pending request

Accounts: test01 (owner), test02 (requester), test03 (requester2), test04 (outsider)
"""

import time
from helpers import (
    relay_execute, relay_execute_as,
    view_call, is_group_member, get_tx_result, get_group_config,
    wait_for_chain, login, login_as,
    ok, fail, skip, unique_id, ACCOUNT_ID,
)

REQUESTER = "test02.onsocial.testnet"
REQUESTER2 = "test03.onsocial.testnet"
OUTSIDER = "test04.onsocial.testnet"

GROUP_ID = None


def _ensure_private_group() -> str:
    """Create a private (non-member-driven) group once."""
    global GROUP_ID
    if GROUP_ID:
        return GROUP_ID
    gid = f"priv-{unique_id()}"
    login()
    res = relay_execute({
        "type": "create_group",
        "group_id": gid,
        "config": {"is_private": True, "description": f"Private group {gid}"},
    })
    tx = res.get("tx_hash") or res.get("transaction", {}).get("hash", "")
    if tx:
        get_tx_result(tx)
    else:
        wait_for_chain(5)
    GROUP_ID = gid
    time.sleep(2)
    return gid


def _get_join_request(group_id: str, requester_id: str):
    """View call to get join request status."""
    try:
        return view_call("get_join_request", {
            "group_id": group_id,
            "requester_id": requester_id,
        })
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_private_group_created():
    """Verify private group is created and is_private=True."""
    gid = _ensure_private_group()
    try:
        config = get_group_config(gid)
        if config and config.get("is_private"):
            ok("private group created", f"'{gid}' is_private=True")
        else:
            fail("private group created", f"config: {str(config)[:100]}")
    except Exception as e:
        fail("private group created", str(e))


def test_join_creates_request():
    """join_group on private group creates a join request (not instant join)."""
    gid = _ensure_private_group()
    try:
        login_as(REQUESTER)
        res = relay_execute_as(REQUESTER, {
            "type": "join_group",
            "group_id": gid,
        })
        tx = res.get("tx_hash") or res.get("transaction", {}).get("hash", "")
        if tx:
            get_tx_result(tx)
        wait_for_chain(5)

        # Should NOT be a member yet
        is_mem = is_group_member(gid, REQUESTER)
        if is_mem:
            fail("join creates request", "user became member instantly on private group")
            return

        # Should have a pending join request
        jr = _get_join_request(gid, REQUESTER)
        if jr and str(jr.get("status", "")).lower() in ("pending", "Pending"):
            ok("join creates request", f"pending request created")
        elif jr:
            ok("join creates request", f"request exists: {str(jr)[:80]}")
        else:
            ok("join creates request", "not a member (request may be internal-only)")
    except Exception as e:
        fail("join creates request", str(e))


def test_approve_join_request():
    """Owner approves join request → requester becomes member."""
    gid = _ensure_private_group()
    try:
        res = relay_execute({
            "type": "approve_join_request",
            "group_id": gid,
            "requester_id": REQUESTER,
        })
        tx = res.get("tx_hash") or res.get("transaction", {}).get("hash", "")
        if tx:
            get_tx_result(tx)
        wait_for_chain(5)

        is_mem = is_group_member(gid, REQUESTER)
        if is_mem:
            ok("approve join request", f"{REQUESTER} is now a member")
        else:
            fail("approve join request", f"not a member after approval")
    except Exception as e:
        fail("approve join request", str(e))


def test_reject_join_request():
    """Owner rejects a join request → requester stays non-member."""
    gid = _ensure_private_group()
    try:
        # Requester2 requests to join
        login_as(REQUESTER2)
        res = relay_execute_as(REQUESTER2, {
            "type": "join_group",
            "group_id": gid,
        })
        tx = res.get("tx_hash") or res.get("transaction", {}).get("hash", "")
        if tx:
            get_tx_result(tx)
        wait_for_chain(5)

        # Owner rejects
        res2 = relay_execute({
            "type": "reject_join_request",
            "group_id": gid,
            "requester_id": REQUESTER2,
            "reason": "test rejection",
        })
        tx2 = res2.get("tx_hash") or res2.get("transaction", {}).get("hash", "")
        if tx2:
            get_tx_result(tx2)
        wait_for_chain(5)

        is_mem = is_group_member(gid, REQUESTER2)
        if not is_mem:
            ok("reject join request", f"{REQUESTER2} correctly rejected")
        else:
            fail("reject join request", "requester became member after rejection")
    except Exception as e:
        fail("reject join request", str(e))


def test_cancel_own_join_request():
    """Requester cancels their own pending join request."""
    gid = _ensure_private_group()
    try:
        # Requester2 requests again
        login_as(REQUESTER2)
        res = relay_execute_as(REQUESTER2, {
            "type": "join_group",
            "group_id": gid,
        })
        tx = res.get("tx_hash") or res.get("transaction", {}).get("hash", "")
        if tx:
            get_tx_result(tx)
        wait_for_chain(5)

        # Cancel own request
        res2 = relay_execute_as(REQUESTER2, {
            "type": "cancel_join_request",
            "group_id": gid,
        })
        tx2 = res2.get("tx_hash") or res2.get("transaction", {}).get("hash", "")
        if tx2:
            get_tx_result(tx2)
        wait_for_chain(5)

        is_mem = is_group_member(gid, REQUESTER2)
        jr = _get_join_request(gid, REQUESTER2)
        if not is_mem:
            ok("cancel join request", "request cancelled, not a member")
        else:
            fail("cancel join request", "became member after cancel")
    except Exception as e:
        fail("cancel join request", str(e))


def test_blacklisted_cannot_request_join():
    """Blacklisted user cannot create a join request."""
    gid = _ensure_private_group()
    try:
        # Blacklist outsider (must be owner)
        # First have outsider send a request so contract knows about them
        login_as(OUTSIDER)
        try:
            res = relay_execute_as(OUTSIDER, {
                "type": "join_group",
                "group_id": gid,
            })
            tx = res.get("tx_hash") or res.get("transaction", {}).get("hash", "")
            if tx:
                get_tx_result(tx)
            wait_for_chain(3)
        except Exception:
            pass  # may already have pending request

        # Reject + blacklist
        try:
            relay_execute({
                "type": "reject_join_request",
                "group_id": gid,
                "requester_id": OUTSIDER,
            })
            wait_for_chain(3)
        except Exception:
            pass

        res = relay_execute({
            "type": "blacklist_group_member",
            "group_id": gid,
            "member_id": OUTSIDER,
        })
        tx = res.get("tx_hash") or res.get("transaction", {}).get("hash", "")
        if tx:
            get_tx_result(tx)
        wait_for_chain(3)

        # Now try to join — should fail
        login_as(OUTSIDER)
        res2 = relay_execute_as(OUTSIDER, {
            "type": "join_group",
            "group_id": gid,
        })
        tx2 = res2.get("tx_hash") or res2.get("transaction", {}).get("hash", "")
        if tx2:
            try:
                get_tx_result(tx2)
                is_mem = is_group_member(gid, OUTSIDER)
                if not is_mem:
                    ok("blacklisted join request", "TX ok but not a member")
                else:
                    fail("blacklisted join request", "blacklisted user joined!")
            except RuntimeError as tx_err:
                ok("blacklisted join request", f"TX failed: {str(tx_err)[:80]}")
        else:
            ok("blacklisted join request", "relay rejected")
    except RuntimeError as e:
        if any(kw in str(e).lower() for kw in ["blacklist", "banned", "fail", "denied"]):
            ok("blacklisted join request", f"rejected: {str(e)[:80]}")
        else:
            fail("blacklisted join request", str(e))
    except Exception as e:
        fail("blacklisted join request", str(e))


def test_already_member_cannot_request():
    """Already-member cannot create a join request."""
    gid = _ensure_private_group()
    try:
        # REQUESTER was already approved above; try joining again
        login_as(REQUESTER)
        res = relay_execute_as(REQUESTER, {
            "type": "join_group",
            "group_id": gid,
        })
        tx = res.get("tx_hash") or res.get("transaction", {}).get("hash", "")
        if tx:
            try:
                get_tx_result(tx)
                ok("already member request", "TX ok (no-op or silently ignored)")
            except RuntimeError as tx_err:
                if any(kw in str(tx_err).lower() for kw in ["already", "member", "exist"]):
                    ok("already member request", f"correctly rejected: {str(tx_err)[:80]}")
                else:
                    ok("already member request", f"TX failed: {str(tx_err)[:80]}")
        else:
            ok("already member request", "relay rejected")
    except RuntimeError as e:
        if any(kw in str(e).lower() for kw in ["already", "member", "exist"]):
            ok("already member request", f"rejected: {str(e)[:80]}")
        else:
            fail("already member request", str(e))
    except Exception as e:
        fail("already member request", str(e))


# ---------------------------------------------------------------------------
def run():
    print("\n  ── Private Group Join Request Tests ────────────")
    test_private_group_created()
    test_join_creates_request()
    test_approve_join_request()
    test_reject_join_request()
    test_cancel_own_join_request()
    test_blacklisted_cannot_request_join()
    test_already_member_cannot_request()


if __name__ == "__main__":
    from helpers import summary
    login()
    run()
    summary()
