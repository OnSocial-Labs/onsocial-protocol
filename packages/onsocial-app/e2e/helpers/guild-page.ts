import type { Page } from '@playwright/test';

export const GUILD_E2E_ID = 'audit-guild';
export const GUILD_E2E_TITLE = 'Audit Guild';
/** Stored name embeds a raw id so the hero must clean it. */
export const GUILD_E2E_STORED_NAME = `${GUILD_E2E_TITLE} grp_md_perm_1779813274071_ojf237`;
export const GUILD_E2E_OWNER = 'alice.near';
export const GUILD_E2E_PATH = `/groups/${encodeURIComponent(GUILD_E2E_ID)}`;
export const GUILD_E2E_EMPTY_FEED = 'No guild posts yet.';

const CREATED_AT_NS = 1_700_000_000_000_000_000;

function groupCurrentRow(opts?: { ownerId?: string }) {
  return {
    groupId: GUILD_E2E_ID,
    ownerId: opts?.ownerId ?? GUILD_E2E_OWNER,
    groupName: GUILD_E2E_STORED_NAME,
    groupDescription: 'A stub guild for e2e.',
    groupBannerCid: null,
    groupBadgeCid: null,
    isPublic: true,
    isMemberDriven: false,
    groupTopics: ['builders'],
    blockHeight: 1,
    blockTimestamp: 1,
  };
}

function memberRow(opts: {
  memberId: string;
  isOwner?: boolean;
  isAdmin?: boolean;
  canModerate?: boolean;
}) {
  return {
    groupId: GUILD_E2E_ID,
    memberId: opts.memberId,
    role: opts.isOwner ? 'owner' : opts.isAdmin ? 'admin' : 'member',
    level: opts.isOwner ? 3 : opts.isAdmin ? 2 : 1,
    isOwner: Boolean(opts.isOwner),
    isAdmin: Boolean(opts.isAdmin),
    canModerate: Boolean(opts.canModerate || opts.isOwner || opts.isAdmin),
    blockHeight: 1,
    blockTimestamp: 1,
  };
}

function groupConfig(opts?: { ownerId?: string }) {
  const ownerId = opts?.ownerId ?? GUILD_E2E_OWNER;
  return {
    name: GUILD_E2E_STORED_NAME,
    description: 'A stub guild for e2e.',
    owner: ownerId,
    isPublic: true,
    memberDriven: false,
    topics: ['builders'],
    x: {
      onsocial: {
        structure: {
          v: 1,
          defaultSpaceId: 'general',
          spaces: [
            {
              id: 'general',
              title: 'General',
              kind: 'discussion',
              enabled: true,
              order: 0,
              audience: 'members',
              postPolicy: 'members',
            },
          ],
        },
      },
    },
  };
}

function json(data: unknown) {
  return {
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(data),
  };
}

/**
 * Browser GraphQL + group data views for guild page settle.
 * SSR still misses a synthetic id in this env.
 */
