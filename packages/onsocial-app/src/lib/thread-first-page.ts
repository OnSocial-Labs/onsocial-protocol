import { postContentPath, type PostRow, type ThreadNode } from '@onsocial/sdk';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import { invalidateQuotesSession } from '@/lib/quotes-session-cache';
import { leafThreadNode } from '@/lib/thread-display';
import {
  invalidateGuildThreadSession,
  invalidateThreadSession,
} from '@/lib/thread-session-cache';

/**
 * Direct replies that fill the post sheet and the reply drawer.
 * The full tree still walks after this page is on screen.
 */
export const THREAD_REPLY_FIRST_PAGE = 12;

const SETTLED_MAX = 15;

export type ThreadFirstPage = {
  replies: PostRow[];
  hasMore: boolean;
};

export function directReplyPageHasMore(
  count: number,
  pageSize = THREAD_REPLY_FIRST_PAGE
): boolean {
  return count >= pageSize;
}

/**
 * A cached thread already shows replies. A paged list must not be replaced
 * by page one. A permalink that already fetched this page waits on the walk.
 */
export function shouldPaintDirectReplies(input: {
  fromCache: boolean;
  paginated: boolean;
  directRepliesResolved?: boolean;
}): boolean {
  return !input.fromCache && !input.paginated && !input.directRepliesResolved;
}

/**
 * Soft refresh must not replace quotes/reposters after load-more — a slow
 * first-page fetch would wipe appended rows. Foreground reload may replace.
 */
export function shouldReplacePaginatedList(input: {
  background: boolean;
  paginated: boolean;
}): boolean {
  if (input.paginated && input.background) return false;
  return true;
}

export function directRepliesToTree(replies: PostRow[]): ThreadNode[] {
  return replies.map((post) => leafThreadNode(post, postContentPath(post)));
}

/** Content paths for the direct-reply page passed to `visibleReplies`. */
export function visibleReplyPaths(replies: PostRow[]): string[] {
  const paths: string[] = [];
  for (const post of replies) {
    const path = postContentPath(post).trim();
    if (path) paths.push(path);
  }
  return paths;
}

/**
 * Attach the one visible reply under each direct reply that does not already
 * have children. A finished walk is left as it is.
 */
export function graftVisibleReplies(
  nodes: ThreadNode[],
  children: PostRow[]
): ThreadNode[] {
  const byParent = new Map<string, PostRow>();
  for (const child of children) {
    const parent = child.parentPath?.trim();
    if (!parent || byParent.has(parent)) continue;
    byParent.set(parent, child);
  }
  if (byParent.size === 0) return nodes;
  return nodes.map((node) => {
    if (node.replies.length > 0) return node;
    const child = byParent.get(node.path);
    if (!child) return node;
    return {
      ...node,
      replies: [leafThreadNode(child, postContentPath(child))],
    };
  });
}

/**
 * After the first direct page is on screen, the full walk must not replace
 * it — that reshuffles visible rows after appear. Keep painted order; attach
 * richer walked children under matching paths.
 */
export function enrichPaintedReplyTree(
  painted: ThreadNode[],
  walked: ThreadNode[]
): ThreadNode[] {
  if (painted.length === 0) return walked;
  if (walked.length === 0) return painted;
  const walkedByPath = new Map(walked.map((node) => [node.path, node]));
  return painted.map((node) => {
    const richer = walkedByPath.get(node.path);
    if (!richer || richer.replies.length === 0) return node;
    return { ...node, replies: richer.replies };
  });
}

export function threadContentPath(input: {
  accountId: string;
  postId: string;
  groupId?: string | null;
}): string {
  if (input.groupId) {
    return `${input.accountId}/groups/${input.groupId}/content/post/${input.postId}`;
  }
  return `${input.accountId}/post/${input.postId}`;
}

/**
 * Load-more cursor for ascending reply pages. Prefer the last confirmed
 * composite keyset (height + account + post); fall back to offset when only
 * optimistic rows (`blockHeight: 0`) sit at the tail.
 */
export function replyLoadMoreCursor(replies: readonly PostRow[]): {
  afterBlockHeight?: number;
  afterAccountId?: string;
  afterPostId?: string;
  offset?: number;
} {
  for (let index = replies.length - 1; index >= 0; index -= 1) {
    const row = replies[index];
    const height = row?.blockHeight;
    if (
      typeof height === 'number' &&
      height > 0 &&
      row.accountId &&
      row.postId
    ) {
      return {
        afterBlockHeight: height,
        afterAccountId: row.accountId,
        afterPostId: row.postId,
      };
    }
  }
  return { offset: replies.length };
}

/**
 * Descending quotes load-more — older than the last painted composite tip.
 */
export function quoteLoadMoreCursor(quotes: readonly PostRow[]): {
  beforeBlockHeight?: number;
  beforeAccountId?: string;
  beforePostId?: string;
  offset?: number;
} {
  for (let index = quotes.length - 1; index >= 0; index -= 1) {
    const row = quotes[index];
    const height = row?.blockHeight;
    if (
      typeof height === 'number' &&
      height > 0 &&
      row.accountId &&
      row.postId
    ) {
      return {
        beforeBlockHeight: height,
        beforeAccountId: row.accountId,
        beforePostId: row.postId,
      };
    }
  }
  return { offset: quotes.length };
}

/**
 * Descending reposters load-more — older than the last painted timestamp.
 */
