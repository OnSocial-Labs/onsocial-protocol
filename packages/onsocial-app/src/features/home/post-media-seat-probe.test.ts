// @vitest-environment jsdom
// @ts-nocheck — renderer tests follow the existing panel harness.
import { act, createElement, useState } from 'react';
import { create } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PostMediaStrip,
  captureSeatScrollAnchor,
  clearFeedMediaMeasuredRatios,
  clearFeedMediaResolvedSrcs,
  nextMeasuredRatio,
  seatScrollDelta,
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

vi.mock('@onsocial/ui', async () => {
  const React = await import('react');
  function IpfsImg(props, ref) {
    return React.createElement('img', { ...props, ref });
  }
  IpfsImg.displayName = 'IpfsImg';
  return {
    IpfsBlurPreview: () => null,
    IpfsImg: React.forwardRef(IpfsImg),
    ipfsImgSrcSet: () => undefined,
    OsMediaDismiss: () => null,
    PauseFillIcon: () => null,
    PlayFillIcon: () => null,
    VolumeMuteIcon: () => null,
    VolumeUpIcon: () => null,
  };
});

describe('feed media seat probe (render)', () => {
  beforeEach(() => {
    clearFeedMediaMeasuredRatios();
    clearFeedMediaResolvedSrcs();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('loads one Image network request per photo seat (no off-DOM probe)', () => {
    const imageCtor = vi.fn(function Image() {
      return { onload: null, onerror: null, src: '' };
    });
    vi.stubGlobal('Image', imageCtor);

    let root!: ReturnType<typeof create>;
    act(() => {
      root = create(
        createElement(PostMediaStrip, {
          items: [
            { url: 'https://example.com/cold-seat.jpg', mime: 'image/jpeg' },
          ],
          size: 'page',
        })
      );
    });

    // f5a07215 cold probe called `new Image()` with the full original URL.
    expect(imageCtor).not.toHaveBeenCalled();
    const imgs = root.root.findAllByType('img');
    expect(imgs.some((n) => n.props.src?.includes('cold-seat.jpg'))).toBe(
      true
    );
  });

  it('sets one video src per video seat (no off-DOM probe fetch)', () => {
    const realCreate = document.createElement.bind(document);
    let probeVideos = 0;
    vi.spyOn(document, 'createElement').mockImplementation((tag, options) => {
      const el = realCreate(tag, options as ElementCreationOptions);
      if (tag === 'video') {
        // Host renderer may call this; the f5a07215 probe also assigned .src
        // before React commit. Count only elements that get a src set off-tree.
        const desc = Object.getOwnPropertyDescriptor(
          HTMLMediaElement.prototype,
          'src'
        );
        if (desc?.set) {
          Object.defineProperty(el, 'src', {
            configurable: true,
            set(value: string) {
              if (!(el as HTMLElement).isConnected) probeVideos += 1;
              desc.set!.call(el, value);
            },
            get() {
              return desc.get?.call(el);
            },
          });
        }
      }
      return el;
    });

    let root!: ReturnType<typeof create>;
    act(() => {
      root = create(
        createElement(PostMediaStrip, {
          items: [
            { url: 'https://example.com/cold-seat.mp4', mime: 'video/mp4' },
          ],
          size: 'page',
        })
      );
    });

    expect(probeVideos).toBe(0);
    const videos = root.root.findAllByType('video');
    expect(videos.length).toBe(1);
    expect(videos[0].props.src).toBe('https://example.com/cold-seat.mp4');
  });

  it('compensates scroll when an above-viewport tile resizes (height anchor)', () => {
    const before = captureSeatScrollAnchor({
      tileTop: -400,
      tileBottom: -100,
      tileHeight: 200,
      scrollerTop: 0,
      scrollTop: 800,
    });
    expect(before).toEqual({ mode: 'height', height: 200 });

    const delta = seatScrollDelta(before, {
      tileTop: -400,
      tileHeight: 120,
      scrollerTop: 0,
      scrollTop: 800,
    });
    // Tile shrank 80px above the viewport — pull scroll back so in-view stays put.
    expect(delta).toBe(-80);

    function AboveViewportSeatHarness() {
      const [ratio, setRatio] = useState(4 / 3);
      const [scrollTop, setScrollTop] = useState(800);
      return createElement(
        'div',
        {
          'data-scroll': String(scrollTop),
          'data-ratio': String(ratio),
        },
        createElement(
          'button',
          {
            type: 'button',
            onClick: () => {
              const anchor = captureSeatScrollAnchor({
                tileTop: -400,
                tileBottom: -100,
                tileHeight: 200,
                scrollerTop: 0,
                scrollTop,
              });
              const delta = seatScrollDelta(anchor, {
                tileTop: -400,
                tileHeight: 120,
                scrollerTop: 0,
                scrollTop,
              });
              setScrollTop(scrollTop + delta);
              setRatio(16 / 9);
            },
          },
          'resize'
        )
      );
    }

    let root!: ReturnType<typeof create>;
    act(() => {
      root = create(createElement(AboveViewportSeatHarness));
    });
    expect(root.root.findByProps({ 'data-scroll': '800' })).toBeTruthy();
    act(() => {
      root.root.findByType('button').props.onClick();
    });
    expect(root.root.findByProps({ 'data-scroll': '720' })).toBeTruthy();
  });

  it('keeps setMeasuredRatio pure under double invoke', () => {
    function PureRatioHarness({ ratio }: { ratio: number }) {
      const [measured, setMeasured] = useState(null);
      return createElement(
        'div',
        null,
        createElement(
          'button',
          {
            type: 'button',
            onClick: () => {
              setMeasured((current) => nextMeasuredRatio(current, ratio));
              setMeasured((current) => nextMeasuredRatio(current, ratio));
            },
          },
          'set'
        ),
        createElement('span', { 'data-measured': String(measured) })
      );
    }

    let root!: ReturnType<typeof create>;
    act(() => {
      root = create(createElement(PureRatioHarness, { ratio: 1.777 }));
    });
    act(() => {
      root.root.findByType('button').props.onClick();
    });
    expect(
      root.root.find((n) => n.props?.['data-measured'] != null).props[
        'data-measured'
      ]
    ).toBe(String(1.777));
    expect(nextMeasuredRatio(1.777, 1.777)).toBe(1.777);
    expect(nextMeasuredRatio(null, 1.5)).toBe(1.5);
  });

  it('skips same-ratio capture so a later change uses a fresh anchor', () => {
    // Mirrors rememberRatio: capture only when nextMeasuredRatio changes.
    let measured: number | null = 1.5;
    let anchor: ReturnType<typeof captureSeatScrollAnchor> | null =
      captureSeatScrollAnchor({
        tileTop: -400,
        tileBottom: -100,
        tileHeight: 200,
        scrollerTop: 0,
        scrollTop: 800,
      });
    expect(anchor).toEqual({ mode: 'height', height: 200 });

    const remember = (ratio: number, tileHeight: number) => {
      const next = nextMeasuredRatio(measured, ratio);
      if (next === measured) return;
      anchor = captureSeatScrollAnchor({
        tileTop: -400,
        tileBottom: -100,
        tileHeight,
        scrollerTop: 0,
        scrollTop: 800,
      });
      measured = next;
    };

    remember(1.5, 999);
    // Same ratio must not replace the live anchor with a stale height.
    expect(anchor).toEqual({ mode: 'height', height: 200 });
    expect(measured).toBe(1.5);

    remember(16 / 9, 120);
    expect(measured).toBe(16 / 9);
    expect(anchor).toEqual({ mode: 'height', height: 120 });
    expect(seatScrollDelta(anchor, {
      tileTop: -400,
      tileHeight: 120,
      scrollerTop: 0,
      scrollTop: 800,
    })).toBe(0);
  });
});
