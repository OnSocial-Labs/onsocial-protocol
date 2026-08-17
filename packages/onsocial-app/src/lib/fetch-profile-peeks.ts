import { cache } from 'react';
import type { PostRow } from '@onsocial/sdk';
import { createServerOnSocialClient } from '@/lib/create-server-onsocial-client';
import { parsePostContentLabels } from '@/lib/post-content-labels';
import { parsePostText } from '@/lib/post-display';
import { collectionIdFromTokenId } from '@/features/market/market-listings';
import { marketMediumLabel } from '@/features/market/market-medium';
import { holdingsHrefForOwned } from '@/lib/portfolio-holdings';
import { APP_COLLECTIBLES_PATH } from '@/lib/app-routes';

export const PAGE_DRAWER_POST_PEEK = 3;
/** Public Created rail — recent editions this account minted. */
export const PAGE_DRAWER_CREATED_PEEK = 6;

export interface ProfilePostPeek {
  accountId: string;
  postId: string;
  text: string;
  blockTimestamp: number;
  kind: string | null;
  contentWarning?: string;
  nsfw?: boolean;
}

/** Minted-by peek for the public Created drawer section. */
export interface ProfileCreatedPeek {
  tokenId: string;
  title: string;
  mediaUrl: string | null;
  blockTimestamp: number;
  href: string;
  /** Medium badge when `extra.kind` is known. */
  kindLabel: string | null;
}

/** Mint-event fields used for Created peeks (SDK `ScarcesEventRow`). */
interface ScarceMintRow {
  tokenId?: string | null;
  memo?: string | null;
  extraData?: string | null;
  blockTimestamp?: number | string | null;
}

function truncatePeekText(text: string, max = 140): string {
  const trimmed = text.trim().replace(/\s+/g, ' ');
  if (trimmed.length <= max) {
    return trimmed;
  }
  return `${trimmed.slice(0, max - 1).trimEnd()}…`;
}

function titleFromScarceRow(row: ScarceMintRow): string {
  if (row.memo?.trim()) {
    return row.memo.trim();
  }
  if (row.extraData) {
    try {
      const extra = JSON.parse(row.extraData) as {
        title?: unknown;
        name?: unknown;
      };
      if (typeof extra.title === 'string' && extra.title.trim()) {
        return extra.title.trim();
      }
      if (typeof extra.name === 'string' && extra.name.trim()) {
        return extra.name.trim();
      }
    } catch {
      // fall through
    }
  }
  return row.tokenId?.trim() || 'Scarce';
}

function mediaFromScarceRow(row: ScarceMintRow): string | null {
  if (!row.extraData) {
    return null;
  }
  try {
    const extra = JSON.parse(row.extraData) as {
      media?: unknown;
      image?: unknown;
      mediaUrl?: unknown;
    };
    for (const value of [extra.media, extra.mediaUrl, extra.image]) {
      if (typeof value === 'string' && /^https?:\/\//i.test(value.trim())) {
        return value.trim();
      }
    }
  } catch {
    // ignore
  }
  return null;
}

function kindFromScarceRow(row: ScarceMintRow): string | null {
  if (!row.extraData) return null;
  try {
    const extra = JSON.parse(row.extraData) as { kind?: unknown };
    if (typeof extra.kind === 'string' && extra.kind.trim()) {
      return marketMediumLabel(extra.kind);
    }
  } catch {
    // ignore
  }
  return null;
}

function sourcePostPathFromScarceRow(row: ScarceMintRow): string | undefined {
  if (!row.extraData) return undefined;
  try {
    const extra = JSON.parse(row.extraData) as {
      sourcePost?: { path?: unknown };
      sourcePostPath?: unknown;
      postPath?: unknown;
    };
    const nested =
      typeof extra.sourcePost?.path === 'string'
        ? extra.sourcePost.path.trim()
        : '';
    if (nested) return nested;
    for (const value of [extra.sourcePostPath, extra.postPath]) {
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
  } catch {
    // ignore
  }
  return undefined;
}

export function toProfilePostPeek(post: PostRow): ProfilePostPeek {
  const labels = parsePostContentLabels(post.value);
  return {
    accountId: post.accountId,
    postId: post.postId,
    text: truncatePeekText(parsePostText(post.value)),
    blockTimestamp: Number(post.blockTimestamp) || 0,
    kind: post.kind && post.kind !== 'text' ? post.kind : null,
    ...labels,
  };
}

export function toProfileCreatedPeek(
  row: ScarceMintRow
): ProfileCreatedPeek | null {
  const tokenId = row.tokenId?.trim();
  if (!tokenId) {
    return null;
  }
  return {
    tokenId,
    title: titleFromScarceRow(row),
    mediaUrl: mediaFromScarceRow(row),
    blockTimestamp: Number(row.blockTimestamp) || 0,
    href:
      holdingsHrefForOwned({
        tokenId,
        collectionId: collectionIdFromTokenId(tokenId),
        sourcePostPath: sourcePostPathFromScarceRow(row),
      }) ?? APP_COLLECTIBLES_PATH,
    kindLabel: kindFromScarceRow(row),
  };
}

export const fetchProfilePostPeeks = cache(
  async (
    accountId: string,
    limit = PAGE_DRAWER_POST_PEEK
  ): Promise<ProfilePostPeek[]> => {
    try {
      const os = createServerOnSocialClient();
      const page = await os.query.feed.recent({
        author: accountId,
        limit,
      });
      return page.items
        .map(toProfilePostPeek)
        .filter(
          (post) =>
            Boolean(post.text) ||
            Boolean(post.nsfw) ||
            Boolean(post.contentWarning)
        );
    } catch {
      return [];
    }
  }
);

/** Recent editions minted by this account — public Created shelf. */
export const fetchProfileCreatedPeeks = cache(
  async (
    accountId: string,
    limit = PAGE_DRAWER_CREATED_PEEK
  ): Promise<ProfileCreatedPeek[]> => {
    try {
      const os = createServerOnSocialClient();
      const mints = await os.query.scarces.mintsBy(accountId, {
        limit: Math.max(limit * 2, 12),
      });
      const seen = new Set<string>();
      const peeks: ProfileCreatedPeek[] = [];
      for (const row of mints) {
        const peek = toProfileCreatedPeek(row);
        if (!peek || seen.has(peek.tokenId)) {
          continue;
        }
        seen.add(peek.tokenId);
        peeks.push(peek);
        if (peeks.length >= limit) {
          break;
        }
      }
      return peeks;
    } catch {
      return [];
    }
  }
);

/** Full recent posts for the account feed panel. */
export const fetchProfileRecentPosts = cache(
  async (accountId: string, limit = 24): Promise<PostRow[]> => {
    try {
      const os = createServerOnSocialClient();
      const page = await os.query.feed.recent({
        author: accountId,
        limit,
      });
      return page.items;
    } catch {
      return [];
    }
  }
);
