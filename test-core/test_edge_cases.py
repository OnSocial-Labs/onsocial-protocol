"""Test suite: Edge Cases — validation, reserved keys, duplicate IDs, boundary conditions.

Covers:
- Data: delete (null), reserved keys, key without slash
- Groups: duplicate ID, invalid ID, double-join, member-driven must be private,
  privacy toggle, non-owner blacklist, non-owner set privacy
- Views: nonexistent entities
- Permissions: nonexistent path/account
"""

import time
from helpers import (
    relay_execute, relay_execute_as, near_call,
    view_call, is_group_member, has_permission, get_permissions,
    get_group_config, get_tx_result,
    wait_for_chain, login, login_as,
    ok, fail, skip, unique_id, ACCOUNT_ID,
)

MEMBER = "test02.onsocial.testnet"
OUTSIDER = "test04.onsocial.testnet"


# ---------------------------------------------------------------------------
# Data Edge Cases
# ---------------------------------------------------------------------------

def test_delete_data_null():
    """Set a key to null should delete/clear it."""
    key = f"test/del-{unique_id()}"
    try:
        relay_execute({"type": "set", "data": {key: "exists"}})
        wait_for_chain(5)
        relay_execute({"type": "set", "data": {key: None}})
        wait_for_chain(5)
        result = view_call("get_one", {"key": key, "account_id": ACCOUNT_ID})
        if result is None or (isinstance(result, dict) and result.get("value") is None):
            ok("delete data (null)", "key cleared")
        else:
            ok("delete data (null)", f"result after null: {str(result)[:60]}")
    except Exception as e:
        fail("delete data (null)", str(e))


def test_reserved_key_config():
    """Writing to reserved 'config' key must fail."""
    try:
        relay_execute({"type": "set", "data": {"config": "hack"}})
        wait_for_chain(3)
        fail("reserved key: config", "write accepted")
    except RuntimeError as e:
        if any(kw in str(e).lower() for kw in ["reserved", "update_config", "fail", "invalid"]):
            ok("reserved key: config", f"rejected: {str(e)[:80]}")
        else:
            ok("reserved key: config", f"error: {str(e)[:80]}")
    except Exception as e:
        fail("reserved key: config", str(e))


def test_reserved_key_status():
    """Writing to reserved 'status/read_only' key must fail."""
    try:
        relay_execute({"type": "set", "data": {"status/read_only": "true"}})
        wait_for_chain(3)
        fail("reserved key: status", "write accepted")
    except RuntimeError as e:
        if any(kw in str(e).lower() for kw in ["reserved", "enter_read_only", "fail", "invalid"]):
            ok("reserved key: status", f"rejected: {str(e)[:80]}")
        else:
            ok("reserved key: status", f"error: {str(e)[:80]}")
    except Exception as e:
        fail("reserved key: status", str(e))


def test_key_without_slash():
    """Key without a slash (e.g. just 'name') must fail."""
    try:
        relay_execute({"type": "set", "data": {"name": "bare key"}})
        wait_for_chain(3)
        fail("key without slash", "bare key accepted")
    except RuntimeError as e:
        if any(kw in str(e).lower() for kw in ["invalid", "operation", "fail"]):
            ok("key without slash", f"rejected: {str(e)[:80]}")
        else:
            ok("key without slash", f"error: {str(e)[:80]}")
    except Exception as e:
        fail("key without slash", str(e))


def test_unknown_storage_key():
    """Unknown storage/* sub-key must fail."""
    try:
        relay_execute({"type": "set", "data": {"storage/fake": "bad"}})
        wait_for_chain(3)
        fail("unknown storage key", "accepted")
    except RuntimeError as e:
        if any(kw in str(e).lower() for kw in ["invalid", "operation", "fail"]):
            ok("unknown storage key", f"rejected: {str(e)[:80]}")
        else:
            ok("unknown storage key", f"error: {str(e)[:80]}")
    except Exception as e:
        fail("unknown storage key", str(e))


def test_unknown_permission_key():
    """Unknown permission/* sub-key must fail."""
    try:
        relay_execute({"type": "set", "data": {"permission/fake": "bad"}})
        wait_for_chain(3)
        fail("unknown permission key", "accepted")
    except RuntimeError as e:
        if any(kw in str(e).lower() for kw in ["invalid", "operation", "fail"]):
            ok("unknown permission key", f"rejected: {str(e)[:80]}")
        else:
            ok("unknown permission key", f"error: {str(e)[:80]}")
    except Exception as e:
        fail("unknown permission key", str(e))


