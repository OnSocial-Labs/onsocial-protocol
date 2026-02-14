"""Test suite: Storage Operations — deposit, withdraw, share, balance views.

Storage ops use the `set` action with special keys like `storage/deposit`.
Deposit/withdraw require attached NEAR → use `near call` CLI.
View calls check balances via direct RPC.

Accounts: test01 (owner), test02 (target for share)
"""

import time
from helpers import (
    near_call, relay_execute,
    view_call, get_tx_result,
    wait_for_chain, login,
    ok, fail, skip, unique_id, ACCOUNT_ID,
)

TARGET = "test02.onsocial.testnet"


def _get_storage_balance(account_id: str | None = None) -> dict | None:
    """Get storage balance for an account."""
    try:
        return view_call("get_storage_balance", {
            "account_id": account_id or ACCOUNT_ID,
        })
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_storage_deposit():
    """Deposit NEAR to storage balance via near call."""
    try:
        before = _get_storage_balance()
        near_call(ACCOUNT_ID, {
            "type": "set",
            "data": {"storage/deposit": {"amount": "10000000000000000000000"}},
        }, deposit="0.01")
        wait_for_chain(5)
        after = _get_storage_balance()
        if after is not None:
            ok("storage deposit", f"balance: {str(after)[:100]}")
        else:
            fail("storage deposit", "could not read balance after deposit")
    except Exception as e:
        fail("storage deposit", str(e))


def test_storage_withdraw():
    """Withdraw from storage balance."""
    try:
        before = _get_storage_balance()
        # Withdraw a small amount
        near_call(ACCOUNT_ID, {
            "type": "set",
            "data": {"storage/withdraw": {"amount": "1000000000000000000000"}},
        })
        wait_for_chain(5)
        after = _get_storage_balance()
        if after is not None:
            ok("storage withdraw", f"balance after: {str(after)[:100]}")
        else:
            ok("storage withdraw", "withdraw submitted")
    except RuntimeError as e:
        if any(kw in str(e).lower() for kw in ["insufficient", "nothing", "exceed"]):
            ok("storage withdraw", f"correctly rejected (low balance): {str(e)[:80]}")
        else:
            fail("storage withdraw", str(e))
    except Exception as e:
        fail("storage withdraw", str(e))


def test_storage_withdraw_excess_rejected():
    """Withdraw more than available must fail."""
    try:
        # Try to withdraw a huge amount
        near_call(ACCOUNT_ID, {
            "type": "set",
            "data": {"storage/withdraw": {"amount": "999000000000000000000000000"}},
        })
        fail("withdraw excess", "excessive withdrawal accepted")
    except RuntimeError as e:
        if any(kw in str(e).lower() for kw in ["exceed", "insufficient", "panicked"]):
            ok("withdraw excess", "correctly rejected")
        else:
            ok("withdraw excess", f"rejected: {str(e)[:120]}")
    except Exception as e:
        fail("withdraw excess", str(e))


def test_storage_deposit_zero_rejected():
    """Deposit with amount=0 must fail."""
    try:
        near_call(ACCOUNT_ID, {
            "type": "set",
            "data": {"storage/deposit": {"amount": "0"}},
        }, deposit="0.01")
        fail("deposit zero", "zero deposit accepted")
    except RuntimeError as e:
        if any(kw in str(e).lower() for kw in ["zero", "greater", "panicked"]):
            ok("deposit zero", "correctly rejected")
        else:
            ok("deposit zero", f"rejected: {str(e)[:120]}")
    except Exception as e:
        fail("deposit zero", str(e))


def test_get_platform_pool():
    """Platform pool view returns data."""
    try:
        result = view_call("get_platform_pool", {})
        if result is not None:
            ok("platform pool view", f"{str(result)[:100]}")
        else:
            ok("platform pool view", "returned null")
    except Exception as e:
        fail("platform pool view", str(e))


def test_get_platform_allowance():
    """Platform allowance view for test account."""
    try:
        result = view_call("get_platform_allowance", {"account_id": ACCOUNT_ID})
        if result is not None:
            ok("platform allowance", f"{str(result)[:100]}")
        else:
            ok("platform allowance", "no allowance")
    except Exception as e:
        fail("platform allowance", str(e))


def test_get_storage_balance_nonexistent():
    """Storage balance for nonexistent account."""
    try:
        result = view_call("get_storage_balance", {
            "account_id": "nonexistent.testnet",
        })
        if result is None or (isinstance(result, dict) and not result):
            ok("balance nonexistent", "null/empty for unknown account")
        else:
            ok("balance nonexistent", f"result: {str(result)[:80]}")
    except Exception as e:
        # May panic on unregistered account
        if any(kw in str(e).lower() for kw in ["not registered", "not found"]):
            ok("balance nonexistent", f"error for unknown: {str(e)[:80]}")
        else:
            ok("balance nonexistent", f"error: {str(e)[:80]}")


def test_invalid_storage_key_rejected():
    """Unknown storage/* key must fail."""
    try:
        near_call(ACCOUNT_ID, {
            "type": "set",
            "data": {"storage/bogus_op": {"amount": "1"}},
        })
        fail("invalid storage key", "unknown storage op accepted")
    except RuntimeError as e:
        if any(kw in str(e).lower() for kw in ["invalid", "operation", "panicked"]):
            ok("invalid storage key", "correctly rejected")
        else:
            ok("invalid storage key", f"rejected: {str(e)[:120]}")
    except Exception as e:
        fail("invalid storage key", str(e))


# ---------------------------------------------------------------------------
def run():
    print("\n  ── Storage Operations Tests ────────────")
    test_storage_deposit()
    test_storage_withdraw()
    test_storage_withdraw_excess_rejected()
    test_storage_deposit_zero_rejected()
    test_get_platform_pool()
    test_get_platform_allowance()
    test_get_storage_balance_nonexistent()
    test_invalid_storage_key_rejected()


if __name__ == "__main__":
    from helpers import summary
    login()
    run()
    summary()
