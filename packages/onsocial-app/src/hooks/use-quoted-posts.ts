'use client';

import { useEffect, useMemo, useState } from 'react';
import type { GroupPostRef, PostRow } from '@onsocial/sdk';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';

const GROUP_POST_PATH_PATTERN =
  /^([^/]+)\/groups\/([^/]+)\/content\/post\/(.+)$/;

const quotedPostCache = new Map<string, PostRow | null>();
const quotedPostInFlight = new Map<string, Promise<PostRow | null>>();

/** Parse an indexed group content path into a typed post reference. */
export function parseGroupPostPath(path: string): GroupPostRef | null {
  const match = GROUP_POST_PATH_PATTERN.exec(path);
  if (!match) return null;
  return { author: match[1]!, groupId: match[2]!, postId: match[3]! };
}

async function fetchQuotedPost(refPath: string): Promise<PostRow | null> {
  const cached = quotedPostCache.get(refPath);
  if (cached !== undefined) return cached;

  const existing = quotedPostInFlight.get(refPath);
  if (existing) return existing;

  const ref = parseGroupPostPath(refPath);
  if (!ref) {
    quotedPostCache.set(refPath, null);
    return null;
  }

  const request = createReadOnlyOnSocialClient()
    .query.groups.post(ref)
    .then((post) => {
      quotedPostCache.set(refPath, post);
      return post;
    })
    .catch(() => {
      // Leave uncached so a later render can retry.
      return null;
    })
    .finally(() => {
      quotedPostInFlight.delete(refPath);
    });

  quotedPostInFlight.set(refPath, request);
  return request;
}

/**
 * Resolve indexed group posts by their full content paths (quoted originals,
 * reply parents). Cached per path; one small canonical read per unique path.
 */
export function useResolvedGroupPosts(paths: Array<string | undefined>) {
  const uniquePaths = useMemo(
    () =>
      Array.from(
        new Set(paths.filter((path): path is string => Boolean(path)))
      ).sort(),
    [paths]
  );
  const cacheKey = uniquePaths.join('\n');
  const [resolvedPosts, setResolvedPosts] = useState<Record<string, PostRow>>(
    {}
  );

  useEffect(() => {
    if (uniquePaths.length === 0) return;

    let cancelled = false;

    void Promise.all(
      uniquePaths.map(
        async (path): Promise<[string, PostRow | null]> => [
          path,
          await fetchQuotedPost(path),
        ]
      )
    ).then((entries) => {
      if (cancelled) return;

      const next: Record<string, PostRow> = {};
      for (const [path, post] of entries) {
        if (post) next[path] = post;
      }
      setResolvedPosts(next);
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey]);

  return resolvedPosts;
}

/**
 * Resolve the quoted originals for the visible posts that are quotes
 * (`refPath` set).
 */
export function useQuotedPosts(posts: PostRow[]) {
  const refPaths = useMemo(() => posts.map((post) => post.refPath), [posts]);
  return useResolvedGroupPosts(refPaths);
}
