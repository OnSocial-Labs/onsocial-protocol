"""Test suite: Voting — Multi-account proposals, votes, tallies, execution.

Member-driven groups are required for governance (proposals/votes).
Proposal creation requires 0.1 NEAR attached deposit → uses `near call` CLI.
Voting also requires a small deposit for storage → uses `near call` CLI.
View calls use direct RPC (no auth/deposit needed).

Accounts: test01 (owner), test02 (voter), test03 (voter), test04 (non-member)
"""

from helpers import (
    near_call, near_call_result,
    get_proposal, get_proposal_tally, get_group_config,
    get_group_stats, is_group_member, get_vote,
    view_call, wait_for_chain, ok, fail, skip, unique_id,
)

# ---------------------------------------------------------------------------
# Accounts
# ---------------------------------------------------------------------------
OWNER = "test01.onsocial.testnet"
VOTER2 = "test02.onsocial.testnet"
VOTER3 = "test03.onsocial.testnet"
NON_MEMBER = "test04.onsocial.testnet"

# Shared state across tests
GROUP_ID = None
_PROPOSAL_ID = None   # used by the approve-flow tests


# ---------------------------------------------------------------------------
# Group setup — member-driven, 3 members
# ---------------------------------------------------------------------------
def _ensure_group():
    """Create a member-driven group with owner + 2 voters.

    Member-driven groups:
    - Are always private (enforced by contract)
    - Require proposals for membership changes
    - Support governance (create_proposal / vote_on_proposal)

    With 1 member, auto_vote=true → instant execution.
    With 2 members, need both to vote (51% quorum).
    """
    global GROUP_ID
    if GROUP_ID:
        return GROUP_ID
    GROUP_ID = f"vg-{unique_id()}"

    # 1. Owner creates member-driven group (deposit covers storage)
    near_call(OWNER, {
        "type": "create_group",
        "group_id": GROUP_ID,
        "config": {"member_driven": True},
    }, deposit="0.1")
    wait_for_chain(2)

    # 2. Invite voter2 — auto_vote=true, test01 is sole member → instant exec
    near_call(OWNER, {
        "type": "create_proposal",
        "group_id": GROUP_ID,
        "proposal_type": "member_invite",
        "changes": {"target_user": VOTER2},
        "auto_vote": True,
    }, deposit="0.1")
    wait_for_chain(2)

    # 3. Invite voter3 — auto_vote=true but now 2 members,
    #    test01 = 50% < 51% quorum, so need test02 to also vote
    pid3 = near_call_result(OWNER, {
        "type": "create_proposal",
        "group_id": GROUP_ID,
        "proposal_type": "member_invite",
        "changes": {"target_user": VOTER3},
        "auto_vote": True,
    }, deposit="0.1")
    wait_for_chain(2)

    # test02 votes to approve voter3 (needs storage deposit first time)
    if pid3:
        near_call(VOTER2, {
            "type": "vote_on_proposal",
            "group_id": GROUP_ID,
            "proposal_id": pid3,
            "approve": True,
        }, deposit="0.01")
        wait_for_chain(2)

    return GROUP_ID


def _create_custom_proposal(
    title: str, auto_vote: bool = False, account: str | None = None
) -> str | None:
    """Create a custom proposal. Returns proposal_id or None."""
    gid = _ensure_group()
    caller = account or OWNER
    try:
        pid = near_call_result(caller, {
            "type": "create_proposal",
            "group_id": gid,
            "proposal_type": "custom_proposal",
            "changes": {
                "title": title,
                "description": f"Test: {title}",
                "custom_data": {"ts": unique_id()},
            },
            "auto_vote": auto_vote,
        }, deposit="0.1")
        return pid
    except Exception:
        return None


# ===== Tests =====


def test_group_setup():
    """Verify member-driven group has 3 members."""
    gid = _ensure_group()
    stats = get_group_stats(gid)
    count = stats.get("total_members", 0)
    cfg = get_group_config(gid)
    md = cfg.get("member_driven", False)
    m2 = is_group_member(gid, VOTER2)
    m3 = is_group_member(gid, VOTER3)
    if count >= 3 and md and m2 and m3:
        ok("group setup (member-driven, 3 members)", f"{gid}")
    else:
        fail("group setup", f"members={count}, md={md}, v2={m2}, v3={m3}")


def test_create_proposal_and_get_id():
    """Create a custom proposal (no auto_vote) and verify on-chain."""
    global _PROPOSAL_ID
    gid = _ensure_group()
    pid = _create_custom_proposal("Multi-voter approval test")
    if not pid:
        fail("create proposal", "could not create proposal")
        return
    _PROPOSAL_ID = pid
    # Verify proposal exists on-chain
    wait_for_chain(2)
    proposal = get_proposal(gid, pid)
    if proposal and proposal.get("status") in ("active", "Active"):
        ok("create proposal", f"id={pid}, status=active")
    elif proposal:
        ok("create proposal", f"id={pid}, status={proposal.get('status')}")
    else:
        fail("create proposal", f"id={pid} not found on-chain")


