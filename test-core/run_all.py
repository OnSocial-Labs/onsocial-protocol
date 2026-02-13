#!/usr/bin/env python3
"""Run test-core suites against live testnet contract.

Usage:
  python3 test-core/run_all.py                  # run all suites
  python3 test-core/run_all.py --suite data      # run one suite
  python3 test-core/run_all.py --suite groups
  python3 test-core/run_all.py --suite voting
  python3 test-core/run_all.py --suite permissions
  python3 test-core/run_all.py --suite views
"""

import sys
import os
import argparse
import time

# Ensure test-core/ is on the path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import helpers
import test_views
import test_data
import test_groups
import test_voting
import test_permissions

SUITES = {
    "views": test_views,
    "data": test_data,
    "groups": test_groups,
    "voting": test_voting,
    "permissions": test_permissions,
}


def main():
    parser = argparse.ArgumentParser(description="Test core-onsocial on testnet")
    parser.add_argument("--suite", "-s", choices=list(SUITES.keys()),
                        help="Run a specific suite (default: all)")
    args = parser.parse_args()

    print("=" * 60)
    print("  OnSocial Core Contract — Live Testnet Tests")
    print("=" * 60)
    print(f"  Gateway:  {helpers.GATEWAY_URL}")
    print(f"  Account:  {helpers.ACCOUNT_ID}")
    print(f"  Contract: {helpers.CONTRACT_ID}")
    print(f"  Time:     {time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime())}")

    # Views don't need auth
    if args.suite == "views":
        test_views.run()
        sys.exit(0 if helpers.summary() else 1)

    # All other suites need JWT (except voting which uses near CLI)
    print(f"\n  Authenticating...")
    helpers.login()
    print(f"  ✅ JWT acquired (default: {helpers.ACCOUNT_ID})")

    # Also login default account via login_as for relay_execute_as
    helpers.login_as(helpers.ACCOUNT_ID)

    # Voting suite uses near CLI for deposit-requiring ops (no JWT needed)
    if args.suite == "voting" or args.suite is None:
        print(f"  ℹ️  Voting tests use `near call` CLI (deposits required)")
    print()

    if args.suite:
        SUITES[args.suite].run()
    else:
        for name, mod in SUITES.items():
            mod.run()

    success = helpers.summary()
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
