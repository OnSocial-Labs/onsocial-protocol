"""Test suite: Permissions — Grant, revoke, key permissions, group admin."""

from helpers import (
    relay_execute, has_permission, get_permissions, view_call, load_keypair,
    wait_for_chain, ok, fail, skip, unique_id, ACCOUNT_ID,
)


def test_set_permission():
    """Grant read permission on a path to self (for testing)."""
    try:
        relay_execute({
            "type": "set_permission",
            "grantee": ACCOUNT_ID,
            "path": "profile/",
            "level": 1,  # READ
            "expires_at": None,
        })
        wait_for_chain()
        ok("set permission", f"granted READ on profile/ to {ACCOUNT_ID}")
    except Exception as e:
        # May get "cannot grant to self" or similar
        if "self" in str(e).lower() or "owner" in str(e).lower():
            skip("set permission", f"self-grant not allowed: {e}")
        else:
            fail("set permission", str(e))


def test_has_permission():
    """Check permission level via view call."""
    try:
        result = has_permission(ACCOUNT_ID, ACCOUNT_ID, "profile/", 1)
        ok("has_permission", f"result: {result}")
    except Exception as e:
        fail("has_permission", str(e))


def test_get_permissions():
    """Get permission bitmask for a path."""
    try:
        result = get_permissions(ACCOUNT_ID, ACCOUNT_ID, "profile/")
        ok("get_permissions", f"level bitmask: {result}")
    except Exception as e:
        fail("get_permissions", str(e))


def test_set_key_permission():
    """Grant permission to a specific public key."""
    _, pub_key = load_keypair()
    try:
        relay_execute({
            "type": "set_key_permission",
            "public_key": pub_key,
            "path": "profile/name",
            "level": 1,  # READ
            "expires_at": None,
        })
        wait_for_chain()
        ok("set key permission", f"granted READ to key {pub_key[:30]}...")
    except Exception as e:
        fail("set key permission", str(e))


def test_has_key_permission():
    """Check key permission via view call."""
    _, pub_key = load_keypair()
    try:
        result = view_call("has_key_permission", {
            "owner": ACCOUNT_ID,
            "public_key": pub_key,
            "path": "profile/name",
            "required_level": 1,
        })
        ok("has_key_permission", f"result: {result}")
    except Exception as e:
        fail("has_key_permission", str(e))


def test_get_key_permissions():
    """Get key permission level."""
    _, pub_key = load_keypair()
    try:
        result = view_call("get_key_permissions", {
            "owner": ACCOUNT_ID,
            "public_key": pub_key,
            "path": "profile/name",
        })
        ok("get_key_permissions", f"level: {result}")
    except Exception as e:
        fail("get_key_permissions", str(e))


def test_revoke_permission():
    """Revoke permission (set level to 0)."""
    try:
        relay_execute({
            "type": "set_permission",
            "grantee": ACCOUNT_ID,
            "path": "profile/",
            "level": 0,  # NONE = revoke
            "expires_at": None,
        })
        wait_for_chain()
        ok("revoke permission", "set level to 0 (NONE)")
    except Exception as e:
        if "self" in str(e).lower():
            skip("revoke permission", "self-revoke not allowed")
        else:
            fail("revoke permission", str(e))


# ---------------------------------------------------------------------------
def run():
    print("\n  ── Permission Tests ──────────────────────")
    test_set_permission()
    test_has_permission()
    test_get_permissions()
    test_set_key_permission()
    test_has_key_permission()
    test_get_key_permissions()
    test_revoke_permission()


if __name__ == "__main__":
    from helpers import login, summary
    print(f"  Logging in as {ACCOUNT_ID}...")
    login()
    run()
    summary()
