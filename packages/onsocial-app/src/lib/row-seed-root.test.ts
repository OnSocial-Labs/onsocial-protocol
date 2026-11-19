import { describe, expect, it } from 'vitest';
import type { PostRow } from '@onsocial/sdk';
import {
  feedRowSeedMatches,
  isFeedRowSeed,
  paintedRootQueryKind,
  rowSeedRevision,
  threadRootRevisionLabel,
} from '@/lib/row-seed-root';

function row(overrides: Partial<PostRow> = {}): PostRow {
  return {
    accountId: 'alice.near',
    postId: 'p1',
    value: JSON.stringify({ v: 1, text: 'from the row' }),
    blockHeight: 200,
    blockTimestamp: 1_700_000_000_000,
    receiptId: 'receipt-row',
    authorName: 'Ada Lovelace',
    replyCount: 4,
    quotedPost: { postId: 'quoted' },
    ...overrides,
  } as PostRow;
}

describe('feed row seed', () => {
  it('treats a feed seed as a row and an SSR page as a permalink', () => {
    expect(isFeedRowSeed({ root: row() })).toBe(true);
    expect(isFeedRowSeed(null)).toBe(false);
    expect(isFeedRowSeed({ root: row(), directRepliesResolved: true })).toBe(
      false
    );
    expect(isFeedRowSeed({ root: row(), directRepliesResolved: false })).toBe(
      false
    );
  });

  it('matches only the post this sheet opened', () => {
    const seed = { root: row({ groupId: 'dao' }) };
    expect(
      feedRowSeedMatches(seed, {
        author: 'alice.near',
        postId: 'p1',
        groupId: 'dao',
      })
    ).toBe(true);
    expect(
      feedRowSeedMatches(seed, {
        author: 'alice.near',
        postId: 'other',
        groupId: 'dao',
      })
    ).toBe(false);
    expect(
      feedRowSeedMatches(
        { root: row(), directRepliesResolved: true },
        { author: 'alice.near', postId: 'p1' }
      )
    ).toBe(false);
  });
});

describe('paintedRootQueryKind', () => {
  it('sends a guild row to the group read', () => {
    expect(paintedRootQueryKind(row())).toBe('personal');
    expect(paintedRootQueryKind(row({ groupId: 'dao' }))).toBe('group');
    expect(paintedRootQueryKind(row({ isGroupContent: true }))).toBe('group');
    expect(paintedRootQueryKind(null)).toBe('personal');
  });
});

describe('rowSeedRevision', () => {
  const painted = row();

  it('keeps a quiet label when the indexed row is unchanged', () => {
    expect(
      rowSeedRevision(painted, {
        blockHeight: 200,
        receiptId: 'receipt-row',
      })
    ).toBeNull();
    expect(threadRootRevisionLabel(null)).toBeNull();
  });

  it('marks a newer block or a new receipt as Edited', () => {
    expect(
      rowSeedRevision(painted, { blockHeight: 240, receiptId: 'receipt-row' })
    ).toBe('edited');
    expect(
      rowSeedRevision(painted, {
        blockHeight: '240',
        receiptId: 'receipt-next',
      })
    ).toBe('edited');
    expect(
      rowSeedRevision(painted, {
        blockHeight: 200,
        receiptId: 'receipt-next',
      })
    ).toBe('edited');
    expect(threadRootRevisionLabel('edited')).toBe('Edited');
  });

  it('marks an empty read of an indexed row as Deleted', () => {
    expect(rowSeedRevision(painted, null)).toBe('deleted');
    expect(threadRootRevisionLabel('deleted')).toBe('Deleted');
  });

  it('does not mark an unindexed optimistic row', () => {
    const optimistic = row({ blockHeight: 0, receiptId: '' });
    expect(rowSeedRevision(optimistic, null)).toBeNull();
    expect(
      rowSeedRevision(optimistic, { blockHeight: 10, receiptId: 'later' })
    ).toBeNull();
  });

  it('ignores an older read', () => {
    expect(
      rowSeedRevision(painted, { blockHeight: 10, receiptId: 'older' })
    ).toBeNull();
  });
});
