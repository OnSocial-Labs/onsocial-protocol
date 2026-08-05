import { describe, expect, it } from 'vitest';
import {
  albumTrackLovePathLike,
  countAlbumFans,
  deriveLovedStateFromLedger,
  nextFanCountAfterLoveToggle,
  recordTrackLove,
  scarceTrackContentPath,
  trackCidFromLovePostPath,
} from '@/lib/scarce-track-love';

describe('scarce track love paths', () => {
  it('builds a stable content path from collection + cid', () => {
    expect(scarceTrackContentPath('night-drive', 'bafk123')).toBe(
      'scarce/night-drive/track/bafk123'
    );
    expect(albumTrackLovePathLike('night-drive')).toBe(
      '%/scarce/night-drive/track/%'
    );
    expect(
      trackCidFromLovePostPath(
        'night-drive',
        'scarce/night-drive/track/bafk123'
      )
    ).toBe('bafk123');
  });
});

describe('countAlbumFans', () => {
  it('counts unique non-creator accounts', () => {
    expect(
      countAlbumFans(
        ['bob.near', 'carol.near', 'bob.near', 'alice.near'],
        'alice.near'
      )
    ).toBe(2);
  });
});

describe('nextFanCountAfterLoveToggle', () => {
  it('increments when the viewer loves their first track', () => {
    expect(
      nextFanCountAfterLoveToggle({
        fanCount: 3,
        creatorId: 'alice.near',
        viewerId: 'bob.near',
        viewerLovedCids: new Set(),
        targetCid: 'bafk1',
        nextLoved: true,
      })
    ).toBe(4);
  });

  it('does not double-count a second loved track', () => {
    expect(
      nextFanCountAfterLoveToggle({
        fanCount: 4,
        creatorId: 'alice.near',
        viewerId: 'bob.near',
        viewerLovedCids: new Set(['bafk1']),
        targetCid: 'bafk2',
        nextLoved: true,
      })
    ).toBe(4);
  });

  it('decrements when the viewer unloves their last track', () => {
    expect(
      nextFanCountAfterLoveToggle({
        fanCount: 4,
        creatorId: 'alice.near',
        viewerId: 'bob.near',
        viewerLovedCids: new Set(['bafk1']),
        targetCid: 'bafk1',
        nextLoved: false,
      })
    ).toBe(3);
  });

  it('keeps a confirmed love while the indexer lags', () => {
    const ledger = new Map<string, boolean>();
    recordTrackLove(ledger, 'bafk1', true);
    const derived = deriveLovedStateFromLedger({
      trackCids: ['bafk1', 'bafk2'],
      apiLoved: new Set(),
      apiCounts: { bafk1: 2, bafk2: 1 },
      apiFanCount: 4,
      ledger,
      creatorId: 'alice.near',
      viewerId: 'bob.near',
    });
    expect(derived.viewerLoved.has('bafk1')).toBe(true);
    expect(derived.counts.bafk1).toBe(3);
    expect(derived.fanCount).toBe(5);
    expect(derived.hasLedgerOverride).toBe(true);
  });

  it('drops the ledger once the indexer agrees', () => {
    const ledger = new Map<string, boolean>();
    recordTrackLove(ledger, 'bafk1', true);
    const derived = deriveLovedStateFromLedger({
      trackCids: ['bafk1'],
      apiLoved: new Set(['bafk1']),
      apiCounts: { bafk1: 3 },
      apiFanCount: 5,
      ledger,
      creatorId: 'alice.near',
      viewerId: 'bob.near',
    });
    expect(derived.viewerLoved.has('bafk1')).toBe(true);
    expect(derived.counts.bafk1).toBe(3);
    expect(derived.fanCount).toBe(5);
    expect(derived.hasLedgerOverride).toBe(false);
    expect(ledger.size).toBe(0);
  });

  it('ignores the creator', () => {
    expect(
      nextFanCountAfterLoveToggle({
        fanCount: 2,
        creatorId: 'alice.near',
        viewerId: 'alice.near',
        viewerLovedCids: new Set(),
        targetCid: 'bafk1',
        nextLoved: true,
      })
    ).toBe(2);
  });
});
