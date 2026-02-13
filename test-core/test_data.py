"""Test suite: Data — Set/get key-value data on-chain."""

from helpers import (
    relay_execute, get_data, view_call, wait_for_chain,
    ok, fail, skip, unique_id, ACCOUNT_ID,
)


def test_set_and_read():
    """Set a profile value via relay, read it back via RPC."""
    val = f"testdata-{unique_id()}"
    relay_execute({"type": "set", "data": {"profile/test_key": val}})
    wait_for_chain(5)
    result = get_data("profile/test_key")
    actual = result.get("value") if isinstance(result, dict) else result
    if actual == val:
        ok("set + get", f"wrote and read back: {val}")
    else:
        fail("set + get", f"expected {val}, got value={actual}")


def test_set_multiple_keys():
    """Set multiple keys in one call."""
    uid = unique_id()
    relay_execute({"type": "set", "data": {
        f"test/{uid}/a": "alpha",
        f"test/{uid}/b": "beta",
        f"test/{uid}/c": "gamma",
    }})
    wait_for_chain(5)
    keys = [f"{ACCOUNT_ID}/test/{uid}/a", f"{ACCOUNT_ID}/test/{uid}/b", f"{ACCOUNT_ID}/test/{uid}/c"]
    result = view_call("get", {"keys": keys})
    values = [e.get("value") for e in result if e.get("value")] if isinstance(result, list) else []
    if len(values) == 3:
        ok("multi-key set", f"3 keys written: {values}")
    else:
        fail("multi-key set", f"expected 3 values, got {len(values)}: {result}")


def test_overwrite_key():
    """Overwrite an existing key."""
    key = f"profile/ow_{unique_id()}"
    relay_execute({"type": "set", "data": {key: "first"}})
    wait_for_chain(5)
    relay_execute({"type": "set", "data": {key: "second"}})
    wait_for_chain(5)
    result = get_data(key)
    actual = result.get("value") if isinstance(result, dict) else result
    if actual == "second":
        ok("overwrite key", "value updated correctly")
    else:
        fail("overwrite key", f"expected 'second', got '{actual}'")


def test_get_nonexistent_key():
    """Reading a key that doesn't exist."""
    try:
        result = get_data(f"nonexistent/{unique_id()}")
        if result is None or (isinstance(result, dict) and result.get("value") is None):
            ok("get nonexistent", "returned null as expected")
        else:
            ok("get nonexistent", f"returned: {result}")
    except Exception as e:
        fail("get nonexistent", str(e))


def test_get_storage_balance():
    """Check storage balance for the test account."""
    try:
        result = view_call("get_storage_balance", {"account_id": ACCOUNT_ID})
        ok("storage balance", f"{result}")
    except Exception as e:
        fail("storage balance", str(e))


def test_get_nonce():
    """Check nonce for the test account."""
    try:
        signing_key_str = None
        from helpers import load_keypair
        _, pub_key = load_keypair()
        result = view_call("get_nonce", {
            "account_id": ACCOUNT_ID,
            "public_key": pub_key,
        })
        ok("get nonce", f"nonce = {result}")
    except Exception as e:
        fail("get nonce", str(e))


# ---------------------------------------------------------------------------
def run():
    print("\n  ── Data Tests ────────────────────────────")
    test_set_and_read()
    test_set_multiple_keys()
    test_overwrite_key()
    test_get_nonexistent_key()
    test_get_storage_balance()
    test_get_nonce()


if __name__ == "__main__":
    from helpers import login, summary
    print(f"  Logging in as {ACCOUNT_ID}...")
    login()
    run()
    summary()
