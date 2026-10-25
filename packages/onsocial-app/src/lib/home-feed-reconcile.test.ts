import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { PostRow } from '@onsocial/sdk';
import {
  HOME_FEED_RECONCILE_HEAD_ROWS,
  HOME_FEED_RECONCILE_MIN_AGE_MS,
  reconcileFeedRows,
  selectFeedReconcileTargets,
  type FeedReconcileTarget,
} from '@/lib/home-feed-reconcile';

const NOW = 1_700_000_000_000; // ms epoch — resolvePostDate treats >1e11 as ms

function row(
  accountId: string,
  postId: string,
  extra: Partial<PostRow> = {}
): PostRow {
  return {
    accountId,
    postId,
    value: '{"text":"hi"}',
    blockHeight: 100,
    blockTimestamp: NOW - 10 * 60 * 1000,
    ...extra,
  };
}

function targetOf(post: PostRow): FeedReconcileTarget {
  return {
    key: `${post.accountId}:${post.postId}`,
    accountId: post.accountId,
    postId: post.postId,
  };
}

describe('selectFeedReconcileTargets', () => {
  it('takes the head window only', () => {
    const posts = Array.from({ length: 20 }, (_, index) =>
      row('a.near', String(index))
    );
    const targets = selectFeedReconcileTargets(posts, NOW);
    expect(targets).toHaveLength(HOME_FEED_RECONCILE_HEAD_ROWS);
    expect(targets[0]?.postId).toBe('0');
    expect(targets.at(-1)?.postId).toBe(
      String(HOME_FEED_RECONCILE_HEAD_ROWS - 1)
    );
  });

  it('sits out rows too fresh to trust the indexer about', () => {
    const fresh = row('a.near', 'new', { blockTimestamp: NOW - 1_000 });
    const old = row('b.near', 'old', {
      blockTimestamp: NOW - HOME_FEED_RECONCILE_MIN_AGE_MS - 1_000,
    });
    const targets = selectFeedReconcileTargets([fresh, old], NOW);
    expect(targets.map((target) => target.postId)).toEqual(['old']);
  });

  it('includes rows whose timestamp cannot be parsed', () => {
    const undated = row('a.near', 'undated', { blockTimestamp: 0 });
    const targets = selectFeedReconcileTargets([undated], NOW);
    expect(targets).toHaveLength(1);
  });
});

describe('reconcileFeedRows', () => {
  it('removes targets missing upstream (deletions)', () => {
    const deleted = row('a.near', '1');
    const kept = row('b.near', '2');
    const { next, removedKeys, updatedKeys } = reconcileFeedRows(
      [deleted, kept],
      [kept],
      [targetOf(deleted), targetOf(kept)]
    );
    expect(next.map((post) => post.postId)).toEqual(['2']);
    expect(removedKeys).toEqual(['a.near:1']);
    expect(updatedKeys).toEqual([]);
  });

  it('replaces targets whose value or block height moved (edits)', () => {
    const stale = row('a.near', '1');
    const edited = row('a.near', '1', {
      value: '{"text":"edited"}',
      blockHeight: 101,
    });
    const { next, removedKeys, updatedKeys } = reconcileFeedRows(
      [stale],
      [edited],
      [targetOf(stale)]
    );
    expect(next).toEqual([edited]);
    expect(updatedKeys).toEqual(['a.near:1']);
    expect(removedKeys).toEqual([]);
  });

  it('keeps identical rows by reference so unchanged cards stay still', () => {
    const same = row('a.near', '1');
    const { next, removedKeys, updatedKeys } = reconcileFeedRows(
      [same],
      [row('a.near', '1')],
      [targetOf(same)]
    );
    expect(next[0]).toBe(same);
    expect(removedKeys).toEqual([]);
    expect(updatedKeys).toEqual([]);
  });

  it('never touches rows outside the target window', () => {
    const targeted = row('a.near', '1');
    const older = row('b.near', 'deep');
    const { next, removedKeys } = reconcileFeedRows(
      [targeted, older],
      [targeted],
      [targetOf(targeted)]
    );
    expect(next).toEqual([targeted, older]);
    expect(removedKeys).toEqual([]);
  });
});

describe('home feed reconcile wiring', () => {
  it('runs inside the new-posts probe against the batched states query', () => {
    const libDir = dirname(fileURLToPath(import.meta.url));
    const pageSrc = readFileSync(
      join(libDir, '../features/home/home-feed.tsx'),
      'utf8'
    );
    expect(pageSrc).toContain('selectFeedReconcileTargets');
    expect(pageSrc).toContain('reconcileFeedRows');
    expect(pageSrc).toContain('reader.query.feed.statesByIds');
  });
});
