"""Test suite: Views — Contract info, status, config (read-only, no gas)."""

from helpers import (
    view_call, get_contract_info, ok, fail, CONTRACT_ID, ACCOUNT_ID,
)


def test_contract_info():
    """Get basic contract info."""
    try:
        info = get_contract_info()
        ok("contract info", f"{info}")
    except Exception as e:
        fail("contract info", str(e))


def test_contract_status():
    """Get contract status (Live/ReadOnly/Genesis)."""
    try:
        result = view_call("get_contract_status", {})
        ok("contract status", f"{result}")
    except Exception as e:
        fail("contract status", str(e))


def test_contract_version():
    """Get contract version."""
    try:
        result = view_call("get_version", {})
        ok("contract version", f"{result}")
    except Exception as e:
        fail("contract version", str(e))


def test_contract_config():
    """Get governance config."""
    try:
        result = view_call("get_config", {})
        ok("governance config", f"{str(result)[:150]}")
    except Exception as e:
        fail("governance config", str(e))


def test_platform_pool():
    """Get platform pool info."""
    try:
        result = view_call("get_platform_pool", {})
        ok("platform pool", f"{result}")
    except Exception as e:
        fail("platform pool", str(e))


def test_platform_allowance():
    """Get platform allowance for test account."""
    try:
        result = view_call("get_platform_allowance", {"account_id": ACCOUNT_ID})
        ok("platform allowance", f"{result}")
    except Exception as e:
        fail("platform allowance", str(e))


# ---------------------------------------------------------------------------
def run():
    print("\n  ── View Tests (read-only, free) ──────────")
    test_contract_info()
    test_contract_status()
    test_contract_version()
    test_contract_config()
    test_platform_pool()
    test_platform_allowance()


if __name__ == "__main__":
    run()
    from helpers import summary
    summary()
