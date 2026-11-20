import type { PostRow } from '@onsocial/sdk';
import type { PostQuotesPageData } from '@/lib/load-post-quotes-page';
import type { PostEngagement } from '@/hooks/use-post-engagement';
import { postKey } from '@/lib/post-display';
import {
  readGuildThreadSession,
  readThreadSession,
} from '@/lib/thread-session-cache';

/** Match `POST_QUOTES_PAGE_SIZE` / `THREAD_QUOTE_PAGE_SIZE` — keep as a leaf so
 * this cache never value-imports SSR loaders (circular TDZ on post pages). */
const QUOTES_SESSION_PAGE_SIZE = 12;

export interface QuotesSessionSnapshot extends PostQuotesPageData {
  fetchedAt: number;
}

/*
 * Stale-while-revalidate quotes store — same SPA lifetime as thread session.
 * Opening View quotes from a thread that already fetched quotes paints the
 * list immediately; a dedicated write from the quotes panel keeps reposters
 * for reopen.
 */
const MAX_ENTRIES = 15;
const cache = new Map<string, QuotesSessionSnapshot>();

function contentPath(accountId: string, postId: string, groupId?: string | null) {
  const account = accountId.trim();
  const id = postId.trim();
  if (!account || !id) return '';
  const group = groupId?.trim();
  return group
    ? `${account}/groups/${group}/content/post/${id}`
    : `${account}/post/${id}`;
}

export function readQuotesSession(
  rootPath: string
): QuotesSessionSnapshot | null {
  const path = rootPath.trim();
  if (!path) return null;
  const hit = cache.get(path);
  if (!hit) return null;
  cache.delete(path);
  cache.set(path, hit);
  return hit;
}

export function writeQuotesSession(
  rootPath: string,
  data: PostQuotesPageData
): void {
  const path = rootPath.trim();
  if (!path) return;
  cache.delete(path);
  cache.set(path, { ...data, fetchedAt: Date.now() });
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest == null) break;
    cache.delete(oldest);
  }
}

export function invalidateQuotesSession(rootPath: string): void {
  cache.delete(rootPath.trim());
}

/**
 * Prefer a dedicated quotes snapshot; fall back to thread-session quotes
 * already fetched on the open thread (reposters empty until quotes refresh).
 * Optional `root` paints the quotes shell immediately when both caches miss.
 */
export function seedQuotesFromSession(input: {
  accountId: string;
  postId: string;
  groupId?: string | null;
  root?: PostRow | null;
  rootEngagement?: PostEngagement | null;
}): PostQuotesPageData | null {
  const path = contentPath(input.accountId, input.postId, input.groupId);
  if (!path) return null;
  const dedicated = readQuotesSession(path);
  if (dedicated) {
    const { fetchedAt: _fetchedAt, ...data } = dedicated;
    return data;
  }
  const thread = input.groupId
    ? readGuildThreadSession(path)
    : readThreadSession(path);
  if (thread?.root) {
    return {
      root: thread.root,
      quotes: thread.quotes ?? [],
      reposters: [],
      hasMoreQuotes: (thread.quotes?.length ?? 0) >= QUOTES_SESSION_PAGE_SIZE,
      hasMoreReposters: false,
      engagement: thread.engagement ?? {},
      scarceEmbeds: thread.scarceEmbeds ?? {},
    };
  }
  if (!input.root) return null;
  return {
    root: input.root,
    quotes: [],
    reposters: [],
    hasMoreQuotes: false,
    hasMoreReposters: false,
    engagement: input.rootEngagement
      ? { [postKey(input.root)]: input.rootEngagement }
      : {},
    scarceEmbeds: {},
  };
}

/** Test hook — module state must not leak between specs. */
export function clearQuotesSessionCache(): void {
  cache.clear();
}
