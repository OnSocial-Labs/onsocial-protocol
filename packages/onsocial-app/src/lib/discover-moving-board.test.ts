import { describe, expect, it, vi } from 'vitest';
import {
  emptyMovingBoard,
  loadMovingBoard,
  movingBoardFromSeed,
} from './discover-moving-board';

const { rankHubPeeks, fetchJustSoldScarcePeeks, fetchTalkedAboutPosts } =
  vi.hoisted(() => ({
    rankHubPeeks: vi.fn(),
    fetchJustSoldScarcePeeks: vi.fn(),
    fetchTalkedAboutPosts: vi.fn(),
  }));

vi.mock('@/features/discover/discover-community-ranking', () => ({
  rankHubPeeks,
}));
vi.mock('@/features/discover/discover-scarce-peeks', () => ({
  fetchJustSoldScarcePeeks,
}));
vi.mock('@/features/discover/discover-talked-about', () => ({
  fetchTalkedAboutPosts,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function mentionSource<T>(rows: T[]) {
  return {
    recentMentions: async () => rows,
    trending: async () => rows,
  };
}

describe('movingBoardFromSeed', () => {
  it('paints an empty board when the seed is missing', () => {
    expect(movingBoardFromSeed(null)).toEqual(emptyMovingBoard());
  });

  it('copies every strip so the client can paint once', () => {
    const board = movingBoardFromSeed({
      posts: [{ accountId: 'a.near', postId: '1' } as never],
      movingTickers: [{ ticker: 'social', postCount: 0, lastBlock: 1 }],
      hubs: [{ appId: 'studio.near', title: 'Studio' }],
    });
    expect(board.posts).toHaveLength(1);
    expect(board.tickers).toEqual([
      { ticker: 'social', postCount: 0, lastBlock: 1 },
    ]);
    expect(board.hubs).toEqual([
      {
        appId: 'studio.near',
        title: 'Studio',
        bannerUrl: null,
        markUrl: null,
        lastActivityTimestamp: null,
      },
    ]);
    expect(board.talkedAbout).toEqual([]);
  });
});

describe('loadMovingBoard', () => {
  it('waits for every strip before returning one board', async () => {
    const hot = deferred<{
      items: Array<{
        accountId: string;
        postId: string;
        value: string;
        blockHeight: number;
        blockTimestamp: number;
        amplifyHeat: number;
      }>;
    }>();
    const talked = deferred<unknown[]>();
    const sold = deferred<unknown[]>();
    const hubs = deferred<
      Array<{
        appId: string;
        title: string;
        bannerUrl: null;
        markUrl: null;
        lastActivityTimestamp: number;
      }>
    >();
    const proposals = deferred<unknown[]>();

    fetchTalkedAboutPosts.mockReturnValue(talked.promise);
    fetchJustSoldScarcePeeks.mockReturnValue(sold.promise);
    rankHubPeeks.mockReturnValue(hubs.promise);

    const os = {
      query: {
        feed: {
          recent: (opts: { sort?: string }) =>
            opts.sort === 'hot' ? hot.promise : Promise.resolve({ items: [] }),
        },
        profiles: { statsForAccounts: async () => [] },
        governance: { recentProposals: () => proposals.promise },
        hashtags: mentionSource([]),
        tickers: mentionSource([]),
        places: mentionSource([]),
      },
    };

    let settled = false;
    const pending = loadMovingBoard(os as never).then((board) => {
      settled = true;
      return board;
    });

    await Promise.resolve();
    expect(settled).toBe(false);

    hot.resolve({
      items: [
        {
          accountId: 'hot.near',
          postId: '1',
          value: '{}',
          blockHeight: 1,
          blockTimestamp: 1,
          amplifyHeat: 2,
        },
      ],
    });
    talked.resolve([]);
    sold.resolve([]);
    hubs.resolve([
      {
        appId: 'fresh.near',
        title: 'Fresh',
        bannerUrl: null,
        markUrl: null,
        lastActivityTimestamp: 90,
      },
    ]);
    await Promise.resolve();
    expect(settled).toBe(false);

    proposals.resolve([]);
    const board = await pending;
    expect(settled).toBe(true);
    expect(board.posts.map((row) => row.accountId)).toEqual(['hot.near']);
    expect(board.hubs.map((row) => row.appId)).toEqual(['fresh.near']);
    expect(board.talkedAbout).toEqual([]);
    expect(board.justSold).toEqual([]);
    expect(board.proposals).toEqual([]);
  });
});