export async function stubGuildPage(
  page: Page,
  opts?: {
    rows?: 'empty' | 'missing';
    catalogDelayMs?: number;
    /** Indexer + RPC owner. Staff chrome when this is the seeded wallet. */
    ownerId?: string;
    /** Seeded wallet is a member (not owner) when this is set. */
    memberId?: string;
  }
): Promise<void> {
  const rows = opts?.rows ?? 'empty';
  const catalogDelayMs = opts?.catalogDelayMs ?? 0;
  const ownerId = opts?.ownerId?.trim() || GUILD_E2E_OWNER;
  const memberId = opts?.memberId?.trim() || null;
  const missing = rows === 'missing';

  await page.route('**/api/onapi/graph/query', async (route) => {
    const raw = route.request().postData() ?? '';
    let query = '';
    try {
      query = String((JSON.parse(raw) as { query?: string }).query ?? '');
    } catch {
      query = raw;
    }

    const delayIfShell = async () => {
      if (catalogDelayMs > 0 && query.includes('GroupsByIds')) {
        await new Promise((resolve) => setTimeout(resolve, catalogDelayMs));
      }
    };

    if (query.includes('GroupsByIds')) {
      await delayIfShell();
      await route.fulfill(
        json({
          data: { groupsCurrent: missing ? [] : [groupCurrentRow({ ownerId })] },
        })
      );
      return;
    }

    if (query.includes('GroupFeed') || query.includes('FilteredGroupFeed')) {
      await route.fulfill(json({ data: { postsCurrent: [] } }));
      return;
    }

    if (query.includes('GroupMembershipFor')) {
      const viewerId = memberId ?? (opts?.ownerId ? ownerId : null);
      await route.fulfill(
        json({
          data: {
            groupMembersCurrent:
              !missing && viewerId
                ? [
                    memberRow({
                      memberId: viewerId,
                      isOwner: viewerId === ownerId,
                      isAdmin: viewerId === ownerId,
                      canModerate: viewerId === ownerId,
                    }),
                  ]
                : [],
          },
        })
      );
      return;
    }

    if (query.includes('GroupBannedOf')) {
      await route.fulfill(json({ data: { groupBlacklistCurrent: [] } }));
      return;
    }

    if (query.includes('GroupMembersOf')) {
      await route.fulfill(
        json({
          data: {
            groupMembersCurrent: missing
              ? []
              : [
                  memberRow({
                    memberId: ownerId,
                    isOwner: true,
                    isAdmin: true,
                    canModerate: true,
                  }),
                  ...(memberId && memberId !== ownerId
                    ? [memberRow({ memberId })]
                    : []),
                ],
          },
        })
      );
      return;
    }

    if (query.includes('GroupMemberCounts')) {
      await route.fulfill(
        json({
          data: {
            groupMemberCounts: missing
              ? []
              : [
                  {
                    groupId: GUILD_E2E_ID,
                    memberCount: memberId && memberId !== ownerId ? 2 : 1,
                  },
                ],
          },
        })
      );
      return;
    }

    if (query.includes('GroupPostCount')) {
      await route.fulfill(
        json({
          data: { postsCurrentAggregate: { aggregate: { count: 0 } } },
        })
      );
      return;
    }

    if (query.includes('ProfileStatsBatch') || query.includes('ProfileKinds')) {
      await route.fulfill(
        json({ data: { profileSearch: [], profileKinds: [] } })
      );
      return;
    }

    await route.continue();
  });

  await page.route('**/api/onapi/data/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const userId =
      url.searchParams.get('userId') ??
      url.searchParams.get('memberId') ??
      url.searchParams.get('requesterId') ??
      '';
    const isOwnerViewer = Boolean(userId) && userId === ownerId;
    const isMemberViewer =
      Boolean(userId) &&
      (userId === ownerId || (memberId != null && userId === memberId));

    if (path.endsWith('/data/group-config')) {
      await route.fulfill(json(missing ? null : groupConfig({ ownerId })));
      return;
    }
    if (path.endsWith('/data/group-stats')) {
      await route.fulfill(
        json(
          missing
            ? null
            : {
                total_members: memberId && memberId !== ownerId ? 2 : 1,
                created_at: String(CREATED_AT_NS),
              }
        )
      );
      return;
    }
    if (path.endsWith('/data/group-is-member')) {
      await route.fulfill(json(isMemberViewer));
      return;
    }
    if (path.endsWith('/data/group-is-owner')) {
      await route.fulfill(json(isOwnerViewer));
      return;
    }
    if (path.endsWith('/data/has-group-admin')) {
      await route.fulfill(json(isOwnerViewer));
      return;
    }
    if (path.endsWith('/data/has-group-moderate')) {
      await route.fulfill(json(isOwnerViewer));
      return;
    }
    if (path.endsWith('/data/group-join-request')) {
      await route.fulfill(json(null));
      return;
    }
    if (path.endsWith('/data/proposals')) {
      await route.fulfill(json([]));
      return;
    }
    if (path.endsWith('/data/proposal-count')) {
      await route.fulfill(json(0));
      return;
    }

    await route.continue();
  });
}
