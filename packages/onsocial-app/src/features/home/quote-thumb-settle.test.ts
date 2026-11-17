// @ts-nocheck — renderer tests follow the existing panel harness.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { act, createElement } from 'react';
import { create } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FEED_MEDIA_RESOLVE_FALLBACK_MS,
  clearFeedMediaResolvedSrcs,
  feedMediaVideoSettleHandlers,
  useFeedMediaResolveFallback,
  useFeedMediaResolved,
} from '@/features/home/post-media';

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const homeSrc = dirname(fileURLToPath(import.meta.url));

function QuoteVideoSettleProbe({
  src,
  mounted,
}: {
  src: string;
  mounted: boolean;
}) {
  const { resolved, markResolved } = useFeedMediaResolved(src);
  useFeedMediaResolveFallback(mounted, resolved, markResolved);
  const handlers = feedMediaVideoSettleHandlers(markResolved);
  return createElement(
    'div',
    null,
    resolved
      ? null
      : createElement('span', {
          className: 'post-media-skeleton',
          'data-testid': 'shimmer',
        }),
    mounted
      ? createElement('video', {
          'data-testid': 'video',
          ...handlers,
        })
      : null,
    createElement('span', { 'data-testid': 'resolved' }, resolved ? 'yes' : 'no')
  );
}

describe('quote media thumb settle', () => {
  beforeEach(() => {
    clearFeedMediaResolvedSrcs();
    vi.useFakeTimers();
    vi.stubGlobal('window', {
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    clearFeedMediaResolvedSrcs();
  });

  it('clears shimmer via the shared named fallback when decode events never fire', () => {
    let root!: ReturnType<typeof create>;
    act(() => {
      root = create(
        createElement(QuoteVideoSettleProbe, {
          src: 'blob:quote-thumb-probe',
          mounted: true,
        })
      );
    });
    expect(
      root.root.findAll(
        (n) => n.props?.['data-testid'] === 'shimmer'
      ).length
    ).toBe(1);
    expect(
      root.root.find((n) => n.props?.['data-testid'] === 'resolved').children[0]
    ).toBe('no');

    act(() => {
      vi.advanceTimersByTime(FEED_MEDIA_RESOLVE_FALLBACK_MS);
    });

    expect(
      root.root.findAll(
        (n) => n.props?.['data-testid'] === 'shimmer'
      ).length
    ).toBe(0);
    expect(
      root.root.find((n) => n.props?.['data-testid'] === 'resolved').children[0]
    ).toBe('yes');
  });

  it('wires QuoteThumbTile to the shared settle handlers and fallback', () => {
    const source = readFileSync(join(homeSrc, 'post-card-quote.tsx'), 'utf8');
    expect(source).toContain('useFeedMediaResolveFallback');
    expect(source).toContain('feedMediaVideoSettleHandlers');
    // Must not keep the loadeddata/error-only gap that shimmered forever on iOS.
    expect(source).not.toMatch(
      /onLoadedData=\{markResolved\}\s*onError=\{markResolved\}\s*\/>/
    );
  });
});

describe('feed media resolve settle (shared)', () => {
  it('exports one fallback budget used by feed tiles and quote thumbs', () => {
    expect(FEED_MEDIA_RESOLVE_FALLBACK_MS).toBe(8_000);
    const media = readFileSync(join(homeSrc, 'post-media.tsx'), 'utf8');
    expect(media).toContain('useFeedMediaResolveFallback');
    expect(media).toContain('feedMediaVideoSettleHandlers');
    expect(media).toContain('FEED_MEDIA_RESOLVE_FALLBACK_MS');
  });
});
