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
    writeDaoFeedCache('dao.sputnik-dao.near', sampleFeed('dao.sputnik-dao.near'));
    writeDaoTreasuryCache('dao.sputnik-dao.near', {
      assets: [],
      supportYocto: '1000',
    });

    expect(readDaoFeedCache('dao.sputnik-dao.near')?.daoPolicy?.roles?.[0]?.name).toBe(
      'council'
    );
    expect(readDaoTreasuryCache('DAO.sputnik-dao.near')?.supportYocto).toBe(
      '1000'
    );
  });

  it('expires feed after TTL', () => {
    vi.useFakeTimers();
    writeDaoFeedCache('dao.sputnik-dao.near', sampleFeed('dao.sputnik-dao.near'));
    expect(readDaoFeedCache('dao.sputnik-dao.near')).not.toBeNull();
    vi.advanceTimersByTime(DAO_WORKSPACE_FEED_TTL_MS + 1);
    expect(readDaoFeedCache('dao.sputnik-dao.near')).toBeNull();
  });

  it('ignores invalid dao ids', () => {
    writeDaoFeedCache('!!!', sampleFeed('!!!'));
    expect(readDaoFeedCache('!!!')).toBeNull();
  });

  it('invalidate clears feed and treasury', () => {
    writeDaoFeedCache('dao.sputnik-dao.near', sampleFeed('dao.sputnik-dao.near'));
    writeDaoTreasuryCache('dao.sputnik-dao.near', {
      assets: [],
      supportYocto: '1',
    });
    invalidateDaoWorkspaceCache('dao.sputnik-dao.near');
    expect(readDaoFeedCache('dao.sputnik-dao.near')).toBeNull();
    expect(readDaoTreasuryCache('dao.sputnik-dao.near')).toBeNull();
  });

  it('bump clears cache immediately', () => {
    writeDaoFeedCache('dao.sputnik-dao.near', sampleFeed('dao.sputnik-dao.near'));
    const cancel = bumpDaoWorkspacePrefetch('dao.sputnik-dao.near');
    expect(readDaoFeedCache('dao.sputnik-dao.near')).toBeNull();
    cancel();
  });
});
