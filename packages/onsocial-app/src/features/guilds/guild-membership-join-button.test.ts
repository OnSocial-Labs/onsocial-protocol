import { describe, expect, it } from 'vitest';
import {
  guildMembershipJoinLabel,
  guildMembershipJoinPendingLabel,
} from '@/features/guilds/guild-membership-join-button';

const idle = {
  isConnected: true,
  accessGated: false,
  joinPending: false,
};

describe('guildMembershipJoinLabel', () => {
  it('uses the same verbs as the confirm drawer', () => {
    expect(guildMembershipJoinLabel(idle)).toBe('Join');
    expect(guildMembershipJoinLabel({ ...idle, accessGated: true })).toBe(
      'Ask to join'
    );
    expect(guildMembershipJoinLabel({ ...idle, memberDriven: true })).toBe(
      'Propose to join'
    );
    expect(
      guildMembershipJoinLabel({
        ...idle,
        accessGated: true,
        memberDriven: true,
      })
    ).toBe('Propose to join');
    expect(
      guildMembershipJoinLabel({
        ...idle,
        joinPending: true,
        joinCancelReady: true,
      })
    ).toBe('Cancel request');
    expect(
      guildMembershipJoinLabel({
        ...idle,
        memberDriven: true,
        joinPending: true,
        joinCancelReady: true,
      })
    ).toBe('Cancel proposal');
  });
});

describe('guildMembershipJoinPendingLabel', () => {
  it('uses the drawer pending words while the wallet step runs', () => {
    expect(guildMembershipJoinPendingLabel({ accessGated: false })).toBe(
      'Joining…'
    );
    expect(guildMembershipJoinPendingLabel({ accessGated: true })).toBe(
      'Asking…'
    );
    expect(
      guildMembershipJoinPendingLabel({ accessGated: true, memberDriven: true })
    ).toBe('Proposing…');
    expect(
      guildMembershipJoinPendingLabel({ accessGated: false, leaving: true })
    ).toBe('Leaving…');
    expect(
      guildMembershipJoinPendingLabel({ accessGated: true, canceling: true })
    ).toBe('Canceling…');
  });
});
