import { describe, expect, it } from 'vitest';
import {
  collectionIdFromSaleEvent,
  excludeMovingFacesAlreadyShown,
  excludeMovingHubsAlreadySold,
  fetchMovingMentionRows,
  firstPosterTimestamps,
  isMovingLandingPainted,
  justSoldCollectionRefs,
  mergeMovingMentions,
  movingActivePeeks,
  movingChipCountLabel,
  movingSeenFaceIds,
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
  talkedAboutReplies,
  talkedAboutThreadHref,
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

  it('skips faces already on the scan when filling Active', () => {
    expect(
      recentPosterIds(
        [
          post('alice.near', '1'),
          post('bob.near', '2'),
          post('cara.near', '3'),
        ],
        2,
        ['alice.near']
      )
    ).toEqual(['bob.near', 'cara.near']);
  });

  it('drops Active faces already on Hot or Talked about', () => {
    expect(movingSeenFaceIds([post('mira.near', 'h1')], [post('leo.near', 'r1')])).toEqual(
      ['mira.near', 'leo.near']
    );
    expect(
      excludeMovingFacesAlreadyShown(
        [
          { accountId: 'mira.near' },
          { accountId: 'sam.near' },
          { accountId: 'leo.near' },
        ],
        [post('mira.near', 'h1')],
        [post('leo.near', 'r1')]
      ).map((row) => row.accountId)
    ).toEqual(['sam.near']);
  });

  it('drops hubs already on Just sold', () => {
    expect(
      excludeMovingHubsAlreadySold(
        [
          { appId: 'radio.near', title: 'Night Radio' },
          { appId: 'press.near', title: 'Quiet Press' },
        ],
        [{ appId: 'radio.near', title: 'Dawn folio' }]
      ).map((row) => row.appId)
    ).toEqual(['press.near']);
    expect(
      excludeMovingHubsAlreadySold(
        [
          { appId: 'radio.near', title: 'Night Radio' },
          { appId: 'press.near', title: 'Quiet Press' },
        ],
        [{ appId: null, title: 'Night Radio' }]
      ).map((row) => row.appId)
    ).toEqual(['press.near']);
  });

  it('keeps the first post time per author', () => {
    expect(
      [...firstPosterTimestamps([
        { accountId: 'alice.near', blockTimestamp: 30 },
        { accountId: 'bob.near', blockTimestamp: 20 },
        { accountId: 'alice.near', blockTimestamp: 10 },
      ])]
    ).toEqual([
      ['alice.near', 30],
      ['bob.near', 20],
    ]);
  });

  it('builds Active face peeks from posters and last-post time', () => {
    expect(
      movingActivePeeks(
        [
          { accountId: 'bob.near', name: 'Bob', avatarUrl: '/b.png' },
          { accountId: 'alice.near', name: 'Alice', avatarUrl: '/a.png' },
        ],
        [
          { accountId: 'alice.near', blockTimestamp: 30 },
          { accountId: 'bob.near', blockTimestamp: 20 },
          { accountId: 'alice.near', blockTimestamp: 10 },
        ],
        2
      )
    ).toEqual([
      {
        accountId: 'alice.near',
        name: 'Alice',
        avatarUrl: '/a.png',
        lastPostTimestamp: 30,
      },
      {
        accountId: 'bob.near',
        name: 'Bob',
        avatarUrl: '/b.png',
        lastPostTimestamp: 20,
      },
    ]);
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

  it('keeps the first reply per parent, newest conversation first', () => {
    const first = {
      ...post('bob.near', 'r1'),
      parentAuthor: 'alice.near',
      parentPath: 'alice.near/post/a',
    };
    const second = {
      ...post('cara.near', 'r2'),
      parentAuthor: 'dana.near',
      parentPath: 'dana.near/post/b',
    };
    const laterOnFirst = {
      ...post('eve.near', 'r3'),
      parentAuthor: 'alice.near',
      parentPath: 'alice.near/post/a',
    };
    expect(
      talkedAboutReplies([first, second, laterOnFirst], 2).map(
        (row) => row.postId
      )
    ).toEqual(['r1', 'r2']);
  });

  it('opens the parent thread focused on the reply that moved it', () => {
    expect(
      talkedAboutThreadHref({
        ...post('bob.near', 'r1'),
        parentAuthor: 'alice.near',
        parentPath: 'alice.near/post/root-1',
      })
    ).toBe('/@alice.near/posts/root-1?reply=r1');
  });

  it('keeps the newest sale per drop', () => {
    expect(
      justSoldCollectionRefs(
        [
          { collectionId: 'dawn', appId: 'radio.near', blockTimestamp: 30 },
          { collectionId: 'dusk', appId: 'shop.near', blockTimestamp: 20 },
          { collectionId: 'dawn', appId: 'radio.near', blockTimestamp: 10 },
          { collectionId: '', blockTimestamp: 40 },
        ],
        2
      )
    ).toEqual([
      { collectionId: 'dawn', appId: 'radio.near', lastSaleTimestamp: 30 },
      { collectionId: 'dusk', appId: 'shop.near', lastSaleTimestamp: 20 },
    ]);
  });

  it('reads a drop id from sale extraData when the column is empty', () => {
    expect(
      collectionIdFromSaleEvent({
        collectionId: '',
        extraData: '{"collection_id":"dawn","token_id":"s:1"}',
      })
    ).toBe('dawn');
    expect(
      justSoldCollectionRefs(
        [
          {
            extraData: '{"collection_id":"dawn"}',
            appId: 'radio.near',
            blockTimestamp: 30,
          },
        ],
        1
      )
    ).toEqual([
      { collectionId: 'dawn', appId: 'radio.near', lastSaleTimestamp: 30 },
    ]);
  });

  it('mixes last-mentioned topics, tickers, and places without counts', () => {
    expect(
      mergeMovingMentions(
        [
          { hashtag: 'gm', lastBlock: 10 },
          { hashtag: 'near', lastBlock: 30 },
        ],
        [{ ticker: 'social', lastBlock: 20 }],
        [{ place: 'lisbon', lastBlock: 25 }],
        3
      )
    ).toEqual([
      { kind: 'topic', id: 'near', lastBlock: 30, lastTimestamp: 0 },
      { kind: 'place', id: 'lisbon', lastBlock: 25, lastTimestamp: 0 },
      { kind: 'ticker', id: 'social', lastBlock: 20, lastTimestamp: 0 },
    ]);
  });

  it('orders Mentioned by real mention time when present', () => {
    expect(
      mergeMovingMentions(
        [{ hashtag: 'old', lastBlock: 99, lastTimestamp: 10 }],
        [{ ticker: 'social', lastBlock: 1, lastTimestamp: 50 }],
        [{ place: 'lisbon', lastBlock: 2, lastTimestamp: 40 }],
        3
      )
    ).toEqual([
      { kind: 'ticker', id: 'social', lastBlock: 1, lastTimestamp: 50 },
      { kind: 'place', id: 'lisbon', lastBlock: 2, lastTimestamp: 40 },
      { kind: 'topic', id: 'old', lastBlock: 99, lastTimestamp: 10 },
    ]);
  });

  it('falls back to last-block trending when mention stubs are empty', async () => {
    const query = {
      hashtags: {
        recentMentions: async () => [],
        trending: async () => [
          { hashtag: 'gm', postCount: 4, lastBlock: 9 },
        ],
      },
      tickers: {
        recentMentions: async () => {
          throw new Error('denied');
        },
        trending: async () => [
          { ticker: 'social', postCount: 2, lastBlock: 8 },
        ],
      },
      places: {
        recentMentions: async () => [
          { place: 'lisbon', postCount: 0, lastBlock: 3, lastTimestamp: 30 },
        ],
        trending: async () => {
          throw new Error('should not run');
        },
      },
    };
    await expect(fetchMovingMentionRows(query, 6)).resolves.toEqual({
      topics: [{ hashtag: 'gm', postCount: 4, lastBlock: 9 }],
      tickers: [{ ticker: 'social', postCount: 2, lastBlock: 8 }],
      places: [
        { place: 'lisbon', postCount: 0, lastBlock: 3, lastTimestamp: 30 },
      ],
    });
  });
});

describe('moving peek labels', () => {
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
        justSold: [],
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