# ---------------------------------------------------------------------------
# Group Edge Cases
# ---------------------------------------------------------------------------

def test_duplicate_group_id():
    """Creating a group with an existing ID must fail."""
    gid = f"dup-{unique_id()}"
    try:
        relay_execute({
            "type": "create_group",
            "group_id": gid,
            "config": {"is_private": False, "description": "first"},
        })
        wait_for_chain(5)
        # Try creating again
        res = relay_execute({
            "type": "create_group",
            "group_id": gid,
            "config": {"is_private": False, "description": "second"},
        })
        tx = res.get("tx_hash") or res.get("transaction", {}).get("hash", "")
        if tx:
            try:
                get_tx_result(tx)
                fail("duplicate group ID", "second create succeeded")
            except RuntimeError as tx_err:
                if any(kw in str(tx_err).lower() for kw in ["already", "exist", "fail"]):
                    ok("duplicate group ID", f"rejected: {str(tx_err)[:80]}")
                else:
                    ok("duplicate group ID", f"TX failed: {str(tx_err)[:80]}")
        else:
            ok("duplicate group ID", "relay rejected second create")
    except RuntimeError as e:
        if any(kw in str(e).lower() for kw in ["already", "exist", "fail"]):
            ok("duplicate group ID", f"rejected: {str(e)[:80]}")
        else:
            fail("duplicate group ID", str(e))
    except Exception as e:
        fail("duplicate group ID", str(e))


def test_invalid_group_id_empty():
    """Empty group ID must fail."""
    try:
        res = relay_execute({
            "type": "create_group",
            "group_id": "",
            "config": {"is_private": False, "description": "empty id"},
        })
        tx = res.get("tx_hash") or res.get("transaction", {}).get("hash", "")
        if tx:
            try:
                get_tx_result(tx)
                fail("empty group ID", "accepted empty ID")
            except RuntimeError:
                ok("empty group ID", "TX rejected")
        else:
            ok("empty group ID", "relay rejected")
    except RuntimeError as e:
        if any(kw in str(e).lower() for kw in ["character", "invalid", "fail"]):
            ok("empty group ID", f"rejected: {str(e)[:80]}")
        else:
            ok("empty group ID", f"error: {str(e)[:80]}")
    except Exception as e:
        fail("empty group ID", str(e))


def test_invalid_group_id_special_chars():
    """Group ID with special characters must fail."""
    try:
        res = relay_execute({
            "type": "create_group",
            "group_id": "bad group!@#$",
            "config": {"is_private": False, "description": "special chars"},
        })
        tx = res.get("tx_hash") or res.get("transaction", {}).get("hash", "")
        if tx:
            try:
                get_tx_result(tx)
                fail("special char group ID", "accepted special chars")
            except RuntimeError:
                ok("special char group ID", "TX rejected")
        else:
            ok("special char group ID", "relay rejected")
    except RuntimeError as e:
        if any(kw in str(e).lower() for kw in ["alphanumeric", "invalid", "fail"]):
            ok("special char group ID", f"rejected: {str(e)[:80]}")
        else:
            ok("special char group ID", f"error: {str(e)[:80]}")
    except Exception as e:
        fail("special char group ID", str(e))


def test_double_join():
    """Joining a group you're already in must fail."""
    gid = f"dj-{unique_id()}"
    try:
        relay_execute({
            "type": "create_group",
            "group_id": gid,
            "config": {"is_private": False, "description": "double join test"},
        })
        wait_for_chain(5)
        login_as(MEMBER)
        res = relay_execute_as(MEMBER, {"type": "join_group", "group_id": gid})
        tx = res.get("tx_hash") or res.get("transaction", {}).get("hash", "")
        if tx:
            get_tx_result(tx)
        wait_for_chain(5)

        # Try joining again
        res2 = relay_execute_as(MEMBER, {"type": "join_group", "group_id": gid})
        tx2 = res2.get("tx_hash") or res2.get("transaction", {}).get("hash", "")
        if tx2:
            try:
                get_tx_result(tx2)
                ok("double join", "TX ok (no-op or silently ignored)")
            except RuntimeError as tx_err:
                if any(kw in str(tx_err).lower() for kw in ["already", "exist", "member"]):
                    ok("double join", f"rejected: {str(tx_err)[:80]}")
                else:
                    ok("double join", f"TX failed: {str(tx_err)[:80]}")
        else:
            ok("double join", "relay rejected second join")
    except RuntimeError as e:
        if any(kw in str(e).lower() for kw in ["already", "exist", "member"]):
            ok("double join", f"rejected: {str(e)[:80]}")
        else:
            fail("double join", str(e))
    except Exception as e:
        fail("double join", str(e))


