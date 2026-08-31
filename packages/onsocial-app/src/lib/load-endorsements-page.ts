import { cache } from 'react';
import type { EndorsementListItem, ProfileSearchRow } from '@onsocial/sdk';
import type {
  EndorsementPanelItem,
  EndorsementsMode,
  EndorsementsModePageResponse,
  EndorsementsPanelResponse,
} from '@/lib/endorsements-panel-data';
import { ENDORSEMENTS_PAGE_SIZE } from '@/lib/endorsements-panel-data';
import {
  parseEndorsementMediaRef,
  resolveEndorsementDisplayMediaUrl,
} from '@/lib/endorsement-media';
import { createAppOnSocialClient } from '@/lib/profile-social-server';
import {
  endorsementFocusMatchesPage,
  expandEndorsementFocus,
  matchEndorsementFocusItem,
} from '@/lib/endorsement-focus';
import type { PortfolioEndorsementFocus } from '@/lib/overlay-routes';
import { resolveEndorsementSpendTargetId } from '@/lib/social-spend-endorsement';

function profileMap(rows: ProfileSearchRow[]): Map<string, ProfileSearchRow> {
  return new Map(rows.map((row) => [row.accountId, row]));
}

export function enrichEndorsementItem(
  item: EndorsementListItem,
  profiles: Map<string, ProfileSearchRow>,
  mediaUrlResolver?: (cid: string) => string
): EndorsementPanelItem {
  const issuer = profiles.get(item.issuer);
  const target = profiles.get(item.target);
  const media = parseEndorsementMediaRef(item.media);
  const mediaUrl = media
    ? (mediaUrlResolver?.(media.cid) ??
      resolveEndorsementDisplayMediaUrl({ media }))
    : null;
  return {
    ...item,
    issuerName: issuer?.name ?? null,
    issuerAvatarUrl: issuer?.avatar ?? null,
    targetName: target?.name ?? null,
    targetAvatarUrl: target?.avatar ?? null,
    mediaUrl,
  };
}

async function enrichList(
  items: EndorsementListItem[],
  profiles?: Map<string, ProfileSearchRow>,
  mediaUrlResolver?: (cid: string) => string
): Promise<EndorsementPanelItem[]> {
  if (items.length === 0) return [];
  const os = profiles ? null : createAppOnSocialClient();
  const map =
    profiles ??
    profileMap(
      await os!
        .query.profiles.statsForAccounts([
          ...new Set(items.flatMap((item) => [item.issuer, item.target])),
        ])
        .catch(() => [])
    );
  const resolveUrl =
    mediaUrlResolver ??
    (os ? (cid: string) => os.storage.url(cid) : undefined);
  return items.map((item) => enrichEndorsementItem(item, map, resolveUrl));
}

async function attachEndorsementSupportCounts(
  items: EndorsementPanelItem[]
): Promise<EndorsementPanelItem[]> {
  if (items.length === 0) return items;
  const ids = [
    ...new Set(
      items
        .map((item) =>
          resolveEndorsementSpendTargetId({
            id: typeof item.id === 'string' ? item.id : null,
            issuer: item.issuer,
            target: item.target,
            topic: item.topic,
          })
        )
        .filter((id): id is string => Boolean(id))
    ),
  ];
  if (ids.length === 0) return items;

  try {
    const os = createAppOnSocialClient();
    const summaries = await os.query.socialSpend.endorsementSupportSummaries(
      ids,
      { previewLimit: 0 }
    );
    const byKey = new Map(
      Object.entries(summaries).map(([id, summary]) => [
        id.toLowerCase(),
        summary.supporterCount,
      ])
    );
    return items.map((item) => {
      const spendId = resolveEndorsementSpendTargetId({
        id: typeof item.id === 'string' ? item.id : null,
        issuer: item.issuer,
        target: item.target,
        topic: item.topic,
      });
      if (!spendId) return item;
      const supporterCount = byKey.get(spendId.toLowerCase());
      return supporterCount == null ? item : { ...item, supporterCount };
    });
  } catch {
    return items;
  }
}

