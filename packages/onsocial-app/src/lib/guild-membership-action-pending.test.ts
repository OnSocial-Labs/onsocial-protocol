import { describe, expect, it, beforeEach } from 'vitest';
import {
  clearGuildMembershipActionPendingForTests,
  getGuildMembershipActionPending,
  setGuildMembershipActionPending,
} from '@/lib/guild-membership-action-pending';

describe('guild-membership-action-pending', () => {
  beforeEach(() => {
    clearGuildMembershipActionPendingForTests();
  });

  it('tracks in-flight join pending per account + guild', () => {
    expect(getGuildMembershipActionPending('alice.testnet', 'guild-1')).toBe(
      false
    );
    setGuildMembershipActionPending('alice.testnet', 'guild-1', true);
    expect(getGuildMembershipActionPending('alice.testnet', 'guild-1')).toBe(
      true
    );
    expect(getGuildMembershipActionPending('bob.testnet', 'guild-1')).toBe(
      false
    );
    setGuildMembershipActionPending('alice.testnet', 'guild-1', false);
    expect(getGuildMembershipActionPending('alice.testnet', 'guild-1')).toBe(
      false
    );
  });
});
