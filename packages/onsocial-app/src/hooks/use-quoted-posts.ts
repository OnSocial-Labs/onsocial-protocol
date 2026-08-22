'use client';

import { useEffect, useMemo, useState } from 'react';
import type { GroupPostRef, PostRow } from '@onsocial/sdk';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import { fetchPersonalPost } from '@/lib/fetch-personal-post';
import { isRepostRefType } from '@/lib/post-relation';

const GROUP_POST_PATH_PATTERN =
  /^([^/]+)\/groups\/([^/]+)\/content\/post\/(.+)$/;
/** Personal post content path: `{account}/post/{postId}`. */
const PERSONAL_POST_PATH_PATTERN = /^([^/]+)\/post\/(.+)$/;

const quotedPostCache = new Map<string, PostRow | null>();
const quotedPostInFlight = new Map<string, Promise<PostRow | null>>();

/** Parse an indexed group content path into a typed post reference. */
export function parseGroupPostPath(path: string): GroupPostRef | null {
  const match = GROUP_POST_PATH_PATTERN.exec(path);
  if (!match) return null;
  return { author: match[1]!, groupId: match[2]!, postId: match[3]! };
}

/** Parse a personal post content path (`alice.near/post/123`). */
export function parsePersonalPostPath(
  path: string
): { author: string; postId: string } | null {
  if (path.includes('/groups/')) return null;
  const match = PERSONAL_POST_PATH_PATTERN.exec(path);
  if (!match) return null;
  return { author: match[1]!, postId: match[2]! };
}

async function fetchQuotedPost(refPath: string): Promise<PostRow | null> {
  const cached = quotedPostCache.get(refPath);
  if (cached !== undefined) return cached;

  const existing = quotedPostInFlight.get(refPath);
  if (existing) return existing;

  const groupRef = parseGroupPostPath(refPath);
  const personalRef = groupRef ? null : parsePersonalPostPath(refPath);
  if (!groupRef && !personalRef) {
    quotedPostCache.set(refPath, null);
    return null;
  }

  const request = (
    groupRef
      ? createReadOnlyOnSocialClient().query.groups.post(groupRef)
      : fetchPersonalPost(personalRef!)
  )
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
 * Resolve indexed posts by full content path (quoted originals, reply
 * parents) — group or personal. Cached per path.
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
 *
 * Repost shells get a second hop: the row renders the ORIGINAL as the card,
 * and if that original is itself a quote, its inset needs `refPath` resolved
 * too — otherwise the card degrades to a `Quoting @x` line.
 */
export function useQuotedPosts(posts: PostRow[]) {
  const refPaths = useMemo(() => posts.map((post) => post.refPath), [posts]);
  const firstHop = useResolvedGroupPosts(refPaths);
  const secondHopPaths = useMemo(
    () =>
      posts
        .filter((post) => isRepostRefType(post.refType) && post.refPath)
        .map((post) => firstHop[post.refPath!]?.refPath),
    [posts, firstHop]
  );
  const secondHop = useResolvedGroupPosts(secondHopPaths);
  return useMemo(
    () => ({ ...secondHop, ...firstHop }),
    [firstHop, secondHop]
  );
}

const ANCESTOR_CHAIN_CAP = 12;
const NO_ANCESTORS: PostRow[] = [];

/**
 * Walk reply parent edges up to the conversation root (full thread
 * context). Returns ancestors oldest-first; empty while loading or when the
 * post has no parent. Capped to keep pathological chains bounded.
 */
export function useAncestorChain(parentPath: string | undefined): PostRow[] {
  // Keyed by path so a stale chain never renders under a different post.
  const [resolved, setResolved] = useState<{
    path: string;
    posts: PostRow[];
  } | null>(null);

  useEffect(() => {
    if (!parentPath) return;

    let cancelled = false;

    void (async () => {
      const ancestors: PostRow[] = [];
      let cursor: string | undefined = parentPath;
      while (cursor && ancestors.length < ANCESTOR_CHAIN_CAP) {
        const post: PostRow | null = await fetchQuotedPost(cursor);
        if (!post || cancelled) break;
        ancestors.unshift(post);
        cursor = post.parentPath;
      }
      if (!cancelled) setResolved({ path: parentPath, posts: ancestors });
    })();

    return () => {
      cancelled = true;
    };
  }, [parentPath]);

  return parentPath && resolved?.path === parentPath
    ? resolved.posts
    : NO_ANCESTORS;
}