/** SSR endorsements shell — counts + both rails (enriched). */
export const loadEndorsementsPageData = cache(
  async (accountId: string): Promise<EndorsementsPanelResponse | null> => {
    const id = accountId.trim();
    if (!id) return null;
    try {
      const os = createAppOnSocialClient();
      const [counts, receivedItems, givenItems] = await Promise.all([
        os.endorsements.counts(id),
        os.endorsements.listReceived(id, { limit: ENDORSEMENTS_PAGE_SIZE }),
        os.endorsements.listGiven(id, { limit: ENDORSEMENTS_PAGE_SIZE }),
      ]);
      const participantIds = [
        ...new Set(
          [...receivedItems, ...givenItems].flatMap((item) => [
            item.issuer,
            item.target,
          ])
        ),
      ];
      const profiles = profileMap(
        participantIds.length > 0
          ? await os.query.profiles
              .statsForAccounts(participantIds)
              .catch(() => [])
          : []
      );
      const mediaUrl = (cid: string) => os.storage.url(cid);
      const [received, given] = await Promise.all([
        enrichList(receivedItems, profiles, mediaUrl),
        enrichList(givenItems, profiles, mediaUrl),
      ]);
      const withSupport = await attachEndorsementSupportCounts([
        ...received,
        ...given,
      ]);
      return {
        accountId: id,
        counts,
        received: withSupport.slice(0, received.length),
        given: withSupport.slice(received.length),
        receivedHasMore: receivedItems.length >= ENDORSEMENTS_PAGE_SIZE,
        givenHasMore: givenItems.length >= ENDORSEMENTS_PAGE_SIZE,
      };
    } catch {
      return null;
    }
  }
);

/** Paginated single-mode page for load-more. */
export async function loadEndorsementsModePage(
  accountId: string,
  mode: EndorsementsMode,
  opts: { limit?: number; offset?: number } = {}
): Promise<EndorsementsModePageResponse | null> {
  const id = accountId.trim();
  if (!id) return null;
  const limit = Math.min(
    Math.max(opts.limit ?? ENDORSEMENTS_PAGE_SIZE, 1),
    48
  );
  const offset = Math.max(opts.offset ?? 0, 0);
  try {
    const os = createAppOnSocialClient();
    const [counts, items] = await Promise.all([
      os.endorsements.counts(id),
      mode === 'received'
        ? os.endorsements.listReceived(id, { limit, offset })
        : os.endorsements.listGiven(id, { limit, offset }),
    ]);
    const enriched = await attachEndorsementSupportCounts(
      await enrichList(items)
    );
    const hasMore = items.length >= limit;
    return {
      accountId: id,
      mode,
      counts,
      items: enriched,
      hasMore,
      nextOffset: hasMore ? offset + items.length : null,
    };
  } catch {
    return null;
  }
}

export function parseEndorsementsMode(
  value: string | null | undefined
): EndorsementsMode | null {
  const trimmed = value?.trim().toLowerCase();
  if (trimmed === 'received' || trimmed === 'given') return trimmed;
  return null;
}

/** One vouch for the face focus sheet (`?endorsement=` / issuer + topic). */
export async function loadEndorsementFocus(
  pageAccountId: string,
  focus: PortfolioEndorsementFocus
): Promise<EndorsementPanelItem | null> {
  const id = pageAccountId.trim();
  if (!id || !endorsementFocusMatchesPage(id, focus)) return null;

  const expanded = expandEndorsementFocus(focus);
  try {
    const os = createAppOnSocialClient();
    const rows = expanded.issuer
      ? await os.endorsements.listFromViewerToTarget(expanded.issuer, id, {
          limit: 20,
        })
      : await os.endorsements.listReceived(id, { limit: 48 });
    const matched = matchEndorsementFocusItem(rows, focus);
    if (!matched) return null;
    const [item] = await attachEndorsementSupportCounts(
      await enrichList([matched])
    );
    return item ?? null;
  } catch {
    return null;
  }
}
