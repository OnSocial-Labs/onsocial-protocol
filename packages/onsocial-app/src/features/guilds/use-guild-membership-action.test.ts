import { describe, expect, it, vi } from 'vitest';
import {
  guildMembershipConfirmCopy,
  guildMembershipConfirmKind,
  guildMembershipOutcome,
  nextGuildMembershipCache,
  requestGuildMembershipChange,
} from '@/features/guilds/guild-membership-action';

const snapshot = {
  isMember: false,
  joinPending: false,
  isOwner: false,
  isBlacklisted: false,
  accessGated: false,
  memberDriven: false,
  pendingJoinProposalId: null,
  joinCancelReady: false,
};

describe('guildMembershipConfirmKind', () => {
  it('opens join, request, cancel, or leave before a wallet step', () => {
    expect(guildMembershipConfirmKind(snapshot)).toBe('join');
    expect(guildMembershipConfirmKind({ ...snapshot, accessGated: true })).toBe(
      'request'
    );
    expect(
      guildMembershipConfirmKind({ ...snapshot, memberDriven: true })
    ).toBe('propose');
    expect(
      guildMembershipConfirmKind({
        ...snapshot,
        accessGated: true,
        memberDriven: true,
      })
    ).toBe('propose');
    expect(
      guildMembershipConfirmKind({
        ...snapshot,
        joinPending: true,
        joinCancelReady: true,
      })
    ).toBe('cancel');
    expect(
      guildMembershipConfirmKind({
        ...snapshot,
        memberDriven: true,
        joinPending: true,
        joinCancelReady: true,
      })
    ).toBe('cancel-proposal');
    expect(guildMembershipConfirmKind({ ...snapshot, isMember: true })).toBe(
      'leave'
    );
    expect(
      guildMembershipConfirmKind({
        ...snapshot,
        isMember: true,
        isOwner: true,
      })
    ).toBe('owner');
    expect(
      guildMembershipConfirmKind({ ...snapshot, isBlacklisted: true })
    ).toBeNull();
  });
});

describe('guildMembershipConfirmCopy', () => {
  it('names the action in the title and leaves the body to consequences elsewhere', () => {
    expect(guildMembershipConfirmCopy('join')).toEqual({
      label: 'Join',
      confirmLabel: 'Join',
      pendingLabel: 'Joining…',
      variant: 'primary',
    });
    expect(guildMembershipConfirmCopy('leave').variant).toBe('danger');
    expect(guildMembershipConfirmCopy('request')).toEqual({
      label: 'Ask to join',
      confirmLabel: 'Ask to join',
      pendingLabel: 'Asking…',
      variant: 'primary',
    });
    expect(guildMembershipConfirmCopy('propose')).toEqual({
      label: 'Propose to join',
      confirmLabel: 'Propose to join',
      pendingLabel: 'Proposing…',
      variant: 'primary',
    });
    expect(guildMembershipConfirmCopy('cancel')).toMatchObject({
      label: 'Cancel request',
      confirmLabel: 'Cancel request',
    });
    expect(guildMembershipConfirmCopy('cancel-proposal')).toMatchObject({
      label: 'Cancel proposal',
      confirmLabel: 'Cancel proposal',
      variant: 'danger',
    });
    expect(guildMembershipConfirmCopy('request')).not.toHaveProperty('body');
    expect(guildMembershipConfirmCopy('propose')).not.toHaveProperty('body');
  });
});

describe('guildMembershipOutcome', () => {
  it('maps leave / cancel / request / join', () => {
    expect(
      guildMembershipOutcome({
        wasMember: true,
        wasJoinPending: false,
        accessGated: false,
        memberDriven: false,
      })
    ).toBe('left');
    expect(
      guildMembershipOutcome({
        wasMember: false,
        wasJoinPending: true,
        accessGated: true,
        memberDriven: false,
      })
    ).toBe('canceled');
    expect(
      guildMembershipOutcome({
        wasMember: false,
        wasJoinPending: false,
        accessGated: true,
        memberDriven: false,
      })
    ).toBe('requested');
    expect(
      guildMembershipOutcome({
        wasMember: false,
        wasJoinPending: false,
        accessGated: false,
        memberDriven: false,
      })
    ).toBe('joined');
    expect(
      guildMembershipOutcome({
        wasMember: false,
        wasJoinPending: false,
        accessGated: false,
        memberDriven: true,
      })
    ).toBe('proposed');
    expect(
      guildMembershipOutcome({
        wasMember: false,
        wasJoinPending: false,
        accessGated: true,
        memberDriven: true,
      })
    ).toBe('proposed');
  });
});

describe('nextGuildMembershipCache', () => {
  it('clears membership after leave or cancel', () => {
    expect(
      nextGuildMembershipCache({
        wasMember: true,
        wasJoinPending: false,
        accessGated: false,
        memberDriven: false,
      })
    ).toEqual({ isMember: false, joinPending: false });
    expect(
      nextGuildMembershipCache({
        wasMember: false,
        wasJoinPending: true,
        accessGated: true,
        memberDriven: false,
      })
    ).toEqual({ isMember: false, joinPending: false });
  });

  it('writes joined, requested, or proposed after a successful join', () => {
    expect(
      nextGuildMembershipCache({
        wasMember: false,
        wasJoinPending: false,
        accessGated: false,
        memberDriven: false,
      })
    ).toEqual({ isMember: true, joinPending: false });
    expect(
      nextGuildMembershipCache({
        wasMember: false,
        wasJoinPending: false,
        accessGated: true,
        memberDriven: false,
      })
    ).toEqual({ isMember: false, joinPending: true });
    expect(
      nextGuildMembershipCache({
        wasMember: false,
        wasJoinPending: false,
        accessGated: false,
        memberDriven: true,
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
