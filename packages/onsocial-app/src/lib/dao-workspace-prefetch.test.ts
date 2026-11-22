import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  bumpDaoWorkspacePrefetch,
  clearDaoWorkspacePrefetchCaches,
  DAO_WORKSPACE_FEED_TTL_MS,
  invalidateDaoWorkspaceCache,
  readDaoFeedCache,
  readDaoTreasuryCache,
  writeDaoFeedCache,
  writeDaoTreasuryCache,
} from '@/lib/dao-workspace-prefetch';
import type { ProtocolFeedResponse } from '@/features/protocol/types';

vi.mock('@/features/protocol/protocol-feed-client', () => ({
  fetchProtocolFeed: vi.fn(() =>
    Promise.resolve({
      applications: [],
      daoPolicy: null,
      daoAccountId: 'dao.sputnik-dao.near',
      syncing: false,
    })
  ),
}));
vi.mock('@/features/protocol/protocol-dao-context-client', () => ({
  fetchProtocolDaoTransferAssets: vi.fn(() => Promise.resolve([])),
}));
vi.mock('@/lib/social-spend-profile', () => ({
  fetchProfileSupportBalanceYocto: vi.fn(() => Promise.resolve(0n)),
}));

const sampleFeed = (dao: string): ProtocolFeedResponse => ({
  applications: [],
  daoPolicy: { roles: [{ name: 'council', kind: { Group: ['a.near'] } }] },
  daoAccountId: dao,
  syncing: false,
});

describe('dao-workspace-prefetch cache', () => {
  afterEach(() => {
    clearDaoWorkspacePrefetchCaches();
    vi.useRealTimers();
  });

  it('reads back feed and treasury snapshots', () => {
    writeDaoFeedCache(
      'dao.sputnik-dao.near',
      sampleFeed('dao.sputnik-dao.near')
    );
    writeDaoTreasuryCache('dao.sputnik-dao.near', {
      assets: [],
      supportYocto: '1000',
    });

    expect(
      readDaoFeedCache('dao.sputnik-dao.near')?.daoPolicy?.roles?.[0]?.name
    ).toBe('council');
    expect(readDaoTreasuryCache('DAO.sputnik-dao.near')?.supportYocto).toBe(
      '1000'
    );
  });

  it('expires feed after TTL', () => {
    vi.useFakeTimers();
    writeDaoFeedCache(
      'dao.sputnik-dao.near',
      sampleFeed('dao.sputnik-dao.near')
    );
    expect(readDaoFeedCache('dao.sputnik-dao.near')).not.toBeNull();
    vi.advanceTimersByTime(DAO_WORKSPACE_FEED_TTL_MS + 1);
    expect(readDaoFeedCache('dao.sputnik-dao.near')).toBeNull();
  });

  it('ignores invalid dao ids', () => {
    writeDaoFeedCache('!!!', sampleFeed('!!!'));
    expect(readDaoFeedCache('!!!')).toBeNull();
  });

  it('invalidate clears feed and treasury', () => {
    writeDaoFeedCache(
      'dao.sputnik-dao.near',
      sampleFeed('dao.sputnik-dao.near')
    );
    writeDaoTreasuryCache('dao.sputnik-dao.near', {
      assets: [],
      supportYocto: '1',
    });
    invalidateDaoWorkspaceCache('dao.sputnik-dao.near');
    expect(readDaoFeedCache('dao.sputnik-dao.near')).toBeNull();
    expect(readDaoTreasuryCache('dao.sputnik-dao.near')).toBeNull();
  });

  it('bump clears cache immediately', () => {
    writeDaoFeedCache(
      'dao.sputnik-dao.near',
      sampleFeed('dao.sputnik-dao.near')
    );
    const cancel = bumpDaoWorkspacePrefetch('dao.sputnik-dao.near');
    expect(readDaoFeedCache('dao.sputnik-dao.near')).toBeNull();
    cancel();
  });

  it('evicts the oldest feed and treasury entries past the cap', async () => {
    const mod = await import('@/lib/dao-workspace-prefetch');
    const published = (mod as { DAO_WORKSPACE_CACHE_MAX?: number })
      .DAO_WORKSPACE_CACHE_MAX;
    const max = published ?? 24;
    if (published !== undefined) expect(published).toBe(24);

    for (let i = 0; i < max + 1; i += 1) {
      const id = `d${i}.near`;
      writeDaoFeedCache(id, sampleFeed(id));
      writeDaoTreasuryCache(id, { assets: [], supportYocto: String(i) });
    }
    expect(readDaoFeedCache('d0.near')).toBeNull();
    expect(readDaoTreasuryCache('d0.near')).toBeNull();
    expect(readDaoFeedCache(`d${max}.near`)?.daoAccountId).toBe(`d${max}.near`);
    expect(readDaoTreasuryCache(`d${max}.near`)?.supportYocto).toBe(
      String(max)
    );
  });

  it('does not refresh recency on read — the oldest write is evicted', () => {
    const max = 24;
    for (let i = 0; i < max; i += 1) {
      writeDaoFeedCache(`e${i}.near`, sampleFeed(`e${i}.near`));
    }
    expect(readDaoFeedCache('e0.near')).not.toBeNull();
    writeDaoFeedCache(`e${max}.near`, sampleFeed(`e${max}.near`));
    expect(readDaoFeedCache('e0.near')).toBeNull();
    expect(readDaoFeedCache('e1.near')?.daoAccountId).toBe('e1.near');
  });
});