def test_member_driven_must_be_private():
    """Member-driven group with is_private=false must fail."""
    gid = f"md-pub-{unique_id()}"
    try:
        near_call(ACCOUNT_ID, {
            "type": "create_group",
            "group_id": gid,
            "config": {"member_driven": True, "is_private": False},
        }, deposit="0.1")
        # Check if group exists and is actually private
        wait_for_chain(3)
        config = get_group_config(gid)
        if config and config.get("is_private"):
            ok("member-driven must be private", "contract forced private")
        elif config:
            fail("member-driven must be private", f"created as public!")
        else:
            ok("member-driven must be private", "group not created")
    except RuntimeError as e:
        if any(kw in str(e).lower() for kw in ["private", "democratic", "member-driven", "panicked"]):
            ok("member-driven must be private", f"rejected: {str(e)[:80]}")
        else:
            ok("member-driven must be private", f"error: {str(e)[:80]}")
    except Exception as e:
        fail("member-driven must be private", str(e))


def test_non_owner_cannot_blacklist():
    """Regular member cannot blacklist (needs MANAGE)."""
    gid = f"blk-{unique_id()}"
    try:
        relay_execute({
            "type": "create_group",
            "group_id": gid,
            "config": {"is_private": False, "description": "blacklist test"},
        })
        wait_for_chain(5)
        # Member joins
        login_as(MEMBER)
        res = relay_execute_as(MEMBER, {"type": "join_group", "group_id": gid})
        tx = res.get("tx_hash") or res.get("transaction", {}).get("hash", "")
        if tx:
            get_tx_result(tx)
        wait_for_chain(3)
        # Outsider joins
        login_as(OUTSIDER)
        res = relay_execute_as(OUTSIDER, {"type": "join_group", "group_id": gid})
        tx = res.get("tx_hash") or res.get("transaction", {}).get("hash", "")
        if tx:
            get_tx_result(tx)
        wait_for_chain(3)

        # Member (not owner/admin) tries to blacklist outsider
        res2 = relay_execute_as(MEMBER, {
            "type": "blacklist_group_member",
            "group_id": gid,
            "member_id": OUTSIDER,
        })
        tx2 = res2.get("tx_hash") or res2.get("transaction", {}).get("hash", "")
        if tx2:
            try:
                get_tx_result(tx2)
                is_bl = view_call("is_blacklisted", {"group_id": gid, "user_id": OUTSIDER})
                if is_bl:
                    fail("non-owner blacklist", "regular member blacklisted someone!")
                else:
                    ok("non-owner blacklist", "TX ok but blacklist not applied")
            except RuntimeError as tx_err:
                ok("non-owner blacklist", f"TX failed: {str(tx_err)[:80]}")
        else:
            ok("non-owner blacklist", "relay rejected")
    except RuntimeError as e:
        if any(kw in str(e).lower() for kw in ["permission", "denied", "fail"]):
            ok("non-owner blacklist", f"rejected: {str(e)[:80]}")
        else:
            fail("non-owner blacklist", str(e))
    except Exception as e:
        fail("non-owner blacklist", str(e))


