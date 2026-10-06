import { describe, expect, it } from 'vitest';
import {
  buildNetworkAccountsOrdered,
  centerMoodFromConfig,
  markEndorsedAccounts,
  NETWORK_GRAPH_MAX_MAP_NODES,
  NETWORK_GRAPH_RING_CAP,
  networkFilterCounts,
  networkFilterToStandKind,
  networkUniqueConnectionTotal,
  parseNetworkFilter,
  rankNetworkSources,
  type NetworkAccountSource,
} from './profile-network';

function source(accountId: string): NetworkAccountSource {
  return { accountId, name: null, avatarUrl: null };
}

describe('parseNetworkFilter', () => {
  it('accepts the three relationship kinds', () => {
    expect(parseNetworkFilter('mutual')).toBe('mutual');
    expect(parseNetworkFilter('incoming')).toBe('incoming');
    expect(parseNetworkFilter('outgoing')).toBe('outgoing');
  });

  it('falls back to all for missing or unknown values', () => {
    expect(parseNetworkFilter(undefined)).toBe('all');
    expect(parseNetworkFilter(null)).toBe('all');
    expect(parseNetworkFilter('')).toBe('all');
    expect(parseNetworkFilter('everything')).toBe('all');
  });
});

describe('buildNetworkAccountsOrdered', () => {
  it('orders mutual, then incoming, then outgoing', () => {
    const accounts = buildNetworkAccountsOrdered(
      [source('m1.testnet')],
      [source('i1.testnet')],
      [source('o1.testnet')]
    );
    expect(accounts.map((a) => a.accountId)).toEqual([
      'm1.testnet',
      'i1.testnet',
      'o1.testnet',
    ]);
    expect(accounts.map((a) => a.kind)).toEqual([
      'mutual',
      'incoming',
      'outgoing',
    ]);
  });

  it('dedupes across directions keeping the strongest kind', () => {
    const accounts = buildNetworkAccountsOrdered(
      [source('shared.testnet')],
      [source('shared.testnet'), source('i1.testnet')],
      [source('shared.testnet'), source('i1.testnet')]
    );
    expect(accounts.map((a) => a.accountId)).toEqual([
      'shared.testnet',
      'i1.testnet',
    ]);
    expect(accounts[0]?.kind).toBe('mutual');
    expect(accounts[1]?.kind).toBe('incoming');
  });
});

describe('rankNetworkSources', () => {
  const noTiers = {
    viewerKnownIds: new Set<string>(),
    endorsedIds: new Set<string>(),
  };

  it('keeps recency order when no tiers match', () => {
    const ranked = rankNetworkSources(
      [source('a.testnet'), source('b.testnet'), source('c.testnet')],
      noTiers
    );
    expect(ranked.map((s) => s.accountId)).toEqual([
      'a.testnet',
      'b.testnet',
      'c.testnet',
    ]);
  });

  it('leads with viewer-known, then endorsed, then recency', () => {
    const ranked = rankNetworkSources(
      [
        source('new1.testnet'),
        source('endorsed1.testnet'),
        source('new2.testnet'),
        source('known1.testnet'),
        source('endorsed2.testnet'),
      ],
      {
        viewerKnownIds: new Set(['known1.testnet']),
        endorsedIds: new Set(['endorsed1.testnet', 'endorsed2.testnet']),
      }
    );
    expect(ranked.map((s) => s.accountId)).toEqual([
      'known1.testnet',
      'endorsed1.testnet',
      'endorsed2.testnet',
      'new1.testnet',
      'new2.testnet',
    ]);
  });

  it('dedupes tier lists concatenated with the sample, first wins', () => {
    const ranked = rankNetworkSources(
      [
        source('known1.testnet'), // viewer-known intersection row
        source('endorsed1.testnet'), // endorsed intersection row
        source('new1.testnet'),
        source('endorsed1.testnet'), // also present in the recency sample
        source('known1.testnet'),
      ],
      {
        viewerKnownIds: new Set(['known1.testnet']),
        endorsedIds: new Set(['endorsed1.testnet']),
      }
    );
    expect(ranked.map((s) => s.accountId)).toEqual([
      'known1.testnet',
      'endorsed1.testnet',
      'new1.testnet',
    ]);
  });

  it('ranks a viewer-known + endorsed account in the known tier', () => {
    const ranked = rankNetworkSources(
      [source('new1.testnet'), source('both.testnet')],
      {
        viewerKnownIds: new Set(['both.testnet']),
        endorsedIds: new Set(['both.testnet']),
      }
    );
    expect(ranked.map((s) => s.accountId)).toEqual([
      'both.testnet',
      'new1.testnet',
    ]);
  });
});

