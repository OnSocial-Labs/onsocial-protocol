// @ts-nocheck — renderer tests follow the existing panel harness.
import { act, createElement } from 'react';
import { create } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FEED_MEDIA_RESOLVE_FALLBACK_MS,
  clearFeedMediaResolvedSrcs,
  feedMediaResolvedSrcCount,
} from '@/features/home/post-media';

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('@/hooks/use-post-list-video', () => ({
  usePostVideoPlayback: () => ({
    containerRef: { current: null },
    bindVideoEl: () => {},
    videoPreload: 'metadata',
    videoMounted: true,
  }),
  setListVideoSound: () => {},
}));

vi.mock('@onsocial/ui', async (importOriginal) => {
  const actual = await importOriginal();
  const React = await import('react');
  function IpfsImg(props, ref) {
    return React.createElement('img', { ...props, ref });
  }
  IpfsImg.displayName = 'IpfsImg';
  return {
    ...actual,
    IpfsBlurPreview: () => null,
    IpfsImg: React.forwardRef(IpfsImg),
    ipfsImgVariantUrl: (url) => url,
  };
});

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }) =>
    createElement('a', { href, ...rest }, children),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {} }),
}));

const { QuoteThumbTile } = await import('@/features/home/post-card-quote');

const VIDEO_ITEM = {
  url: 'blob:quote-thumb-video',
  mime: 'video/mp4',
  cid: 'bafyquote',
};

function shimmerCount(root: ReturnType<typeof create>): number {
  return root.root.findAll(
    (n) =>
      typeof n.props?.className === 'string' &&
      n.props.className.includes('post-media-skeleton')
  ).length;
}

function videoNode(root: ReturnType<typeof create>) {
  return root.root.findByType('video');
}

describe('quote media thumb settle (render)', () => {
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

  it('shows shimmer then clears on loadedmetadata/canplay', () => {
    let root!: ReturnType<typeof create>;
    act(() => {
      root = create(
        createElement(QuoteThumbTile, {
          item: VIDEO_ITEM,
          onRatio: () => {},
        })
      );
    });
    expect(shimmerCount(root)).toBe(1);

    act(() => {
      const video = videoNode(root);
      const event = {
        currentTarget: {
          videoWidth: 1280,
          videoHeight: 720,
        },
      };
      video.props.onLoadedMetadata?.(event);
      video.props.onCanPlay?.();
    });

    expect(shimmerCount(root)).toBe(0);
  });

  it('keeps the shimmer on loadedmetadata alone', () => {
    let root!: ReturnType<typeof create>;
    act(() => {
      root = create(
        createElement(QuoteThumbTile, {
          item: VIDEO_ITEM,
          onRatio: () => {},
        })
      );
    });
    expect(shimmerCount(root)).toBe(1);

    act(() => {
      videoNode(root).props.onLoadedMetadata?.({
        currentTarget: { videoWidth: 1280, videoHeight: 720 },
      });
    });

    expect(shimmerCount(root)).toBe(1);
  });

  it('clears the shimmer on loadeddata', () => {
    let root!: ReturnType<typeof create>;
    act(() => {
      root = create(
        createElement(QuoteThumbTile, {
          item: { ...VIDEO_ITEM, url: 'blob:quote-thumb-frame' },
          onRatio: () => {},
        })
      );
    });
    expect(shimmerCount(root)).toBe(1);

    act(() => {
      videoNode(root).props.onLoadedData?.();
    });

    expect(shimmerCount(root)).toBe(0);
  });

  it('keeps the shimmer after 8s when no frame has decoded', () => {
    let root!: ReturnType<typeof create>;
    act(() => {
      root = create(
        createElement(QuoteThumbTile, {
          item: VIDEO_ITEM,
          onRatio: () => {},
        })
      );
    });
    expect(shimmerCount(root)).toBe(1);

    act(() => {
      vi.advanceTimersByTime(FEED_MEDIA_RESOLVE_FALLBACK_MS);
    });

    expect(shimmerCount(root)).toBe(1);
    expect(feedMediaResolvedSrcCount()).toBe(0);
  });

  it('clears shimmer on a real error while the element stays mounted', () => {
    let root!: ReturnType<typeof create>;
    act(() => {
      root = create(
        createElement(QuoteThumbTile, {
          item: { ...VIDEO_ITEM, url: 'blob:quote-thumb-error' },
          onRatio: () => {},
        })
      );
    });
    expect(shimmerCount(root)).toBe(1);

    act(() => {
      videoNode(root).props.onError?.({
        currentTarget: { isConnected: true },
      });
    });

    expect(shimmerCount(root)).toBe(0);
    expect(feedMediaResolvedSrcCount()).toBe(1);
  });

  it('does not cache a detach-abort or drop the shimmer', () => {
    let root!: ReturnType<typeof create>;
    act(() => {
      root = create(
        createElement(QuoteThumbTile, {
          item: { ...VIDEO_ITEM, url: 'blob:quote-thumb-detach' },
          onRatio: () => {},
        })
      );
    });
    expect(shimmerCount(root)).toBe(1);

    act(() => {
      videoNode(root).props.onError?.({
        currentTarget: { isConnected: false },
      });
    });

    expect(shimmerCount(root)).toBe(1);
    expect(feedMediaResolvedSrcCount()).toBe(0);
  });
});
