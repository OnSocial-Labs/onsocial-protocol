import { describe, expect, it } from 'vitest';

import {
  buildPermissionIndex,
  permissionsMatch,
} from '../../src/scripts/hasuraPermissionState.js';

describe('permissionsMatch', () => {
  it('treats equivalent permissions as unchanged', () => {
    expect(
      permissionsMatch(
        {
          columns: ['kind', 'channel', 'audiences'],
          filter: {},
          limit: 100,
          allow_aggregations: true,
        },
        {
          columns: ['audiences', 'channel', 'kind'],
          filter: {},
          limit: 100,
          allow_aggregations: true,
        }
      )
    ).toBe(true);
  });

  it('detects permission drift when columns differ', () => {
    expect(
      permissionsMatch(
        {
          columns: ['channel', 'kind'],
          filter: {},
          limit: 100,
          allow_aggregations: true,
        },
        {
          columns: ['channel', 'kind', 'audiences'],
          filter: {},
          limit: 100,
          allow_aggregations: true,
        }
      )
    ).toBe(false);
  });
});

describe('buildPermissionIndex', () => {
  it('indexes select permissions by table and role', () => {
    const index = buildPermissionIndex([
      {
        table: { name: 'posts_current' },
        select_permissions: [
          {
            role: 'free',
            permission: {
              columns: ['channel'],
              filter: {},
              limit: 100,
              allow_aggregations: true,
            },
          },
        ],
      },
    ]);

    expect(index.get('posts_current')?.get('free')).toEqual({
      columns: ['channel'],
      filter: {},
      limit: 100,
      allow_aggregations: true,
    });
  });
});