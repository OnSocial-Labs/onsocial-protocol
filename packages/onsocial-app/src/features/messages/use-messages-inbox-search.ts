'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DmThreadSummary } from '@onsocial/sdk';
import {
  fetchDiscoverProfiles,
  type DiscoverProfileSummary,
} from '@/lib/discover-profiles';
import type { PostAuthorProfile } from '@/hooks/use-post-author-profiles';
import {
  excludePeersInInbox,
  filterInboxThreadsByQuery,
  isMessagesPeopleSearchActive,
  normalizeMessagesSearchQuery,
} from '@/features/messages/messages-inbox-search';

const PEOPLE_SEARCH_DEBOUNCE_MS = 220;

export function useMessagesInboxSearch(opts: {
  enabled: boolean;
  viewerAccountId: string | null;
  inboxThreads: DmThreadSummary[] | null;
  sealedThreads: DmThreadSummary[];
  profiles: Record<string, PostAuthorProfile | undefined>;
  previews: Record<string, string>;
}) {
  const [query, setQuery] = useState('');
  const [people, setPeople] = useState<DiscoverProfileSummary[]>([]);
  const [peoplePending, setPeoplePending] = useState(false);
  const [peopleError, setPeopleError] = useState<string | null>(null);

  const normalized = normalizeMessagesSearchQuery(query);
  const isSearching = normalized.length > 0;
  const peopleActive = isMessagesPeopleSearchActive(normalized);

  const searchableThreads = useMemo(() => {
    const inbox = opts.inboxThreads ?? [];
    return [...inbox, ...opts.sealedThreads];
  }, [opts.inboxThreads, opts.sealedThreads]);

  const names = useMemo(() => {
    const next: Record<string, string | undefined> = {};
    for (const [id, profile] of Object.entries(opts.profiles)) {
      next[id] = profile?.displayName;
    }
    return next;
  }, [opts.profiles]);

  const filteredThreads = useMemo(() => {
    if (!isSearching) return searchableThreads;
    return filterInboxThreadsByQuery({
      threads: searchableThreads,
      query: normalized,
      names,
      previews: opts.previews,
    });
  }, [isSearching, names, normalized, opts.previews, searchableThreads]);

  useEffect(() => {
    if (!opts.enabled || !peopleActive) return;

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setPeoplePending(true);
      setPeopleError(null);
      void fetchDiscoverProfiles(
        normalized,
        opts.viewerAccountId,
        0,
        controller.signal
      )
        .then((response) => {
          if (controller.signal.aborted) return;
          setPeople(response.profiles);
        })
        .catch((cause: unknown) => {
          if (controller.signal.aborted) return;
          if (cause instanceof DOMException && cause.name === 'AbortError') {
            return;
          }
          setPeopleError(
            cause instanceof Error ? cause.message : 'Search failed.'
          );
          setPeople([]);
        })
        .finally(() => {
          if (!controller.signal.aborted) setPeoplePending(false);
        });
    }, PEOPLE_SEARCH_DEBOUNCE_MS);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [normalized, opts.enabled, opts.viewerAccountId, peopleActive]);

  const peopleResults = useMemo(() => {
    if (!peopleActive) return [];
    const peers = searchableThreads.map((thread) => thread.peerAccountId);
    return excludePeersInInbox(people, peers, opts.viewerAccountId);
  }, [opts.viewerAccountId, people, peopleActive, searchableThreads]);

  const clearSearch = useCallback(() => setQuery(''), []);

  return {
    query,
    setQuery,
    clearSearch,
    normalized,
    isSearching,
    peopleActive,
    filteredThreads,
    peopleResults,
    peoplePending: peopleActive && peoplePending,
    peopleError: peopleActive ? peopleError : null,
  };
}