export function reposterLoadMoreCursor(
  reposters: ReadonlyArray<{ blockTimestamp?: number | null }>
): {
  beforeBlockTimestamp?: number;
  offset?: number;
} {
  for (let index = reposters.length - 1; index >= 0; index -= 1) {
    const stamp = reposters[index]?.blockTimestamp;
    if (typeof stamp === 'number' && stamp > 0) {
      return { beforeBlockTimestamp: stamp };
    }
  }
  return { offset: reposters.length };
}

const inflight = new Map<string, Promise<ThreadFirstPage>>();
const settled = new Map<string, ThreadFirstPage>();

function rememberSettled(rootPath: string, page: ThreadFirstPage): void {
  settled.delete(rootPath);
  settled.set(rootPath, page);
  while (settled.size > SETTLED_MAX) {
    const oldest = settled.keys().next().value;
    if (oldest == null) break;
    settled.delete(oldest);
  }
}

async function fetchThreadFirstPage(
  rootPath: string
): Promise<ThreadFirstPage> {
  const client = createReadOnlyOnSocialClient();
  const replies = await client.query.threads.repliesByPath(rootPath, {
    limit: THREAD_REPLY_FIRST_PAGE,
  });
  return {
    replies,
    hasMore: directReplyPageHasMore(replies.length),
  };
}

/**
 * One direct-reply page for this thread. Repeat calls share the in-flight
 * request, and a finished page is reused until the session cap drops it.
 */
export function startThreadFirstPage(
  rootPath: string
): Promise<ThreadFirstPage> {
  const path = rootPath.trim();
  const cached = settled.get(path);
  if (cached) return Promise.resolve(cached);
  const existing = inflight.get(path);
  if (existing) return existing;
  const promise = fetchThreadFirstPage(path)
    .then((page) => {
      rememberSettled(path, page);
      return page;
    })
    .finally(() => {
      if (inflight.get(path) === promise) inflight.delete(path);
    });
  inflight.set(path, promise);
  return promise;
}

/** Personal / guild post sheet chunks (dynamic, ssr: false). */
export function ensurePostPanelChunk(
  surface: 'personal' | 'guild' = 'personal'
): Promise<unknown> {
  if (surface === 'guild') {
    return import('@/features/guilds/live-guild-post-panel');
  }
  return import('@/features/home/live-personal-post-panel');
}

/**
 * Prefetch post + quotes sheets while a feed is on screen so a tap paints the
 * seeded OP instead of waiting on the download. Does not join the feed
 * bundle — idle / mount callers only. Returns the imports so open can await.
 */
export function warmPostPanels(): Promise<unknown> {
  return Promise.all([
    ensurePostPanelChunk('personal'),
    ensurePostPanelChunk('guild'),
    import('@/features/home/post-quotes-panel'),
  ]);
}

/**
 * Drop place panel is its own chunk (dynamic, ssr: false). Warm it on Discover /
 * Market / layer mount so Just sold and list rows paint the seeded jacket on
 * first tap. Returns the import so open can await a cold chunk (no blank sheet).
 */
export function warmDropPanel(): Promise<unknown> {
  return import('@/features/scarces/collection-page-panel');
}

/**
 * Start post + drop sheet downloads as soon as a feed has rows (or the layer
 * mounts). Open still awaits — when this won the race, await is a microtask
 * and the sheet appears with the seeded row. Idle-only warm delayed first tap.
 */
export function warmFeedOpenChunks(): void {
  void warmPostPanels();
  void warmDropPanel();
}

/** Start the direct-reply page and the thread panel chunk on the tap. */
export function warmThreadOpen(
  rootPath: string,
  surface: 'personal' | 'guild' = 'personal'
): Promise<unknown> {
  const path = rootPath.trim();
  if (!path) return Promise.resolve();
  void startThreadFirstPage(path);
  return ensurePostPanelChunk(surface);
}

/** Prefetch the quotes panel chunk on View quotes intent. */
export function warmQuotesOpen(): Promise<unknown> {
  return import('@/features/home/post-quotes-panel');
}

/**
 * Run heavy thread enrich (tree walk) after first paint. Idle when available;
 * timeout keeps enrich moving on busy main threads.
 */
export function scheduleThreadIdle(
  run: () => void,
  timeoutMs = 1500
): () => void {
  if (typeof window === 'undefined') {
    run();
    return () => {};
  }
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(() => run(), { timeout: timeoutMs });
    return () => window.cancelIdleCallback(id);
  }
  const timer = window.setTimeout(run, Math.min(timeoutMs, 200));
  return () => window.clearTimeout(timer);
}

/** Drop a settled first page so the next open refetches after a local write. */
export function invalidateThreadFirstPage(rootPath: string): void {
  const path = rootPath.trim();
  if (!path) return;
  settled.delete(path);
  inflight.delete(path);
}

/**
 * Local reply / quote / delete confirmed — drop SPA caches for this root so
 * the next open refetches instead of painting a pre-write first page.
 */
export function invalidateThreadOpenCaches(rootPath: string): void {
  const path = rootPath.trim();
  if (!path) return;
  invalidateThreadFirstPage(path);
  invalidateThreadSession(path);
  invalidateGuildThreadSession(path);
  invalidateQuotesSession(path);
}

/** Test hook — module state must not leak between specs. */
export function clearThreadFirstPageCache(): void {
  inflight.clear();
  settled.clear();
}
