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
      return {
        accountId: id,
        counts,
        received: await enrichList(receivedItems, profiles, mediaUrl),
        given: await enrichList(givenItems, profiles, mediaUrl),
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
    const enriched = await enrichList(items);
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
