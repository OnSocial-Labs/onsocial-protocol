import { postContentPath, type PostRow, type ThreadNode } from '@onsocial/sdk';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import { leafThreadNode } from '@/lib/thread-display';

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

export function directRepliesToTree(replies: PostRow[]): ThreadNode[] {
  return replies.map((post) => leafThreadNode(post, postContentPath(post)));
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

/** Start the direct-reply page and the thread panel chunk on the tap. */
export function warmThreadOpen(
  rootPath: string,
  surface: 'personal' | 'guild' = 'personal'
): void {
  const path = rootPath.trim();
  if (!path) return;
  void startThreadFirstPage(path);
  if (surface === 'guild') {
    void import('@/features/guilds/live-guild-post-panel');
    return;
  }
  void import('@/features/home/live-personal-post-panel');
}

/** Test hook — module state must not leak between specs. */
export function clearThreadFirstPageCache(): void {
  inflight.clear();
  settled.clear();
}
