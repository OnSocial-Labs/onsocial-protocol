import { describe, expect, it, vi } from 'vitest';
import { FeedQuery } from './feed.js';
import type { QueryModule } from './index.js';
import type { GraphQLRequest, GraphQLResponse } from '../types.js';
import type { PostRow } from './_shared.js';

function row(
  accountId: string,
  postId: string,
  extra: Partial<PostRow> = {}
): PostRow {
  return {
    accountId,
    postId,
    value: '{}',
    blockHeight: extra.blockHeight ?? 1,
    blockTimestamp: extra.blockTimestamp ?? 1,
    ...extra,
  };
}

function fakeQueryModule(rows: PostRow[]) {
  const graphql = vi.fn(
    async (_req: GraphQLRequest): Promise<GraphQLResponse<unknown>> => ({
      data: { postsFeed: rows },
    })
  );
  return {
    q: { graphql } as unknown as QueryModule,
    graphql,
  };
}

describe('FeedQuery.statesByIds', () => {
  it('returns current rows for existing pairs and drops deleted ones', async () => {
    const { q, graphql } = fakeQueryModule([
      row('alice.near', '1', { value: '{"text":"edited"}', blockHeight: 9 }),
    ]);
    const feed = new FeedQuery(q);

    const fresh = await feed.statesByIds([
      { accountId: 'alice.near', postId: '1' },
      { accountId: 'bob.near', postId: '2' },
    ]);

    expect(fresh).toHaveLength(1);
    expect(fresh[0]?.accountId).toBe('alice.near');
    expect(fresh[0]?.value).toBe('{"text":"edited"}');
    expect(graphql).toHaveBeenCalledTimes(1);
    const req = graphql.mock.calls[0]?.[0] as GraphQLRequest;
    expect(req.variables).toMatchObject({
      accounts: ['alice.near', 'bob.near'],
      postIds: ['1', '2'],
    });
  });

  it('dedupes repeated pairs into one query', async () => {
    const { q, graphql } = fakeQueryModule([row('alice.near', '1')]);
    const feed = new FeedQuery(q);

    await feed.statesByIds([
      { accountId: 'alice.near', postId: '1' },
      { accountId: 'alice.near', postId: '1' },
    ]);

    const req = graphql.mock.calls[0]?.[0] as GraphQLRequest;
    expect(req.variables).toMatchObject({
      accounts: ['alice.near'],
      postIds: ['1'],
    });
  });

  it('skips the query entirely for empty or blank pairs', async () => {
    const { q, graphql } = fakeQueryModule([]);
    const feed = new FeedQuery(q);

    expect(await feed.statesByIds([])).toEqual([]);
    expect(await feed.statesByIds([{ accountId: '', postId: '1' }])).toEqual(
      []
    );
    expect(graphql).not.toHaveBeenCalled();
  });
});
