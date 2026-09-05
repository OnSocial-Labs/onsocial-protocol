import { describe, expect, it } from 'vitest';
import {
  isMovingLandingPainted,
  movingChipCountLabel,
  movingPostHeatLabel,
  movingPostTalkLabel,
  movingProposalMeta,
  movingProposalStatusLabel,
  movingScarceSignalLabel,
  movingSectionFromSeed,
  orderRowsByAccountIds,
  parentPostRefFromReply,
  postHasAmplifyHeat,
  recentPosterIds,
  selectHotPosts,
  talkedAboutParentRefs,
} from './discover-moving';
import type { PostRow } from '@onsocial/sdk';

function post(
  accountId: string,
  postId: string,
  amplifyHeat?: number
): PostRow {
  return {
    accountId,
    postId,
    value: '{}',
    blockHeight: 1,
    blockTimestamp: 1,
    amplifyHeat,
  };
}

describe('discover-moving', () => {
  it('treats missing or zero heat as cold', () => {
    expect(postHasAmplifyHeat(post('a.near', '1'))).toBe(false);
    expect(postHasAmplifyHeat(post('a.near', '1', 0))).toBe(false);
    expect(postHasAmplifyHeat(post('a.near', '1', 0.4))).toBe(true);
  });

  it('drops chrono fallback posts from Hot', () => {
    expect(
      selectHotPosts([
        post('cold.near', '1', 0),
        post('hot.near', '2', 1.2),
        post('also.near', '3'),
      ]).map((row) => row.postId)
    ).toEqual(['2']);
  });

  it('lists recent posters once, in feed order', () => {
    expect(
      recentPosterIds(
        [
          post('alice.near', '1'),
          post('bob.near', '2'),
          post('alice.near', '3'),
          post('cara.near', '4'),
        ],
        2
      )
    ).toEqual(['alice.near', 'bob.near']);
  });

  it('reorders profile rows to match poster ids', () => {
    expect(
      orderRowsByAccountIds(
        [{ accountId: 'bob.near' }, { accountId: 'alice.near' }],
        ['alice.near', 'cara.near', 'bob.near']
      ).map((row) => row.accountId)
    ).toEqual(['alice.near', 'bob.near']);
  });

  it('reads the parent thread off a reply', () => {
    expect(
      parentPostRefFromReply({
        parentAuthor: 'alice.near',
        parentPath: 'alice.near/post/root-1',
      })
    ).toEqual({ author: 'alice.near', postId: 'root-1' });
    expect(
      parentPostRefFromReply({
        parentAuthor: 'alice.near',
        parentPath: 'alice.near/groups/dao/content/post/g1',
      })
    ).toEqual({ author: 'alice.near', postId: 'g1' });
  });

  it('lists talked-about threads once, newest reply first', () => {
    expect(
      talkedAboutParentRefs(
        [
          { parentAuthor: 'alice.near', parentPath: 'alice.near/post/a' },
          { parentAuthor: 'bob.near', parentPath: 'bob.near/post/b' },
          { parentAuthor: 'alice.near', parentPath: 'alice.near/post/a' },
          { parentAuthor: 'cara.near', parentPath: 'cara.near/post/c' },
        ],
        2
      )
    ).toEqual([
      { author: 'alice.near', postId: 'a' },
      { author: 'bob.near', postId: 'b' },
    ]);
  });
});

describe('moving peek labels', () => {
  it('names heat and talk as different why-lines', () => {
    expect(movingPostHeatLabel()).toBe('Hot');
    expect(movingPostTalkLabel()).toBe('Talk');
    expect(movingPostHeatLabel()).not.toBe(movingPostTalkLabel());
  });

  it('compacts chip counts', () => {
    expect(movingChipCountLabel(12)).toBe('12');
    expect(movingChipCountLabel(12500)).toBe('12.5K');
  });

  it('names drop signals as sold or fans', () => {
    expect(movingScarceSignalLabel('traded', 1)).toBe('1 sold');
    expect(movingScarceSignalLabel('traded', 12)).toBe('12 sold');
    expect(movingScarceSignalLabel('loved', 1)).toBe('1 fan');
    expect(movingScarceSignalLabel('loved', 8)).toBe('8 fans');
    expect(movingScarceSignalLabel('loved', 0)).toBeNull();
  });

  it('keeps proposal status human', () => {
    expect(movingProposalStatusLabel('InProgress')).toBe('In review');
    expect(movingProposalStatusLabel('approved')).toBe('Approved');
    expect(movingProposalStatusLabel('expired')).toBe('Expired');
    expect(movingProposalMeta({ status: 'active', groupId: 'dao.near' })).toBe(
      'In review'
    );
    expect(
      movingProposalMeta({ status: null, proposalType: 'AddMember' })
    ).toBe('AddMember');
  });
});

describe('moving landing paint', () => {
  it('treats an empty SSR seed as still loading', () => {
    expect(
      isMovingLandingPainted({
        movingTickers: [],
        movingTopics: [],
        places: [],
        profiles: [],
        hubs: [],
        posts: [],
        talkedAbout: [],
        dropsTraded: [],
        dropsLoved: [],
        proposals: [],
      })
    ).toBe(false);
    expect(movingSectionFromSeed([], false)).toBeNull();
    expect(movingSectionFromSeed([{ id: '1' }], false)).toEqual([{ id: '1' }]);
  });

  it('keeps a painted seed, including empty sections', () => {
    expect(isMovingLandingPainted({ posts: [post('a.near', '1')] })).toBe(true);
    expect(movingSectionFromSeed([], true)).toEqual([]);
  });
});
