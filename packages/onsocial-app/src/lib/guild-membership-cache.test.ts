import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearGuildMembershipCacheForTests,
  GUILD_MEMBERSHIP_CACHE_MAX,
  readGuildMembershipCache,
  writeGuildMembershipCache,
} from './guild-membership-cache';

const entry = {
  isMember: true,
  joinPending: false,
};

describe('guildMembershipCache', () => {
  beforeEach(() => {
    clearGuildMembershipCacheForTests();
  });

  it('reads what it writes', () => {
    writeGuildMembershipCache('alice.near', 'dao', entry);
    expect(readGuildMembershipCache('alice.near', 'dao')).toEqual(entry);
  });

  it('keys by account and group', () => {
    writeGuildMembershipCache('alice.near', 'dao', entry);
    writeGuildMembershipCache('bob.near', 'dao', {
      isMember: false,
      joinPending: true,
    });
    expect(readGuildMembershipCache('alice.near', 'dao')?.isMember).toBe(true);
    expect(readGuildMembershipCache('bob.near', 'dao')).toEqual({
      isMember: false,
      joinPending: true,
    });
  });

  it('evicts oldest when over max', () => {
    for (let i = 0; i < GUILD_MEMBERSHIP_CACHE_MAX + 3; i += 1) {
      writeGuildMembershipCache('alice.near', `g${i}`, {
        isMember: i % 2 === 0,
        joinPending: false,
      });
    }
    const newest = GUILD_MEMBERSHIP_CACHE_MAX + 2;
    expect(readGuildMembershipCache('alice.near', 'g0')).toBeUndefined();
    expect(
      readGuildMembershipCache('alice.near', `g${newest}`)?.isMember
    ).toBe(newest % 2 === 0);
  });

  it('LRU refreshes on read so hot entries survive', () => {
    writeGuildMembershipCache('alice.near', 'hot', entry);
    for (let i = 0; i < GUILD_MEMBERSHIP_CACHE_MAX; i += 1) {
      expect(readGuildMembershipCache('alice.near', 'hot')?.isMember).toBe(
        true
      );
      writeGuildMembershipCache('alice.near', `c${i}`, {
        isMember: false,
        joinPending: false,
      });
    }
    expect(readGuildMembershipCache('alice.near', 'hot')?.isMember).toBe(true);
  });
});
