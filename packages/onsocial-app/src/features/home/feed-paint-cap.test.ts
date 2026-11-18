/**
 * @vitest-environment jsdom
 */
import { createElement, useEffect, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HomeFeedReveal } from '@/features/home/home-feed-reveal';
import { FEED_MEDIA_RESOLVE_FALLBACK_MS } from '@/features/home/post-media';
import { settleFeedSidePaint } from '@/lib/prepare-feed-paint';

function RevealWhenDaoHangs() {
  const [posts, setPosts] = useState<string[] | null>(null);
  useEffect(() => {
    const hang = new Promise<Record<string, never>>(() => {});
    void settleFeedSidePaint({
      quotes: Promise.resolve({}),
      tallies: Promise.resolve({}),
      memberships: hang,
      capMs: FEED_MEDIA_RESOLVE_FALLBACK_MS,
    }).then(() => setPosts(['Hello from the feed']));
  }, []);
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
      root?.render(createElement(RevealWhenDaoHangs));
    });
    expect(host.textContent).toContain('skeleton');
    expect(host.textContent).not.toContain('Hello from the feed');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(FEED_MEDIA_RESOLVE_FALLBACK_MS);
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
          capMs: FEED_MEDIA_RESOLVE_FALLBACK_MS,
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
