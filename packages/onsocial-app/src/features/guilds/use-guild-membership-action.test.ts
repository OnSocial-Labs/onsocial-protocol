import { describe, expect, it, vi } from 'vitest';
import {
  guildMembershipOutcome,
  nextGuildMembershipCache,
  requestGuildMembershipChange,
} from '@/features/guilds/guild-membership-action';

describe('guildMembershipOutcome', () => {
  it('maps leave / cancel / request / join', () => {
    expect(
      guildMembershipOutcome({
        wasMember: true,
        wasJoinPending: false,
        accessGated: false,
      })
    ).toBe('left');
    expect(
      guildMembershipOutcome({
        wasMember: false,
        wasJoinPending: true,
        accessGated: true,
      })
    ).toBe('canceled');
    expect(
      guildMembershipOutcome({
        wasMember: false,
        wasJoinPending: false,
        accessGated: true,
      })
    ).toBe('requested');
    expect(
      guildMembershipOutcome({
        wasMember: false,
        wasJoinPending: false,
        accessGated: false,
      })
    ).toBe('joined');
  });
});

describe('nextGuildMembershipCache', () => {
  it('clears membership after leave or cancel', () => {
    expect(
      nextGuildMembershipCache({
        wasMember: true,
        wasJoinPending: false,
        accessGated: false,
      })
    ).toEqual({ isMember: false, joinPending: false });
    expect(
      nextGuildMembershipCache({
        wasMember: false,
        wasJoinPending: true,
        accessGated: true,
      })
    ).toEqual({ isMember: false, joinPending: false });
  });

  it('writes joined or requested after a successful join', () => {
    expect(
      nextGuildMembershipCache({
        wasMember: false,
        wasJoinPending: false,
        accessGated: false,
      })
    ).toEqual({ isMember: true, joinPending: false });
    expect(
      nextGuildMembershipCache({
        wasMember: false,
        wasJoinPending: false,
        accessGated: true,
      })
    ).toEqual({ isMember: false, joinPending: true });
  });
});

describe('requestGuildMembershipChange', () => {
  it('routes leave, cancel proposal, cancel join, and join', async () => {
    const leave = vi.fn().mockResolvedValue({ ok: true });
    const cancelProposal = vi.fn().mockResolvedValue({ ok: true });
    const cancelJoin = vi.fn().mockResolvedValue({ ok: true });
    const join = vi.fn().mockResolvedValue({ ok: true });
    const client = {
      groups: { leave, cancelProposal, cancelJoin, join },
    } as never;

    await requestGuildMembershipChange(client, {
      groupId: 'g1',
      isMember: true,
      joinPending: false,
      memberDriven: false,
      pendingJoinProposalId: null,
    });
    expect(leave).toHaveBeenCalledWith('g1');

    await requestGuildMembershipChange(client, {
      groupId: 'g1',
      isMember: false,
      joinPending: true,
      memberDriven: true,
      pendingJoinProposalId: 'p1',
    });
    expect(cancelProposal).toHaveBeenCalledWith('g1', 'p1');

    await requestGuildMembershipChange(client, {
      groupId: 'g1',
      isMember: false,
      joinPending: true,
      memberDriven: false,
      pendingJoinProposalId: null,
    });
    expect(cancelJoin).toHaveBeenCalledWith('g1');

    await requestGuildMembershipChange(client, {
      groupId: 'g1',
      isMember: false,
      joinPending: false,
      memberDriven: false,
      pendingJoinProposalId: null,
    });
    expect(join).toHaveBeenCalledWith('g1');
  });
});