describe('markEndorsedAccounts', () => {
  it('flags only accounts in the endorsed set', () => {
    const accounts = buildNetworkAccountsOrdered(
      [source('m1.testnet')],
      [source('i1.testnet')],
      [source('o1.testnet')]
    );
    const marked = markEndorsedAccounts(
      accounts,
      new Set(['i1.testnet', 'ghost.testnet'])
    );
    expect(marked.map((a) => a.endorsed ?? false)).toEqual([
      false,
      true,
      false,
    ]);
  });

  it('returns the same array when nothing is endorsed', () => {
    const accounts = buildNetworkAccountsOrdered(
      [source('m1.testnet')],
      [],
      []
    );
    expect(markEndorsedAccounts(accounts, new Set())).toBe(accounts);
  });
});

describe('network counts', () => {
  it('counts unique connections with mutual counted once', () => {
    expect(
      networkUniqueConnectionTotal({ incoming: 5, outgoing: 4, mutual: 2 })
    ).toBe(7);
    expect(
      networkUniqueConnectionTotal({ incoming: 1, outgoing: 1, mutual: 3 })
    ).toBe(0);
  });

  it('builds filter counts including all', () => {
    expect(
      networkFilterCounts({ incoming: 5, outgoing: 4, mutual: 2 })
    ).toEqual({ all: 7, mutual: 2, incoming: 5, outgoing: 4 });
  });

  it('maps orbit filters to standing list kinds', () => {
    expect(networkFilterToStandKind('all')).toBe('incoming');
    expect(networkFilterToStandKind('incoming')).toBe('incoming');
    expect(networkFilterToStandKind('outgoing')).toBe('outgoing');
    expect(networkFilterToStandKind('mutual')).toBe('mutual');
  });
});

describe('graph caps', () => {
  it('max map nodes equals the ring cap sum', () => {
    expect(NETWORK_GRAPH_MAX_MAP_NODES).toBe(
      NETWORK_GRAPH_RING_CAP.mutual +
        NETWORK_GRAPH_RING_CAP.incoming +
        NETWORK_GRAPH_RING_CAP.outgoing
    );
  });
});

describe('centerMoodFromConfig', () => {
  it('returns null without a mood record', () => {
    expect(centerMoodFromConfig(null)).toBeNull();
    expect(centerMoodFromConfig(undefined)).toBeNull();
    expect(centerMoodFromConfig({})).toBeNull();
    expect(centerMoodFromConfig({ mood: { id: '' } })).toBeNull();
  });

  it('returns null for the default protocol mood (hash identity stays)', () => {
    expect(centerMoodFromConfig({ mood: { id: 'protocol' } })).toBeNull();
  });

  it('resolves the preset accent for a chosen mood', () => {
    const mood = centerMoodFromConfig({ mood: { id: 'creative' } });
    expect(mood).not.toBeNull();
    expect(mood?.accent).toContain('186');
    expect(mood?.accentLight).toBeTruthy();
  });

  it('prefers stored per-mood ink tints over the catalog accent', () => {
    const base = centerMoodFromConfig({ mood: { id: 'creative' } });
    const tinted = centerMoodFromConfig({
      mood: { id: 'creative' },
      theme: { moodTints: { creative: 120 } },
    });
    expect(base).not.toBeNull();
    expect(tinted).not.toBeNull();
    expect(tinted?.accent).not.toBe(base?.accent);
  });
});
