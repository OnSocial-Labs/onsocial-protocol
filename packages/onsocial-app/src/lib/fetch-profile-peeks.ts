import { cache } from 'react';
import type { PostRow } from '@onsocial/sdk';
import { createServerOnSocialClient } from '@/lib/create-server-onsocial-client';
import { parsePostContentLabels } from '@/lib/post-content-labels';
import { parsePostPollEmbed, parsePostText } from '@/lib/post-display';
import { parsePostMedia } from '@/lib/post-media';
import { isQuoteRefType, isRepostRefType } from '@/lib/post-relation';
import { collectionIdFromTokenId } from '@/features/market/market-listings';
import { marketMediumLabel } from '@/features/market/market-medium';
import {
  holdingsActionLabel,
  holdingsHrefForOwned,
} from '@/lib/portfolio-holdings';
import { APP_COLLECTIBLES_PATH } from '@/lib/app-routes';

/** Visible Launch highlights after featured-first order. */
export const PAGE_DRAWER_POST_HIGHLIGHT = 3;
/** Recent pool so featured pins can lead even when they are not the latest 3. */
export const PAGE_DRAWER_POST_PEEK = 8;
/** Public Created rail — recent editions this account minted. */
export const PAGE_DRAWER_CREATED_PEEK = 6;

export interface ProfilePostPeek {
  accountId: string;
  postId: string;
  text: string;
  blockTimestamp: number;
  kind: string | null;
  /** First two poll options when this peek is a poll. */
  pollOptions?: string[];
  /** First attachment — small thumb on the peek card. */
  media?: { url: string; mime: string } | null;
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
  /** Read / Play / Open — same verbs as Collectibles. */
  actionLabel: string;
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

function mediumKindFromScarceRow(row: ScarceMintRow): string | null {
  if (!row.extraData) return null;
  try {
    const extra = JSON.parse(row.extraData) as { kind?: unknown };
    if (typeof extra.kind === 'string' && extra.kind.trim()) {
      return extra.kind.trim().toLowerCase();
    }
  } catch {
    // ignore
  }
  return null;
}

function kindFromScarceRow(row: ScarceMintRow): string | null {
  return marketMediumLabel(mediumKindFromScarceRow(row));
}

function isQuotePost(
  post: Pick<PostRow, 'refType' | 'refPath' | 'parentPath'>
): boolean {
  if (isQuoteRefType(post.refType)) return true;
  if (isRepostRefType(post.refType) || post.parentPath) return false;
  // Optimistic quotes ship `refType: 'post'` + refPath before the indexer
  // writes `quote`.
  return Boolean(post.refPath?.trim());
}

function isClosedPoll(
  poll: { closesAt?: number } | null,
  nowMs: number
): boolean {
  return poll?.closesAt != null && poll.closesAt <= nowMs;
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

export function toProfilePostPeek(
  post: PostRow,
  nowMs: number = Date.now()
): ProfilePostPeek {
  const labels = parsePostContentLabels(post.value);
  const firstMedia = parsePostMedia(post.value)[0];
  const poll = parsePostPollEmbed(post.value);
  const quoted = isQuotePost(post);
  const kind = quoted
    ? 'quote'
    : poll
      ? isClosedPoll(poll, nowMs)
        ? 'closed'
        : 'poll'
      : post.kind && post.kind !== 'text'
        ? post.kind
        : null;
  const text =
    truncatePeekText(parsePostText(post.value)) ||
    (poll ? truncatePeekText(poll.question) : '');
  return {
    accountId: post.accountId,
    postId: post.postId,
    text,
    blockTimestamp: Number(post.blockTimestamp) || 0,
    kind,
    ...(poll ? { pollOptions: poll.options.slice(0, 2) } : {}),
    media: firstMedia ? { url: firstMedia.url, mime: firstMedia.mime } : null,
    ...labels,
  };
}

/** Peek rail needs copy, media, poll, or a Safe-mode label. Bare reposts have none. */
export function isDisplayablePostPeek(
  peek: Pick<
    ProfilePostPeek,
    'text' | 'media' | 'nsfw' | 'contentWarning' | 'pollOptions'
  >
): boolean {
  return (
    Boolean(peek.text) ||
    Boolean(peek.media) ||
    Boolean(peek.pollOptions && peek.pollOptions.length > 0) ||
    Boolean(peek.nsfw) ||
    Boolean(peek.contentWarning)
  );
}

export function toProfileCreatedPeek(
  row: ScarceMintRow
): ProfileCreatedPeek | null {
  const tokenId = row.tokenId?.trim();
  if (!tokenId) {
    return null;
  }
  const mediumKind = mediumKindFromScarceRow(row);
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
        mediumKind,
      }) ?? APP_COLLECTIBLES_PATH,
    kindLabel: kindFromScarceRow(row),
    actionLabel: holdingsActionLabel(mediumKind),
  };
}

export const fetchProfilePostPeeks = cache(
  async (
    accountId: string,
    limit = PAGE_DRAWER_POST_PEEK
  ): Promise<ProfilePostPeek[]> => {
    try {
      const os = createServerOnSocialClient();
      // Roots only — bare repost shells have no text and used to empty the
      // rail even when older posts exist. Widen the window, then take `limit`.
      const page = await os.query.feed.recent({
        author: accountId,
        limit: Math.max(limit * 3, 24),
        section: 'posts',
      });
      const peeks: ProfilePostPeek[] = [];
      for (const row of page.items) {
        const peek = toProfilePostPeek(row);
        if (!isDisplayablePostPeek(peek)) continue;
        peeks.push(peek);
        if (peeks.length >= limit) break;
      }
      return peeks;
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
