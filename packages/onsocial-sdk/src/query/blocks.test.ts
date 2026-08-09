import { describe, expect, it, vi } from 'vitest';
import { BlocksQuery } from './blocks.js';
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

describe('BlocksQuery', () => {
  it('outgoing maps targetAccount ids', async () => {
    const { mod, spies } = makeQuery(() => ({
      data: {
        blocksCurrent: [
          {
            accountId: 'alice.near',
            targetAccount: 'bob.near',
            value: '{"v":1,"since":1}',
            blockHeight: 10,
            blockTimestamp: 100,
          },
          {
            accountId: 'alice.near',
            targetAccount: 'carol.near',
            value: null,
            blockHeight: 11,
            blockTimestamp: 110,
          },
        ],
      },
    }));
    const q = new BlocksQuery(mod);
    expect(await q.outgoing('alice.near')).toEqual(['bob.near', 'carol.near']);
    expect(spies.graphql.mock.calls[0]![0].variables).toEqual({
      id: 'alice.near',
      limit: 100,
      offset: 0,
    });
  });

  it('viewerBlocks is true when an edge exists', async () => {
    const { mod } = makeQuery(() => ({
      data: { blocksCurrent: [{ accountId: 'alice.near' }] },
    }));
    const q = new BlocksQuery(mod);
    expect(await q.viewerBlocks('alice.near', 'bob.near')).toBe(true);
  });

  it('eitherWay is true for outgoing or incoming edges', async () => {
    const outgoing = makeQuery(() => ({
      data: {
        outgoing: [{ accountId: 'alice.near' }],
        incoming: [],
      },
    }));
    expect(
      await new BlocksQuery(outgoing.mod).eitherWay('alice.near', 'bob.near')
    ).toBe(true);

    const incoming = makeQuery(() => ({
      data: {
        outgoing: [],
        incoming: [{ accountId: 'bob.near' }],
      },
    }));
    expect(
      await new BlocksQuery(incoming.mod).eitherWay('alice.near', 'bob.near')
    ).toBe(true);

    const neither = makeQuery(() => ({
      data: { outgoing: [], incoming: [] },
    }));
    expect(
      await new BlocksQuery(neither.mod).eitherWay('alice.near', 'bob.near')
    ).toBe(false);
  });
});
