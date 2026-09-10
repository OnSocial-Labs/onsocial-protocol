import type { Page } from '@playwright/test';
import {
  E2E_GUILD_ID,
  E2E_GUILD_OWNER,
  E2E_GUILD_STORED_NAME,
  E2E_GUILD_TITLE,
  e2eGuildBannedRows,
  e2eGuildCurrentRows,
  e2eGuildMemberCountRows,
  e2eGuildMemberRows,
  e2eGuildMembershipRows,
  type E2eGraphGuild,
} from '../../src/lib/e2e-graph-stubs';

export const GUILD_E2E_ID = E2E_GUILD_ID;
export const GUILD_E2E_TITLE = E2E_GUILD_TITLE;
/** Stored name embeds a raw id so the hero must clean it. */
export const GUILD_E2E_STORED_NAME = E2E_GUILD_STORED_NAME;
export const GUILD_E2E_OWNER = E2E_GUILD_OWNER;
export const GUILD_E2E_PATH = `/groups/${encodeURIComponent(GUILD_E2E_ID)}`;
export const GUILD_E2E_EMPTY_FEED = 'No guild posts yet.';
export const GUILD_E2E_BANNED_HINT =
  "This guild banned you. You can't join or post.";
export const GUILD_E2E_FEED_TEXT = 'Guild update from Alice.';

const STUB_GUILD_POST = {
  accountId: 'alice.testnet',
  postId: 'guild-loading',
  value: JSON.stringify({ text: GUILD_E2E_FEED_TEXT }),
  blockHeight: 1,
  blockTimestamp: 1_700_000_000_000,
  receiptId: 'guild-loading-e2e',
  isGroupContent: true,
  groupId: E2E_GUILD_ID,
};
export const GUILD_E2E_FEED_ROWS = [STUB_GUILD_POST];

const CREATED_AT_NS = 1_700_000_000_000_000_000;

function guildFixture(opts?: {
  rows?: 'empty' | 'missing';
  ownerId?: string;
  memberId?: string;
  bannedId?: string;
}): E2eGraphGuild {
  if (opts?.rows === 'missing') return 'missing';
  if (opts?.bannedId) return 'banned';
  if (opts?.ownerId) return 'owner';
  if (opts?.memberId) return 'member';
  return 'empty';
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
 * Pair with `setE2eGraphGuild` for SSR. Omit the cookie for the SSR-miss
 * skeleton test. Viewer/ACL still depends on these data-view stubs.
 */
export async function stubGuildPage(
  page: Page,
  opts?: {
    rows?: 'empty' | 'missing';
    catalogDelayMs?: number;
    feedDelayMs?: number;
    feedRefreshDelayMs?: number;
    feedErrorOnce?: boolean;
    feedRows?: readonly unknown[];
    /** Indexer + RPC owner. Staff chrome when this is the seeded wallet. */
    ownerId?: string;
    /** Seeded wallet is a member (not owner) when this is set. */
    memberId?: string;
    /** Seeded wallet is banned (not a member) when this is set. */
    bannedId?: string;
  }
): Promise<void> {
  const rows = opts?.rows ?? 'empty';
  const catalogDelayMs = opts?.catalogDelayMs ?? 0;
  const feedDelayMs = opts?.feedDelayMs ?? 0;
  const feedRefreshDelayMs = opts?.feedRefreshDelayMs ?? 0;
  const feedRows = opts?.feedRows ?? [];
  let feedCallCount = 0;
  const ownerId = opts?.ownerId?.trim() || GUILD_E2E_OWNER;
  const memberId = opts?.memberId?.trim() || null;
  const bannedId = opts?.bannedId?.trim() || null;
  const missing = rows === 'missing';
  const guild = guildFixture(opts);

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
          data: { groupsCurrent: e2eGuildCurrentRows(guild) },
        })
      );
      return;
    }

    if (query.includes('GroupFeed') || query.includes('FilteredGroupFeed')) {
      feedCallCount += 1;
      const delayMs = feedCallCount > 1 ? feedRefreshDelayMs : feedDelayMs;
      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
      if (opts?.feedErrorOnce && feedCallCount > 1) {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Guild feed unavailable' }),
        });
        return;
      }
      await route.fulfill(json({ data: { postsCurrent: feedRows } }));
      return;
    }

    if (query.includes('GroupMembershipFor')) {
      const viewerId = memberId ?? (opts?.ownerId ? ownerId : null);
      await route.fulfill(
        json({
          data: {
            groupMembersCurrent: e2eGuildMembershipRows(
              guild,
              viewerId ?? undefined
            ),
          },
        })
      );
      return;
    }

    if (query.includes('GroupBannedOf')) {
      await route.fulfill(
        json({
          data: { groupBlacklistCurrent: e2eGuildBannedRows(guild) },
        })
      );
      return;
    }

    if (query.includes('GroupMembersOf')) {
      await route.fulfill(
        json({
          data: { groupMembersCurrent: e2eGuildMemberRows(guild) },
        })
      );
      return;
    }

    if (query.includes('GroupMemberCounts')) {
      await route.fulfill(
        json({
          data: { groupMemberCounts: e2eGuildMemberCountRows(guild) },
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
    const isBannedViewer = Boolean(userId) && bannedId != null && userId === bannedId;
    const isMemberViewer =
      Boolean(userId) &&
      !isBannedViewer &&
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
    if (path.endsWith('/data/group-is-blacklisted')) {
      await route.fulfill(json(isBannedViewer));
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
