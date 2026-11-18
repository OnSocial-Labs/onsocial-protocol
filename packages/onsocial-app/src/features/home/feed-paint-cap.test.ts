/**
 * @vitest-environment jsdom
 */
import { createElement, useEffect, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HomeFeedReveal } from '@/features/home/home-feed-reveal';
import { FEED_MEDIA_RESOLVE_FALLBACK_MS } from '@/features/home/post-media';
import { EMPTY_PROTOCOL_DAO_MEMBERSHIPS } from '@/lib/protocol-dao-memberships';
import {
  FEED_REVEAL_BUDGET_MS,
  FEED_SIDE_PAINT_CAP_MS,
  seedDaoMembershipMisses,
  sequenceFeedQuoteThenTally,
  settleFeedSidePaint,
  type FeedQuoteSeed,
} from '@/lib/prepare-feed-paint';

function RevealWhenDaoHangs({ capMs }: { capMs: number }) {
  const [posts, setPosts] = useState<string[] | null>(null);
  useEffect(() => {
    const hang = new Promise<Record<string, never>>(() => {});
    void settleFeedSidePaint({
      quotes: Promise.resolve({}),
      tallies: Promise.resolve({}),
      memberships: hang,
      capMs,
    }).then(() => setPosts(['Hello from the feed']));
  }, [capMs]);
  return createElement(
    HomeFeedReveal,
    {
      showSkeleton: posts == null,
      skeleton: createElement(
        'div',
        { className: 'post-row-skeleton-list' },
        'skeleton'
      ),
    },
    createElement('article', { className: 'post-card' }, posts?.[0] ?? '')
  );
}

describe('feed paint cap', () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;

  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    });
  });

  afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    vi.useRealTimers();
  });

  it('reveals the posts when dao-roles never resolves', async () => {
    vi.useFakeTimers();
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root?.render(
        createElement(RevealWhenDaoHangs, { capMs: FEED_SIDE_PAINT_CAP_MS })
      );
    });
    expect(host.textContent).toContain('skeleton');
    expect(host.textContent).not.toContain('Hello from the feed');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(FEED_SIDE_PAINT_CAP_MS);
    });

    expect(host.textContent).toContain('Hello from the feed');
  });

  it('reveals the feed within the reveal budget while dao-roles is still pending', async () => {
    vi.useFakeTimers();
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root?.render(
        createElement(RevealWhenDaoHangs, { capMs: FEED_REVEAL_BUDGET_MS })
      );
    });
    expect(host.textContent).toContain('skeleton');
    expect(host.textContent).not.toContain('Hello from the feed');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(FEED_REVEAL_BUDGET_MS - 1);
    });
    expect(host.textContent).not.toContain('Hello from the feed');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(host.textContent).toContain('Hello from the feed');
  });

  it('reveals the posts when dao-roles rejects', async () => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    function RevealWhenDaoRejects() {
      const [posts, setPosts] = useState<string[] | null>(null);
      useEffect(() => {
        void settleFeedSidePaint({
          quotes: Promise.resolve({}),
          tallies: Promise.resolve({}),
          memberships: Promise.reject(new Error('dao down')),
          capMs: FEED_SIDE_PAINT_CAP_MS,
        }).then((paint) => {
          expect(paint.memberships).toEqual({});
          setPosts(['Hello from the feed']);
        });
      }, []);
      return createElement(
        HomeFeedReveal,
        {
          showSkeleton: posts == null,
          skeleton: createElement('div', null, 'skeleton'),
        },
        createElement('article', null, posts?.[0] ?? '')
      );
    }
    await act(async () => {
      root?.render(createElement(RevealWhenDaoRejects));
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(host.textContent).toContain('Hello from the feed');
  });
});

describe('sequenceFeedQuoteThenTally', () => {
  it('uses the same budget as the media settle cap', () => {
    expect(FEED_SIDE_PAINT_CAP_MS).toBe(FEED_MEDIA_RESOLVE_FALLBACK_MS);
    expect(typeof FEED_SIDE_PAINT_CAP_MS).toBe('number');
  });

  it('keeps the reveal budget above a healthy dao batch and under the media cap', () => {
    expect(FEED_REVEAL_BUDGET_MS).toBe(2_500);
    expect(FEED_REVEAL_BUDGET_MS).toBeGreaterThan(1_622);
    expect(FEED_REVEAL_BUDGET_MS).toBeLessThan(FEED_SIDE_PAINT_CAP_MS);
  });

  it('seeds an empty membership when dao-roles misses the budget', () => {
    const kept = {
      'bob.near': EMPTY_PROTOCOL_DAO_MEMBERSHIPS,
    };
    expect(seedDaoMembershipMisses(['bob.near'], kept)).toBe(kept);
    expect(seedDaoMembershipMisses(['alice.near'], {})).toEqual({
      'alice.near': EMPTY_PROTOCOL_DAO_MEMBERSHIPS,
    });
  });

  it('starts the tally read only after the quote read settles', async () => {
    let releaseQuotes: (value: FeedQuoteSeed) => void = () => {};
    const quotes = new Promise<FeedQuoteSeed>((resolve) => {
      releaseQuotes = resolve;
    });
    let talliesStarted = false;
    const reads = sequenceFeedQuoteThenTally(quotes, () => {
      talliesStarted = true;
      return Promise.resolve({});
    });
    await Promise.resolve();
    expect(talliesStarted).toBe(false);
    releaseQuotes({ 'greenghost.onsocial.testnet/post/1': null });
    await reads.tallies;
    expect(talliesStarted).toBe(true);
    await expect(reads.quotes).resolves.toHaveProperty(
      'greenghost.onsocial.testnet/post/1'
    );
  });
});
