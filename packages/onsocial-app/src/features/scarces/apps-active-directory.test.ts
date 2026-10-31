import { beforeEach, describe, expect, it, vi } from 'vitest';

const graphql = vi.fn();

vi.mock('@/lib/create-readonly-onsocial-client', () => ({
  createReadOnlyOnSocialClient: () => ({
    query: { graphql },
  }),
}));

import { fetchHubsBrowsePage } from '@/features/scarces/apps-data';

function appRow(
  appId: string,
  name: string,
  category?: string,
  updatedBlockTimestamp: number | null = null
) {
  return {
    appId,
    ownerId: 'alice.near',
    primarySaleBps: 250,
    creatorAccess: 'open',
    metadata: JSON.stringify({
      name,
      ...(category ? { categories: [category] } : {}),
    }),
    createdBlockTimestamp: null,
    updatedBlockTimestamp,
  };
}

describe('fetchHubsBrowsePage', () => {
  beforeEach(() => {
    graphql.mockReset();
  });

  it('lists movers first, then hubs that have not moved', async () => {
    graphql.mockImplementation(
      async (req: {
        query?: string;
        variables?: { ids?: string[]; offset?: number };
      }) => {
        const query = req.query ?? '';
        if (query.includes('scarcesAppStats')) {
          expect(query).toContain('lastActivityTimestamp: DESC_NULLS_LAST');
          expect(query).not.toContain('scarcesAppStatsHot');
          const offset = req.variables?.offset ?? 0;
          if (offset > 0) return { data: { scarcesAppStats: [] } };
          return {
            data: {
              scarcesAppStats: [
                { appId: 'new-hub', lastActivityTimestamp: 90 },
                { appId: 'old-hub', lastActivityTimestamp: 10 },
                { appId: 'idle-hub', lastActivityTimestamp: 0 },
              ],
            },
          };
        }
        if (query.includes('ScarcesAppsDirectory')) {
          expect(req.variables).toEqual(
            expect.objectContaining({
              excludeIds: expect.arrayContaining([
                'new-hub',
                'old-hub',
                'idle-hub',
              ]),
            })
          );
          return {
            data: {
              scarcesApps: [appRow('quiet-hub', 'Quiet Market')],
            },
          };
        }
        const ids = req.variables?.ids ?? [];
        return {
          data: {
            scarcesApps: [
              appRow('new-hub', 'New Market'),
              appRow('old-hub', 'Old Market'),
              appRow('idle-hub', 'Idle Market'),
            ].filter((row) => ids.includes(row.appId)),
          },
        };
      }
    );

    const page = await fetchHubsBrowsePage({ limit: 24 });
    expect(page.apps.map((app) => app.appId)).toEqual([
      'new-hub',
      'old-hub',
      'idle-hub',
      'quiet-hub',
    ]);
    expect(page.hasMore).toBe(false);
    expect(page.cursor.phase).toBe('directory');
  });

  it('still lists hubs when every clock is empty', async () => {
    graphql.mockImplementation(async (req: { query?: string }) => {
      const query = req.query ?? '';
      if (query.includes('scarcesAppStats')) {
        return {
          data: {
            scarcesAppStats: [
              { appId: 'quiet-a', lastActivityTimestamp: 0 },
              { appId: 'quiet-b', lastActivityTimestamp: null },
            ],
          },
        };
      }
      if (query.includes('ScarcesAppsDirectory')) {
        return { data: { scarcesApps: [] } };
      }
      return {
        data: {
          scarcesApps: [
            appRow('quiet-a', 'Quiet A'),
            appRow('quiet-b', 'Quiet B'),
          ],
        },
      };
    });

    const page = await fetchHubsBrowsePage({ limit: 24 });
    expect(page.apps.map((app) => app.appId)).toEqual(['quiet-a', 'quiet-b']);
  });

  it('falls through to the directory when nothing has a stats row', async () => {
    graphql.mockImplementation(async (req: { query?: string }) => {
      const query = req.query ?? '';
      if (query.includes('scarcesAppStats')) {
        return { data: { scarcesAppStats: [] } };
      }
      return {
        data: { scarcesApps: [appRow('quiet-hub', 'Quiet Market')] },
      };
    });

    const page = await fetchHubsBrowsePage();
    expect(page.apps.map((app) => app.appId)).toEqual(['quiet-hub']);
    expect(page.cursor).toEqual({ phase: 'directory', offset: 1 });
  });

  it('continues infinite scroll from the activity cursor', async () => {
    const stats = [
      { appId: 'new-hub', lastActivityTimestamp: 90 },
      { appId: 'old-hub', lastActivityTimestamp: 10 },
      { appId: 'idle-hub', lastActivityTimestamp: 0 },
    ];
    graphql.mockImplementation(
      async (req: {
        query?: string;
        variables?: { offset?: number; ids?: string[] };
      }) => {
        const query = req.query ?? '';
        if (query.includes('scarcesAppStats')) {
          const offset = req.variables?.offset ?? 0;
          return { data: { scarcesAppStats: stats.slice(offset) } };
        }
        if (query.includes('ScarcesAppsDirectory')) {
          return { data: { scarcesApps: [] } };
        }
        const ids = req.variables?.ids ?? [];
        return {
          data: {
            scarcesApps: stats
              .filter((row) => ids.includes(row.appId))
              .map((row) => appRow(row.appId, row.appId)),
          },
        };
      }
    );

    const first = await fetchHubsBrowsePage({ limit: 1 });
    expect(first.apps.map((app) => app.appId)).toEqual(['new-hub']);
    expect(first.hasMore).toBe(true);
    expect(first.cursor).toEqual({ phase: 'activity', offset: 1 });

    const second = await fetchHubsBrowsePage({
      limit: 1,
      cursor: first.cursor,
      excludeIds: first.apps.map((app) => app.appId),
    });
    expect(second.apps.map((app) => app.appId)).toEqual(['old-hub']);
    expect(second.cursor).toEqual({ phase: 'activity', offset: 2 });
  });

  it('keeps scanning until the category has a hub', async () => {
    graphql.mockImplementation(
      async (req: {
        query?: string;
        variables?: { offset?: number; ids?: string[] };
      }) => {
        const query = req.query ?? '';
        if (query.includes('scarcesAppStats')) {
          const offset = req.variables?.offset ?? 0;
          if (offset === 0) {
            return {
              data: {
                scarcesAppStats: Array.from({ length: 48 }, (_, index) => ({
                  appId: `art-${index}`,
                  lastActivityTimestamp: 1_000 - index,
                })),
              },
            };
          }
          if (offset === 48) {
            return {
              data: {
                scarcesAppStats: [
                  { appId: 'music-hub', lastActivityTimestamp: 40 },
                  { appId: 'idle-hub', lastActivityTimestamp: 0 },
                ],
              },
            };
          }
          return { data: { scarcesAppStats: [] } };
        }
        if (query.includes('ScarcesAppsDirectory')) {
          return { data: { scarcesApps: [] } };
        }
        const ids = req.variables?.ids ?? [];
        return {
          data: {
            scarcesApps: ids.map((id) =>
              appRow(id, id, id === 'music-hub' ? 'music' : 'art')
            ),
          },
        };
      }
    );

    const page = await fetchHubsBrowsePage({
      limit: 24,
      category: 'music',
    });
    expect(page.apps.map((app) => app.appId)).toEqual(['music-hub']);
    const statsCalls = graphql.mock.calls.filter((call) =>
      String(call[0]?.query ?? '').includes('scarcesAppStats')
    );
    expect(statsCalls[1]?.[0]?.variables?.offset).toBe(48);
  });
});
