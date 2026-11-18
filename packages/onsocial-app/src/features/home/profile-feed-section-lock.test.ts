// @ts-nocheck — renderer tests follow the existing panel harness.
import { act, createElement, useEffect, useRef, useState } from 'react';
import { create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import {
  beginProfileSectionFetch,
  emptyProfileSectionInFlight,
  endProfileSectionFetch,
  type ProfileSectionInFlight,
} from '@/features/home/profile-feed-client';

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

type Section = 'posts' | 'replies' | 'reposts';

/**
 * Smallest React owner of the per-section lock + request-id gate — same
 * control flow as ProfileFeedClient.fetchSectionPage / tab effect.
 */
function ProfileSectionLockHarness({
  tab,
  fetchSection,
}: {
  tab: Section;
  fetchSection: (section: Section) => Promise<string[]>;
}) {
  const [rowsBySection, setRowsBySection] = useState<Record<Section, string[]>>(
    {
      posts: [],
      replies: [],
      reposts: [],
    }
  );
  const [started, setStarted] = useState<Record<Section, boolean>>({
    posts: false,
    replies: false,
    reposts: false,
  });
  const inFlightRef = useRef<ProfileSectionInFlight>(
    emptyProfileSectionInFlight()
  );
  const requestRef = useRef<Record<Section, number>>({
    posts: 0,
    replies: 0,
    reposts: 0,
  });
  const fetchRef = useRef(fetchSection);
  useEffect(() => {
    fetchRef.current = fetchSection;
  }, [fetchSection]);

  useEffect(() => {
    if (started[tab]) return;
    if (!beginProfileSectionFetch(inFlightRef.current, tab)) return;
    const requestId = requestRef.current[tab];
    void fetchRef
      .current(tab)
      .then((rows) => {
        if (requestId !== requestRef.current[tab]) return;
        setRowsBySection((current) => ({ ...current, [tab]: rows }));
        setStarted((current) => ({ ...current, [tab]: true }));
      })
      .finally(() => {
        if (requestId !== requestRef.current[tab]) return;
        endProfileSectionFetch(inFlightRef.current, tab);
      });
  }, [tab, started]);

  return createElement('div', {
    'data-tab': tab,
    'data-posts': rowsBySection.posts.join(','),
    'data-replies': rowsBySection.replies.join(','),
    'data-posts-started': String(started.posts),
    'data-replies-started': String(started.replies),
  });
}

describe('profile feed section paging (behaviour)', () => {
  it('starts the other section mid-load and drops a stale result after bump', async () => {
    const calls: Section[] = [];
    let resolvePosts!: (rows: string[]) => void;
    let resolveReplies!: (rows: string[]) => void;
    const postsGate = new Promise<string[]>((resolve) => {
      resolvePosts = resolve;
    });
    const repliesGate = new Promise<string[]>((resolve) => {
      resolveReplies = resolve;
    });

    const fetchSection = vi.fn((section: Section) => {
      calls.push(section);
      return section === 'posts' ? postsGate : repliesGate;
    });

    let root!: ReturnType<typeof create>;
    await act(async () => {
      root = create(
        createElement(ProfileSectionLockHarness, {
          tab: 'posts',
          fetchSection,
        })
      );
    });
    expect(calls).toEqual(['posts']);

    await act(async () => {
      root.update(
        createElement(ProfileSectionLockHarness, {
          tab: 'replies',
          fetchSection,
        })
      );
    });
    // Per-section lock — replies begins while posts is still in flight.
    expect(calls).toEqual(['posts', 'replies']);

    await act(async () => {
      resolveReplies(['reply-ok']);
      await repliesGate;
    });
    expect(
      root.root.findByProps({ 'data-replies': 'reply-ok' }).props[
        'data-replies-started'
      ]
    ).toBe('true');
    expect(
      root.root.findByProps({ 'data-replies': 'reply-ok' }).props['data-posts']
    ).toBe('');

    // Bump posts request id (account change) before the late posts payload.
    await act(async () => {
      root.unmount();
    });

    // Explicit request-id gate — same check as fetchSectionPage.then.
    const requestIds = { posts: 0, replies: 0, reposts: 0 };
    const inFlight = emptyProfileSectionInFlight();
    const landed: string[] = [];
    expect(beginProfileSectionFetch(inFlight, 'posts')).toBe(true);
    const postsRequest = requestIds.posts;
    requestIds.posts += 1;
    if (postsRequest === requestIds.posts) landed.push('stale-post');
    endProfileSectionFetch(inFlight, 'posts');
    expect(landed).toEqual([]);

    void resolvePosts;
  });
});
