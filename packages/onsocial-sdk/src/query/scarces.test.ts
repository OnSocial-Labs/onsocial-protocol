import { describe, expect, it, vi } from 'vitest';
import { ScarcesQuery } from './scarces.js';
import type { QueryModule } from './index.js';

function makeQuery(
  handler: (req: {
    query: string;
    variables?: Record<string, unknown>;
  }) => unknown
) {
  const graphql = vi.fn(
    async (req: { query: string; variables?: Record<string, unknown> }) =>
      handler(req)
  );
  return {
    spies: { graphql },
    mod: { graphql } as unknown as QueryModule,
  };
}

describe('ScarcesQuery.activeListings', () => {
  it('filters by sourcePostPaths with _in and dedupes paths', async () => {
    const { mod, spies } = makeQuery(() => ({
      data: { scarcesActiveListings: [] },
    }));
    const q = new ScarcesQuery(mod);
    await q.activeListings({
      kinds: ['lazy'],
      sourcePostPaths: [
        'alice.near/post/1',
        'bob.near/post/2',
        'alice.near/post/1',
        '  ',
      ],
      limit: 10,
    });
    const req = spies.graphql.mock.calls[0]![0];
    expect(req.variables).toEqual({
      limit: 10,
      offset: 0,
      kinds: ['lazy'],
      sourcePostPaths: ['alice.near/post/1', 'bob.near/post/2'],
    });
    expect(req.query).toContain('sourcePostPath: {_in: $sourcePostPaths}');
    expect(req.query).toContain('$sourcePostPaths: [String!]!');
  });

  it('omits the sourcePostPaths clause when the list is empty', async () => {
    const { mod, spies } = makeQuery(() => ({
      data: { scarcesActiveListings: [] },
    }));
    const q = new ScarcesQuery(mod);
    await q.activeListings({ sourcePostPaths: [], limit: 5 });
    const req = spies.graphql.mock.calls[0]![0];
    expect(req.variables).toEqual({ limit: 5, offset: 0 });
    expect(req.query).not.toContain('sourcePostPath: {_in');
    expect(req.query).not.toContain('$sourcePostPaths');
  });
});

describe('ScarcesQuery.collectionsCurrent', () => {
  it('filters by sourcePostPaths with _in and dedupes paths', async () => {
    const { mod, spies } = makeQuery(() => ({
      data: { scarcesCollectionsCurrent: [] },
    }));
    const q = new ScarcesQuery(mod);
    await q.collectionsCurrent({
      sourcePostPaths: ['alice.near/post/1', 'alice.near/post/1'],
      includeUnavailable: true,
      limit: 10,
    });
    const req = spies.graphql.mock.calls[0]![0];
    expect(req.variables).toEqual({
      limit: 10,
      offset: 0,
      sourcePostPaths: ['alice.near/post/1'],
    });
    expect(req.query).toContain('sourcePostPath: {_in: $sourcePostPaths}');
  });

  it('combines singular sourcePostPath with the batch filter', async () => {
    const { mod, spies } = makeQuery(() => ({
      data: { scarcesCollectionsCurrent: [] },
    }));
    const q = new ScarcesQuery(mod);
    await q.collectionsCurrent({
      sourcePostPath: 'alice.near/post/9',
      sourcePostPaths: ['bob.near/post/2'],
    });
    const req = spies.graphql.mock.calls[0]![0];
    expect(req.variables?.sourcePostPath).toBe('alice.near/post/9');
    expect(req.variables?.sourcePostPaths).toEqual(['bob.near/post/2']);
    expect(req.query).toContain('sourcePostPath: {_eq: $sourcePostPath}');
    expect(req.query).toContain('sourcePostPath: {_in: $sourcePostPaths}');
  });
});
