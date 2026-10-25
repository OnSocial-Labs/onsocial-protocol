import { describe, expect, it } from 'vitest';
import type { PostRow } from '@onsocial/sdk';
import { resolveThreadFoldLabel } from '@/lib/thread-fold-label';

const NOW = new Date(2026, 9, 25, 15, 0, 0).getTime(); // Sun Oct 25 2026, 3pm local

function post(
  accountId: string,
  postId: string,
  extra: Partial<PostRow> = {}
): PostRow {
  return {
    accountId,
    postId,
    value: '{"text":"hi"}',
    blockHeight: 1,
    blockTimestamp: NOW - 60 * 60 * 1000,
    ...extra,
  };
}

function photoPost(
  accountId: string,
  postId: string,
  blockTimestamp = NOW - 60 * 60 * 1000
): PostRow {
  return post(accountId, postId, {
    blockTimestamp,
    value: JSON.stringify({
      text: 'look',
      media: [{ cid: 'bafyphoto', mime: 'image/jpeg' }],
    }),
  });
}

describe('resolveThreadFoldLabel', () => {
  it('returns null for an empty fold', () => {
    expect(resolveThreadFoldLabel([], { now: NOW })).toBeNull();
  });

  it('leads with the author when every hidden post is theirs', () => {
    const hidden = [
      post('sam.near', 'a'),
      post('sam.near', 'b'),
      post('sam.near', 'c'),
      post('sam.near', 'd'),
      post('sam.near', 'e'),
      post('sam.near', 'f'),
    ];
    expect(
      resolveThreadFoldLabel(hidden, {
        profiles: { 'sam.near': { displayName: 'Sam' } },
        now: NOW,
      })
    ).toBe('Six replies from Sam');
  });

  it('speaks the local part without a profile and singularizes', () => {
    expect(resolveThreadFoldLabel([post('sam.near', 'a')], { now: NOW })).toBe(
      'One reply from Sam'
    );
  });

  it('flags the notable author in a multi-author fold', () => {
    const hidden = [
      post('pat.near', 'a'),
      post('sam.near', 'b'),
      post('kit.near', 'c'),
      post('sam.near', 'd'),
      post('pat.near', 'e'),
      post('kit.near', 'f'),
    ];
    expect(
      resolveThreadFoldLabel(hidden, {
        notableAccountIds: new Set(['sam.near']),
        profiles: { 'sam.near': { displayName: 'Sam' } },
        now: NOW,
      })
    ).toBe('Six replies, including Sam');
  });

  it('leads with photos when a mixed-author fold is media-heavy', () => {
    const hidden = [
      photoPost('pat.near', 'a'),
      photoPost('kit.near', 'b'),
      post('sam.near', 'c'),
    ];
    expect(resolveThreadFoldLabel(hidden, { now: NOW })).toBe(
      'Two replies with photos'
    );
  });

  it('skips the media label when photos are a minority', () => {
    const hidden = [
      photoPost('pat.near', 'a', morning(6)),
      post('kit.near', 'b', { blockTimestamp: morning(9) }),
      post('sam.near', 'c', { blockTimestamp: morning(8) }),
    ];
    expect(resolveThreadFoldLabel(hidden, { now: NOW })).toBe(
      'Replies from this morning'
    );
  });

  it('uses the daypart of the newest hidden post as the last signal', () => {
    const hidden = [
      post('pat.near', 'a', { blockTimestamp: morning(7) }),
      post('kit.near', 'b', { blockTimestamp: morning(11) }),
    ];
    expect(resolveThreadFoldLabel(hidden, { now: NOW })).toBe(
      'Replies from this morning'
    );
  });

  it('says yesterday, earlier this week, and a while back by age', () => {
    const at = (offsetDays: number, hour: number) =>
      new Date(2026, 9, 25 - offsetDays, hour).getTime();
    const pair = (offsetDays: number) => [
      post('pat.near', 'a', { blockTimestamp: at(offsetDays, 10) }),
      post('kit.near', 'b', { blockTimestamp: at(offsetDays, 9) }),
    ];
    expect(resolveThreadFoldLabel(pair(1), { now: NOW })).toBe(
      'Replies from yesterday'
    );
    expect(resolveThreadFoldLabel(pair(4), { now: NOW })).toBe(
      'Replies from earlier this week'
    );
    expect(resolveThreadFoldLabel(pair(40), { now: NOW })).toBe(
      'Replies from a while back'
    );
  });

  it('marks feed-chain folds as earlier posts from the author', () => {
    const hidden = [post('sam.near', 'a'), post('sam.near', 'b')];
    expect(
      resolveThreadFoldLabel(hidden, {
        noun: 'post',
        earlier: true,
        profiles: { 'sam.near': { displayName: 'Sam' } },
        now: NOW,
      })
    ).toBe('Two earlier posts from Sam');
  });

  it('switches to digits past twelve', () => {
    const hidden = Array.from({ length: 13 }, (_, index) =>
      post('sam.near', `p${index}`)
    );
    expect(resolveThreadFoldLabel(hidden, { now: NOW })).toBe(
      '13 replies from Sam'
    );
  });
});

function morning(hour: number): number {
  return new Date(2026, 9, 25, hour).getTime();
}
