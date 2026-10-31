import { beforeEach, describe, expect, it, vi } from 'vitest';

const graphql = vi.fn();

vi.mock('@/lib/create-readonly-onsocial-client', () => ({
  createReadOnlyOnSocialClient: () => ({
    query: { graphql },
  }),
}));

import { fetchActiveHubsDirectory } from '@/features/scarces/apps-data';

function appRow(appId: string, name: string, category?: string) {
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
    updatedBlockTimestamp: null,
  };
}

describe('fetchActiveHubsDirectory', () => {
  beforeEach(() => {
    graphql.mockReset();
  });

  it('lists hubs by last move and stops when the clock runs out', async () => {
    graphql.mockImplementation(
      async (req: { query?: string; variables?: { ids?: string[] } }) => {
        const query = req.query ?? '';
        if (query.includes('scarcesAppStats')) {
          expect(query).toContain('lastActivityTimestamp: DESC_NULLS_LAST');
          expect(query).not.toContain('scarcesAppStatsHot');
          return {
            data: {
              scarcesAppStats: [
                { appId: 'old-hub', lastActivityTimestamp: 10 },
                { appId: 'new-hub', lastActivityTimestamp: 90 },
                { appId: 'idle-hub', lastActivityTimestamp: 0 },
              ],
            },
          };
        }
        expect(req.variables?.ids).toEqual(['old-hub', 'new-hub']);
        return {
          data: {
            scarcesApps: [
              appRow('old-hub', 'Old Market'),
              appRow('new-hub', 'New Market'),
            ],
          },
        };
      }
    );

    const apps = await fetchActiveHubsDirectory({ limit: 24 });
    expect(apps.map((app) => app.appId)).toEqual(['new-hub', 'old-hub']);
    expect(graphql).toHaveBeenCalledTimes(2);
  });

  it('does not load hubs whose clock is empty', async () => {
    graphql.mockResolvedValue({
      data: {
        scarcesAppStats: [{ appId: 'quiet', lastActivityTimestamp: null }],
      },
    });
    await expect(fetchActiveHubsDirectory()).resolves.toEqual([]);
    expect(graphql).toHaveBeenCalledTimes(1);
  });

  it('keeps scanning until the category has movers', async () => {
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
          return {
            data: {
              scarcesAppStats: [
                { appId: 'music-hub', lastActivityTimestamp: 40 },
                { appId: 'idle-hub', lastActivityTimestamp: 0 },
              ],
            },
          };
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

    const apps = await fetchActiveHubsDirectory({
      limit: 24,
      category: 'music',
    });
    expect(apps.map((app) => app.appId)).toEqual(['music-hub']);
    const statsCalls = graphql.mock.calls.filter((call) =>
      String(call[0]?.query ?? '').includes('scarcesAppStats')
    );
    expect(statsCalls).toHaveLength(2);
    expect(statsCalls[1]?.[0]?.variables?.offset).toBe(48);
  });
});