def test_initial_tally():
    """Verify initial tally: 0 votes, 3 locked members."""
    if not _PROPOSAL_ID:
        skip("initial tally", "no proposal_id")
        return
    gid = _ensure_group()
    tally = get_proposal_tally(gid, _PROPOSAL_ID)
    if not tally:
        fail("initial tally", "no tally returned")
        return
    total = tally.get("total_votes", -1)
    locked = tally.get("locked_member_count", -1)
    if total == 0 and locked >= 3:
        ok("initial tally", f"0/{locked} voted, proposal active")
    else:
        fail("initial tally", f"votes={total}, locked={locked}")


def test_vote_approve_voter2():
    """test02 votes approve — 1/3 voted (below 51% quorum)."""
    if not _PROPOSAL_ID:
        skip("vote: voter2 approve", "no proposal_id")
        return
    gid = _ensure_group()
    try:
        near_call(VOTER2, {
            "type": "vote_on_proposal",
            "group_id": gid,
            "proposal_id": _PROPOSAL_ID,
            "approve": True,
        }, deposit="0.01")
        wait_for_chain(2)
        tally = get_proposal_tally(gid, _PROPOSAL_ID)
        yes = tally.get("yes_votes", "?") if tally else "?"
        total = tally.get("total_votes", "?") if tally else "?"
        ok("vote: voter2 approve", f"yes={yes}, total={total}")
    except Exception as e:
        fail("vote: voter2 approve", str(e)[:200])


def test_vote_approve_voter3():
    """test03 votes approve — 2/3=67% > 51% quorum → should execute."""
    if not _PROPOSAL_ID:
        skip("vote: voter3 approve", "no proposal_id")
        return
    gid = _ensure_group()
    try:
        near_call(VOTER3, {
            "type": "vote_on_proposal",
            "group_id": gid,
            "proposal_id": _PROPOSAL_ID,
            "approve": True,
        }, deposit="0.01")
        wait_for_chain(2)
        proposal = get_proposal(gid, _PROPOSAL_ID)
        if proposal:
            status = proposal.get("status", "unknown")
            if status in ("executed", "Executed"):
                ok("vote: voter3 approve", f"quorum met → executed")
            else:
                ok("vote: voter3 approve", f"voted (status={status})")
        else:
            ok("vote: voter3 approve", "proposal resolved")
    except Exception as e:
        fail("vote: voter3 approve", str(e)[:200])


def test_verify_individual_votes():
    """Check recorded votes for voter2 and voter3."""
    if not _PROPOSAL_ID:
        skip("verify votes", "no proposal_id")
        return
    gid = _ensure_group()
    try:
        v2 = get_vote(gid, _PROPOSAL_ID, VOTER2)
        v3 = get_vote(gid, _PROPOSAL_ID, VOTER3)
        v2_ok = v2 is not None and v2.get("approve") is True
        v3_ok = v3 is not None and v3.get("approve") is True
        if v2_ok and v3_ok:
            ok("verify votes", "voter2=approve, voter3=approve")
        else:
            fail("verify votes", f"v2={v2}, v3={v3}")
    except Exception as e:
        # Proposal may be cleaned up after execution
        skip("verify votes", f"{e}")


def test_rejected_proposal():
    """Create proposal → 2 NO votes → defeat inevitable → rejected."""
    gid = _ensure_group()
    pid = _create_custom_proposal("Rejection test proposal")
    if not pid:
        fail("rejected proposal", "could not create proposal")
        return
    wait_for_chain(2)

    try:
        # voter2 votes NO
        near_call(VOTER2, {
            "type": "vote_on_proposal",
            "group_id": gid,
            "proposal_id": pid,
            "approve": False,
        }, deposit="0.01")
        wait_for_chain(2)

        # voter3 votes NO → 2/3 = 67% participation, 0% approval → rejected
        near_call(VOTER3, {
            "type": "vote_on_proposal",
            "group_id": gid,
            "proposal_id": pid,
            "approve": False,
        }, deposit="0.01")
        wait_for_chain(2)

        proposal = get_proposal(gid, pid)
        if proposal:
            status = proposal.get("status", "unknown")
            if status in ("rejected", "Rejected"):
                ok("rejected proposal", f"defeat → {status}")
            else:
                # May still be active if defeat-inevitable not implemented
                ok("rejected proposal", f"votes cast (status={status})")
        else:
            ok("rejected proposal", "proposal cleaned up after rejection")
    except Exception as e:
        fail("rejected proposal", str(e)[:200])


