import { describe, expect, it, vi } from 'vitest';
import { SavesQuery } from './saves.js';
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

describe('SavesQuery', () => {
  it('list pages saves for an account', async () => {
    const { mod, spies } = makeQuery(() => ({
      data: {
        savesCurrent: [
          {
            accountId: 'alice.near',
            contentPath: 'bob.near/post/1',
            value: '{}',
            blockHeight: 1,
            blockTimestamp: 1,
            operation: 'set',
          },
        ],
      },
    }));
    const q = new SavesQuery(mod);
    const rows = await q.list('alice.near', { limit: 10, offset: 2 });
    expect(rows).toHaveLength(1);
    expect(spies.graphql.mock.calls[0]![0].variables).toEqual({
      id: 'alice.near',
      limit: 10,
      offset: 2,
    });
  });

  it('forPaths filters by contentPath _in and dedupes paths', async () => {
    const { mod, spies } = makeQuery(() => ({
      data: {
        savesCurrent: [
          {
            accountId: 'alice.near',
            contentPath: 'bob.near/post/1',
            value: '{}',
            blockHeight: 1,
            blockTimestamp: 1,
            operation: 'set',
          },
        ],
      },
    }));
    const q = new SavesQuery(mod);
    const rows = await q.forPaths('alice.near', [
      'bob.near/post/1',
      'bob.near/post/1',
      '  carol.near/post/2  ',
      '',
    ]);
    expect(rows).toHaveLength(1);
    expect(spies.graphql.mock.calls[0]![0].variables).toEqual({
      id: 'alice.near',
      paths: ['bob.near/post/1', 'carol.near/post/2'],
      limit: 2,
    });
    expect(String(spies.graphql.mock.calls[0]![0].query)).toContain(
      'contentPath: {_in: $paths}'
    );
  });

  it('forPaths returns [] without calling graphql when paths empty', async () => {
    const { mod, spies } = makeQuery(() => ({ data: { savesCurrent: [] } }));
    const q = new SavesQuery(mod);
    expect(await q.forPaths('alice.near', ['', '  '])).toEqual([]);
    expect(spies.graphql).not.toHaveBeenCalled();
  });
});
