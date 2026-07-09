import { cache } from 'react';
import type { PostRow } from '@onsocial/sdk';
import { createServerOnSocialClient } from '@/lib/create-server-onsocial-client';
import { parsePostText } from '@/lib/post-display';

export const PAGE_DRAWER_POST_PEEK = 3;
export const PAGE_DRAWER_SCARCE_PEEK = 6;

/** Mint-event fields used for drawer peeks (SDK `ScarcesEventRow`). */
interface ScarceMintRow {
  tokenId?: string | null;
  memo?: string | null;
  extraData?: string | null;
  blockTimestamp?: number | string | null;
}

export interface ProfilePostPeek {
  accountId: string;
  postId: string;
  text: string;
  blockTimestamp: number;
  kind: string | null;
}

export interface ProfileScarcePeek {
  tokenId: string;
  title: string;
  mediaUrl: string | null;
  blockTimestamp: number;
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

export function toProfilePostPeek(post: PostRow): ProfilePostPeek {
  return {
    accountId: post.accountId,
    postId: post.postId,
    text: truncatePeekText(parsePostText(post.value)),
    blockTimestamp: Number(post.blockTimestamp) || 0,
    kind: post.kind && post.kind !== 'text' ? post.kind : null,
  };
}

export function toProfileScarcePeek(row: ScarceMintRow): ProfileScarcePeek | null {
  const tokenId = row.tokenId?.trim();
  if (!tokenId) {
    return null;
  }
  return {
    tokenId,
    title: titleFromScarceRow(row),
    mediaUrl: mediaFromScarceRow(row),
    blockTimestamp: Number(row.blockTimestamp) || 0,
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
      return page.items.map(toProfilePostPeek).filter((post) => post.text);
    } catch {
      return [];
    }
  }
);

export const fetchProfileScarcePeeks = cache(
  async (
    accountId: string,
    limit = PAGE_DRAWER_SCARCE_PEEK
  ): Promise<ProfileScarcePeek[]> => {
    try {
      const os = createServerOnSocialClient();
      const mints = await os.query.scarces.mintsBy(accountId, {
        limit: Math.max(limit * 2, 12),
      });
      const seen = new Set<string>();
      const peeks: ProfileScarcePeek[] = [];
      for (const row of mints) {
        const peek = toProfileScarcePeek(row);
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
