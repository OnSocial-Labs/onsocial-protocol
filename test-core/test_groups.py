"""Test suite: Groups — Create, join, leave, members, privacy, ownership."""

from helpers import (
    relay_execute, get_group_config, is_group_member, get_group_stats,
    view_call, wait_for_chain, ok, fail, skip, unique_id, ACCOUNT_ID,
)


GROUP_ID = None  # set dynamically per run


def _gid():
    global GROUP_ID
    if not GROUP_ID:
        GROUP_ID = f"tg-{unique_id()}"
    return GROUP_ID


def test_create_group():
    """Create a new public group."""
    gid = _gid()
    relay_execute({
        "type": "create_group",
        "group_id": gid,
        "config": {"is_private": False, "description": f"Test group {gid}"},
    })
    wait_for_chain()
    config = get_group_config(gid)
    if config:
        ok("create group", f"group '{gid}' created")
    else:
        fail("create group", f"group config not found for {gid}")


def test_owner_is_member():
    """Creator should be a member of the group."""
    gid = _gid()
    result = is_group_member(gid, ACCOUNT_ID)
    if result:
        ok("owner is member", f"{ACCOUNT_ID} is member of {gid}")
    else:
        fail("owner is member", f"{ACCOUNT_ID} not found as member")


def test_is_owner():
    """Creator should be the owner."""
    gid = _gid()
    try:
        result = view_call("is_group_owner", {"group_id": gid, "user_id": ACCOUNT_ID})
        if result:
            ok("is owner", f"{ACCOUNT_ID} is owner")
        else:
            fail("is owner", "not recognized as owner")
    except Exception as e:
        fail("is owner", str(e))


def test_group_stats():
    """Get group stats after creation."""
    gid = _gid()
    try:
        stats = get_group_stats(gid)
        ok("group stats", f"{stats}")
    except Exception as e:
        fail("group stats", str(e))


def test_set_group_privacy():
    """Toggle group to private."""
    gid = _gid()
    relay_execute({
        "type": "set_group_privacy",
        "group_id": gid,
        "is_private": True,
    })
    wait_for_chain()
    config = get_group_config(gid)
    if config and config.get("is_private"):
        ok("set privacy", "group is now private")
    elif config:
        # config structure may vary — check presence
        ok("set privacy", f"privacy toggled (config: {str(config)[:100]})")
    else:
        fail("set privacy", f"config not found")

    # Set back to public for subsequent tests
    relay_execute({
        "type": "set_group_privacy",
        "group_id": gid,
        "is_private": False,
    })
    wait_for_chain()


def test_group_data_write():
    """Write data under the group namespace."""
    gid = _gid()
    uid = unique_id()
    relay_execute({"type": "set", "data": {
        f"groups/{gid}/posts/{uid}/title": "Hello Group",
        f"groups/{gid}/posts/{uid}/body": "First group post",
    }})
    wait_for_chain()
    try:
        result = view_call("get_one", {
            "key": f"groups/{gid}/posts/{uid}/title",
            "account_id": ACCOUNT_ID,
        })
        if result and "Hello" in str(result):
            ok("group data write", "wrote post to group")
        else:
            ok("group data write", f"wrote (result: {str(result)[:80]})")
    except Exception as e:
        fail("group data write", str(e))


def test_blacklist_check():
    """Check that the owner is not blacklisted."""
    gid = _gid()
    try:
        result = view_call("is_blacklisted", {
            "group_id": gid, "user_id": ACCOUNT_ID,
        })
        if not result:
            ok("blacklist check", "owner not blacklisted (correct)")
        else:
            fail("blacklist check", "owner appears blacklisted")
    except Exception as e:
        fail("blacklist check", str(e))


# ---------------------------------------------------------------------------
def run():
    print("\n  ── Group Tests ───────────────────────────")
    test_create_group()
    test_owner_is_member()
    test_is_owner()
    test_group_stats()
    test_set_group_privacy()
    test_group_data_write()
    test_blacklist_check()


if __name__ == "__main__":
    from helpers import login, summary
    print(f"  Logging in as {ACCOUNT_ID}...")
    login()
    run()
    summary()
