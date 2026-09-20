import { portfolioPath } from '@/lib/overlay-routes';
import { guildPostPath } from '@/features/guilds/guilds-data';
import {
  fetchIndexedPost,
  fetchIndexedPostsByRefs,
} from '@/lib/fetch-personal-post';

/** App route for a personal post thread: `/@{author}/posts/{postId}`. */
export function personalPostPath(author: string, postId: string): string {
  return `${portfolioPath(author)}/posts/${encodeURIComponent(postId)}`;
}

/** Indexed content path for a personal post. */
export function personalPostContentPath(
  author: string,
  postId: string
): string {
  return `${author}/post/${postId}`;
}

/**
 * In-app page-sheet target: personal `/posts/` or `/writing/` permalinks.
 * Guild threads and quotes screens stay real pages.
 */
export function parseInAppPostLayerHref(
  href: string | null | undefined
): { accountId: string; postId: string } | null {
  if (!href) return null;
  let pathname = href.trim();
  if (!pathname) return null;
  try {
    if (/^https?:\/\//i.test(pathname)) {
      pathname = new URL(pathname).pathname;
    }
  } catch {
    return null;
  }
  const q = pathname.indexOf('?');
  if (q !== -1) pathname = pathname.slice(0, q);
  const hash = pathname.indexOf('#');
  if (hash !== -1) pathname = pathname.slice(0, hash);
  const match = pathname.match(/^\/@([^/]+)\/(?:posts|writing)\/([^/]+)\/?$/);
  if (!match) return null;
  try {
    return {
      accountId: decodeURIComponent(match[1]),
      postId: decodeURIComponent(match[2]),
    };
  } catch {
    return null;
  }
}

/**
 * Personal post / writing permalink — consume the click and open a sheet.
 * Do not let Next replace the underlay behind an open post or enlarge drawer.
 */
export function isInAppPostLayerHref(
  href: string | null | undefined
): boolean {
  return parseInAppPostLayerHref(href) != null;
}

/** Canonical share permalink for a parsed in-app post layer. */
export function canonicalizePostLayerHref(href: string): string | null {
  const parsed = parseInAppPostLayerHref(href);
  if (!parsed) return null;
  const path = personalPostPath(parsed.accountId, parsed.postId);
  const q = href.indexOf('?');
  if (q === -1) return path;
  const hash = href.indexOf('#');
  const query = href.slice(q, hash === -1 ? undefined : hash);
  return query ? `${path}${query}` : path;
}

/** Thread page for any post row — guild or personal. */
export function postThreadPath(post: {
  accountId: string;
  postId: string;
  groupId?: string | null;
}): string {
  if (post.groupId) {
    return guildPostPath(post.groupId, post.accountId, post.postId);
  }
  return personalPostPath(post.accountId, post.postId);
}

/** Quotes + reposts screen for a personal post thread. */
export function personalPostQuotesPath(author: string, postId: string): string {
  return `${personalPostPath(author, postId)}/quotes`;
}

/** Quotes + reposts screen for any post row — guild or personal. */
export function postQuotesPath(post: {
  accountId: string;
  postId: string;
  groupId?: string | null;
}): string {
  return `${postThreadPath(post)}/quotes`;
}

/** Query param: scroll + highlight a reply on thread landing. */
export const THREAD_FOCUS_REPLY_QUERY = 'reply';

export function appendThreadFocusReply(
  href: string,
  replyPostId: string
): string {
  const id = replyPostId.trim();
  if (!id) return href;
  const join = href.includes('?') ? '&' : '?';
  return `${href}${join}${THREAD_FOCUS_REPLY_QUERY}=${encodeURIComponent(id)}`;
}

export function readThreadFocusReplyId(
  searchParams: Pick<URLSearchParams, 'get'>
): string | null {
  const id = searchParams.get(THREAD_FOCUS_REPLY_QUERY)?.trim();
  return id || null;
}

/**
 * Overlay history updates `window.location` without Next `usePathname`.
 * True when the browser is on a post permalink and the App Router is not.
 */
export function isOverlayPostLayerLocation(
  nextPathname: string,
  locationHref: string
): boolean {
  return (
    parseInAppPostLayerHref(locationHref) != null &&
    parseInAppPostLayerHref(nextPathname) == null
  );
}

function parseSourcePostPath(
  path: string | undefined
): { author: string; postId: string; path: string } | null {
  if (!path?.trim()) return null;
  const trimmed = path.trim();
  const match = trimmed.match(/^(.+)\/post\/(.+)$/);
  if (!match?.[1] || !match[2]) return null;
  return { author: match[1], postId: match[2], path: trimmed };
}

/**
 * Resolve the correct app thread href for an indexed `author/post/{id}` path.
 * Guild posts must not use the personal `/posts/` route.
 */
export async function resolvePostThreadHrefFromSourcePath(
  path: string | undefined
): Promise<string | null> {
  const parsed = parseSourcePostPath(path);
  if (!parsed) return null;
  const row = await fetchIndexedPost({
    author: parsed.author,
    postId: parsed.postId,
  });
  if (!row) return null;
  return postThreadPath(row);
}

/**
 * Batch-resolve thread hrefs for many `author/post/{id}` paths (one indexer query).
 * Map keys are the original source paths.
 */
export async function resolvePostThreadHrefsFromSourcePaths(
  paths: Array<string | undefined>
): Promise<Map<string, string>> {
  const parsed = paths
    .map((path) => parseSourcePostPath(path))
    .filter(
      (row): row is { author: string; postId: string; path: string } =>
        row != null
    );
  if (parsed.length === 0) return new Map();

  const rows = await fetchIndexedPostsByRefs(
    parsed.map(({ author, postId }) => ({ author, postId }))
  );
  const out = new Map<string, string>();
  for (const item of parsed) {
    const row = rows.get(`${item.author}\0${item.postId}`);
    if (!row) continue;
    out.set(item.path, postThreadPath(row));
  }
  return out;
}
