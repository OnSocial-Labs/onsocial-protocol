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