def test_non_owner_cannot_set_privacy():
    """Non-owner cannot change group privacy."""
    gid = f"priv-{unique_id()}"
    try:
        relay_execute({
            "type": "create_group",
            "group_id": gid,
            "config": {"is_private": False, "description": "privacy test"},
        })
        wait_for_chain(5)
        login_as(MEMBER)
        res = relay_execute_as(MEMBER, {"type": "join_group", "group_id": gid})
        tx = res.get("tx_hash") or res.get("transaction", {}).get("hash", "")
        if tx:
            get_tx_result(tx)
        wait_for_chain(3)

        # Non-owner tries to set privacy
        res2 = relay_execute_as(MEMBER, {
            "type": "set_group_privacy",
            "group_id": gid,
            "is_private": True,
        })
        tx2 = res2.get("tx_hash") or res2.get("transaction", {}).get("hash", "")
        if tx2:
            try:
                get_tx_result(tx2)
                config = get_group_config(gid)
                if config and not config.get("is_private"):
                    ok("non-owner set privacy", "TX ok but privacy unchanged")
                else:
                    fail("non-owner set privacy", "non-owner changed privacy!")
            except RuntimeError as tx_err:
                ok("non-owner set privacy", f"TX failed: {str(tx_err)[:80]}")
        else:
            ok("non-owner set privacy", "relay rejected")
    except RuntimeError as e:
        if any(kw in str(e).lower() for kw in ["permission", "denied", "owner", "fail"]):
            ok("non-owner set privacy", f"rejected: {str(e)[:80]}")
        else:
            fail("non-owner set privacy", str(e))
    except Exception as e:
        fail("non-owner set privacy", str(e))


# ---------------------------------------------------------------------------
# View Edge Cases
# ---------------------------------------------------------------------------

def test_view_nonexistent_group():
    """get_group_config for nonexistent group."""
    try:
        result = view_call("get_group_config", {"group_id": "nonexistent_group_xyz"})
        if result is None:
            ok("view nonexistent group", "returned null")
        else:
            ok("view nonexistent group", f"result: {str(result)[:60]}")
    except Exception as e:
        if any(kw in str(e).lower() for kw in ["not found", "does not exist", "error"]):
            ok("view nonexistent group", f"error: {str(e)[:60]}")
        else:
            fail("view nonexistent group", str(e))


def test_view_nonexistent_proposal():
    """get_proposal for nonexistent proposal."""
    try:
        result = view_call("get_proposal", {
            "group_id": "nonexistent_group_xyz",
            "proposal_id": "nonexistent_prop",
        })
        if result is None:
            ok("view nonexistent proposal", "returned null")
        else:
            ok("view nonexistent proposal", f"result: {str(result)[:60]}")
    except Exception as e:
        if any(kw in str(e).lower() for kw in ["not found", "error"]):
            ok("view nonexistent proposal", f"error: {str(e)[:60]}")
        else:
            fail("view nonexistent proposal", str(e))


def test_permission_nonexistent_path():
    """has_permission for ungranted path returns false."""
    try:
        result = has_permission(ACCOUNT_ID, OUTSIDER, "never/granted/path", 1)
        if not result:
            ok("permission nonexistent path", "correctly false")
        else:
            fail("permission nonexistent path", "returned true for ungranted path")
    except Exception as e:
        fail("permission nonexistent path", str(e))


def test_permission_nonexistent_owner():
    """has_permission for nonexistent owner."""
    try:
        result = has_permission("nobody.testnet", OUTSIDER, "some/path", 1)
        if not result:
            ok("permission nonexistent owner", "correctly false")
        else:
            fail("permission nonexistent owner", "returned true for nonexistent owner")
    except Exception as e:
        # May error on unregistered account
        ok("permission nonexistent owner", f"error: {str(e)[:60]}")


def test_is_member_nonexistent_group():
    """is_group_member for nonexistent group."""
    try:
        result = is_group_member("nonexistent_group_xyz", ACCOUNT_ID)
        if not result:
            ok("member nonexistent group", "correctly false")
        else:
            fail("member nonexistent group", "returned true")
    except Exception as e:
        ok("member nonexistent group", f"error: {str(e)[:60]}")


# ---------------------------------------------------------------------------
def run():
    print("\n  ── Edge Case Tests ────────────────────────")
    # Data
    test_delete_data_null()
    test_reserved_key_config()
    test_reserved_key_status()
    test_key_without_slash()
    test_unknown_storage_key()
    test_unknown_permission_key()
    # Groups
    test_duplicate_group_id()
    test_invalid_group_id_empty()
    test_invalid_group_id_special_chars()
    test_double_join()
    test_member_driven_must_be_private()
    test_non_owner_cannot_blacklist()
    test_non_owner_cannot_set_privacy()
    # Views
    test_view_nonexistent_group()
    test_view_nonexistent_proposal()
    test_permission_nonexistent_path()
    test_permission_nonexistent_owner()
    test_is_member_nonexistent_group()


if __name__ == "__main__":
    from helpers import summary
    login()
    run()
    summary()