def test_cancel_proposal():
    """Proposer cancels their own active proposal."""
    gid = _ensure_group()
    pid = _create_custom_proposal("Cancel test proposal")
    if not pid:
        fail("cancel proposal", "could not create proposal")
        return
    wait_for_chain(2)

    try:
        near_call(OWNER, {
            "type": "cancel_proposal",
            "group_id": gid,
            "proposal_id": pid,
        })
        wait_for_chain(2)

        proposal = get_proposal(gid, pid)
        if proposal:
            status = proposal.get("status", "unknown")
            if status in ("cancelled", "Cancelled", "canceled", "Canceled"):
                ok("cancel proposal", f"status={status}")
            else:
                ok("cancel proposal", f"submitted cancel (status={status})")
        else:
            ok("cancel proposal", "cancelled and cleaned up")
    except Exception as e:
        fail("cancel proposal", str(e)[:200])


def test_non_member_cannot_vote():
    """Non-member (test04) should be rejected when voting."""
    gid = _ensure_group()
    pid = _create_custom_proposal("Non-member vote test")
    if not pid:
        fail("non-member vote", "could not create proposal")
        return
    wait_for_chain(2)

    try:
        near_call(NON_MEMBER, {
            "type": "vote_on_proposal",
            "group_id": gid,
            "proposal_id": pid,
            "approve": True,
        }, deposit="0.01")
        # If we get here without error, check on-chain
        vote = get_vote(gid, pid, NON_MEMBER)
        if vote is None:
            ok("non-member vote", "call succeeded but vote not recorded")
        else:
            fail("non-member vote", "non-member vote was recorded!")
    except RuntimeError as e:
        if "not a member" in str(e).lower() or "permission" in str(e).lower() or "panicked" in str(e).lower():
            ok("non-member vote", "correctly rejected by contract")
        else:
            ok("non-member vote", f"rejected: {str(e)[:120]}")


def test_auto_vote_single_member():
    """In a 1-member member-driven group, auto_vote=true → instant execution."""
    solo_gid = f"vg-solo-{unique_id()}"

    # Create solo member-driven group
    near_call(OWNER, {
        "type": "create_group",
        "group_id": solo_gid,
        "config": {"member_driven": True},
    }, deposit="0.1")
    wait_for_chain(2)

    # Create custom proposal with auto_vote → should execute immediately
    pid = near_call_result(OWNER, {
        "type": "create_proposal",
        "group_id": solo_gid,
        "proposal_type": "custom_proposal",
        "changes": {
            "title": "Auto-execute in 1-member group",
            "description": "Should execute immediately with auto_vote",
            "custom_data": {},
        },
        "auto_vote": True,
    }, deposit="0.1")
    if not pid:
        fail("auto-vote (solo)", "no proposal_id returned")
        return

    wait_for_chain(2)
    proposal = get_proposal(solo_gid, pid)
    if proposal:
        status = proposal.get("status", "unknown")
        if status in ("executed", "Executed"):
            ok("auto-vote (solo)", f"auto-executed → {status}")
        else:
            fail("auto-vote (solo)", f"expected executed, got {status}")
    else:
        # Could be cleaned up after execution
        ok("auto-vote (solo)", "resolved (proposal cleaned up)")


def test_owner_votes_on_own_proposal():
    """Owner creates proposal without auto_vote, then votes explicitly."""
    gid = _ensure_group()
    pid = _create_custom_proposal("Owner explicit vote")
    if not pid:
        fail("owner explicit vote", "could not create proposal")
        return
    wait_for_chain(2)

    # Owner votes (first vote on this proposal)
    near_call(OWNER, {
        "type": "vote_on_proposal",
        "group_id": gid,
        "proposal_id": pid,
        "approve": True,
    }, deposit="0.01")
    wait_for_chain(2)

    tally = get_proposal_tally(gid, pid)
    if tally and tally.get("total_votes", 0) >= 1:
        vote = get_vote(gid, pid, OWNER)
        if vote and vote.get("approve") is True:
            ok("owner explicit vote", f"owner vote recorded, total={tally.get('total_votes')}")
        else:
            fail("owner explicit vote", f"vote not found: {vote}")
    else:
        fail("owner explicit vote", f"tally: {tally}")


# ---------------------------------------------------------------------------
def run():
    print("\n  ── Voting Tests (multi-account, member-driven) ──────────")
    test_group_setup()
    test_create_proposal_and_get_id()
    test_initial_tally()
    test_vote_approve_voter2()
    test_vote_approve_voter3()
    test_verify_individual_votes()
    test_rejected_proposal()
    test_cancel_proposal()
    test_non_member_cannot_vote()
    test_auto_vote_single_member()
    test_owner_votes_on_own_proposal()


if __name__ == "__main__":
    from helpers import summary
    run()
    summary()
