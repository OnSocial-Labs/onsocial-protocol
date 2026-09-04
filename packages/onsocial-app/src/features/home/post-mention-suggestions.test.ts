import { describe, expect, it, vi } from 'vitest';
import {
  loadMentionSuggestions,
  MENTION_SUGGEST_LIMIT,
} from '@/features/home/post-mention-suggestions';
import type { OnSocial, ProfileSearchRow } from '@onsocial/sdk';

function row(accountId: string, name: string | null = null): ProfileSearchRow {
  return {
    accountId,
    name,
    bio: null,
    avatar: null,
    banner: null,
    standingCount: 0,
    standingWithCount: 0,
    mutualStandingCount: 0,
    endorsementsReceivedCount: 0,
    endorsementsGivenCount: 0,
    firstProfileTimestamp: null,
    lastProfileBlock: 0,
    lastProfileTimestamp: 0,
    lastActivityBlock: 0,
  };
}

function mockClient(args: {
  search?: ProfileSearchRow[];
  standingIds?: string[];
  standingProfiles?: ProfileSearchRow[];
}): OnSocial {
  return {
    query: {
      profiles: {
        search: vi.fn().mockResolvedValue(args.search ?? []),
        statsForAccounts: vi
          .fn()
          .mockResolvedValue(args.standingProfiles ?? []),
      },
      standings: {
        outgoing: vi.fn().mockResolvedValue(args.standingIds ?? []),
      },
    },
  } as unknown as OnSocial;
}

describe('loadMentionSuggestions', () => {
  it('ranks people the viewer stands with first', async () => {
    const client = mockClient({
      standingIds: ['bob.testnet', 'carol.testnet'],
      standingProfiles: [row('carol.testnet', 'Carol'), row('bob.testnet', 'Bob')],
      search: [row('dave.testnet', 'Dave'), row('bob.testnet', 'Bob')],
    });

    const rows = await loadMentionSuggestions(client, '', 'alice.testnet');
    expect(rows.map((r) => r.accountId)).toEqual([
      'bob.testnet',
      'carol.testnet',
      'dave.testnet',
    ]);
  });

  it('filters standings and search by query and caps at the suggest limit', async () => {
    const standingIds = Array.from(
      { length: MENTION_SUGGEST_LIMIT + 2 },
      (_, i) => `stand${i}.testnet`
    );
    const client = mockClient({
      standingIds,
      standingProfiles: standingIds.map((id) => row(id)),
      search: [row('other.testnet'), row('stand0.testnet')],
    });

    const rows = await loadMentionSuggestions(client, 'stand', 'alice.testnet');
    expect(rows).toHaveLength(MENTION_SUGGEST_LIMIT);
    expect(rows.every((r) => r.accountId.startsWith('stand'))).toBe(true);
    expect(rows[0]?.accountId).toBe('stand0.testnet');
  });

  it('pins reply/quote author above standings and search', async () => {
    const client = mockClient({
      standingIds: ['bob.testnet'],
      standingProfiles: [row('bob.testnet', 'Bob')],
      search: [row('dave.testnet', 'Dave')],
    });

    const rows = await loadMentionSuggestions(client, '', 'alice.testnet', [
      { accountId: 'carol.testnet', name: 'Carol' },
    ]);
    expect(rows.map((r) => r.accountId)).toEqual([
      'carol.testnet',
      'bob.testnet',
      'dave.testnet',
    ]);
  });

  it('falls back to search when viewer is logged out', async () => {
    const client = mockClient({
      search: [row('bob.testnet')],
    });
    const rows = await loadMentionSuggestions(client, 'bob', null);
    expect(rows.map((r) => r.accountId)).toEqual(['bob.testnet']);
    expect(client.query.standings.outgoing).not.toHaveBeenCalled();
  });
});
