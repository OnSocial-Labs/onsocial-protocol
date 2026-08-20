import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearDaoWorkspacePrefetchCaches,
  DAO_WORKSPACE_FEED_TTL_MS,
  readDaoFeedCache,
  readDaoTreasuryCache,
  writeDaoFeedCache,
  writeDaoTreasuryCache,
} from '@/lib/dao-workspace-prefetch';
import type { ProtocolFeedResponse } from '@/features/protocol/types';

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
});
