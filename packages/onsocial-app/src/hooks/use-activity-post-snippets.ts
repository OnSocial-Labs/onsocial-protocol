'use client';

import { useEffect, useState } from 'react';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import {
  notificationSnippetKey,
  snippetFromPostValue,
} from '@/lib/notification-display';

const snippetCache = new Map<string, string | null>();
const batchInFlight = new Map<string, Promise<Record<string, string>>>();

function readCachedSnippets(
  refs: Array<{ author: string; postId: string }>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const ref of refs) {
    const key = notificationSnippetKey(ref.author, ref.postId);
    const cached = snippetCache.get(key);
    if (cached) out[key] = cached;
  }
  return out;
}

async function fetchActivityPostSnippetsBatch(
  refs: Array<{ author: string; postId: string }>
): Promise<Record<string, string>> {
  const unique = new Map<string, { author: string; postId: string }>();
  for (const ref of refs) {
    if (!ref.author || !ref.postId) continue;
    unique.set(notificationSnippetKey(ref.author, ref.postId), ref);
  }
  const list = [...unique.values()].sort((a, b) =>
    notificationSnippetKey(a.author, a.postId).localeCompare(
      notificationSnippetKey(b.author, b.postId)
    )
  );
  if (list.length === 0) return {};

  const fromCache = readCachedSnippets(list);
  const missing = list.filter(
    (ref) => !snippetCache.has(notificationSnippetKey(ref.author, ref.postId))
  );
  if (missing.length === 0) return fromCache;

  const batchKey = missing
    .map((ref) => notificationSnippetKey(ref.author, ref.postId))
    .join('\n');
  const existing = batchInFlight.get(batchKey);
  if (existing) {
    const fetched = await existing;
    return { ...fromCache, ...fetched };
  }

  const request = (async (): Promise<Record<string, string>> => {
    const next: Record<string, string> = {};
    try {
      const client = createReadOnlyOnSocialClient();
      const accounts = [...new Set(missing.map((ref) => ref.author))];
      const postIds = [...new Set(missing.map((ref) => ref.postId))];
      const res = await client.query.graphql<{
        postsCurrent: Array<{
          accountId: string;
          postId: string;
          value: string | null;
        }>;
      }>({
        query: `query ActivityPostSnippets($accounts: [String!]!, $postIds: [String!]!, $limit: Int!) {
          postsCurrent(
            where: {
              _and: [
                { accountId: { _in: $accounts } },
                { postId: { _in: $postIds } }
              ]
            },
            limit: $limit
          ) { accountId postId value }
        }`,
        variables: {
          accounts,
          postIds,
          limit: Math.max(missing.length * 2, 40),
        },
      });
      const byKey = new Map(
        (res.data?.postsCurrent ?? []).map(
          (row) =>
            [
              notificationSnippetKey(row.accountId, row.postId),
              row.value,
            ] as const
        )
      );
      for (const ref of missing) {
        const key = notificationSnippetKey(ref.author, ref.postId);
        const snippet = snippetFromPostValue(byKey.get(key) ?? null);
        snippetCache.set(key, snippet);
        if (snippet) next[key] = snippet;
      }
    } catch {
      for (const ref of missing) {
        snippetCache.set(
          notificationSnippetKey(ref.author, ref.postId),
          null
        );
      }
    }
    return next;
  })().finally(() => {
    batchInFlight.delete(batchKey);
  });

  batchInFlight.set(batchKey, request);
  const fetched = await request;
  return { ...fromCache, ...fetched };
}

/** First-line post text keyed by `author\\0postId` for old Activity rows. */
export function useActivityPostSnippets(
  refs: Array<{ author: string; postId: string }>
): Record<string, string> {
  const refsKey = refs
    .map((ref) => notificationSnippetKey(ref.author, ref.postId))
    .filter(Boolean)
    .sort()
    .join('\n');
  const list = refsKey
    ? refsKey.split('\n').map((key) => {
        const [author, postId] = key.split('\0');
        return { author, postId };
      })
    : [];
  const fromCache = readCachedSnippets(list);
  const [fetched, setFetched] = useState<Record<string, string>>({});
  const [fetchedKey, setFetchedKey] = useState('');

  useEffect(() => {
    if (!refsKey) return;

    let cancelled = false;

    void fetchActivityPostSnippetsBatch(list).then((next) => {
      if (cancelled) return;
      setFetched(next);
      setFetchedKey(refsKey);
    });

    return () => {
      cancelled = true;
    };
  }, [refsKey]);

  const activeFetched = fetchedKey === refsKey ? fetched : {};
  return { ...fromCache, ...activeFetched };
}
