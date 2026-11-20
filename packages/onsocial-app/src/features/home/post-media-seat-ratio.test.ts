import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearFeedMediaMeasuredRatios,
  feedMediaMeasuredRatioCount,
  lookupFeedMediaRatio,
  PostMediaStrip,
  rememberFeedMediaRatio,
  resolveReservedSeatAspect,
  scrollerOwnsFeedWindow,
} from '@/features/home/post-media';

describe('reserved open/focused/quote seat ratio', () => {
  beforeEach(() => {
    clearFeedMediaMeasuredRatios();
  });

  it('evicts the oldest ratios once the session cache is full', () => {
    for (let i = 0; i < 205; i += 1) {
      rememberFeedMediaRatio(`https://example.com/r${i}.jpg`, 1 + i / 1000);
    }
    expect(feedMediaMeasuredRatioCount()).toBe(200);
    expect(lookupFeedMediaRatio('https://example.com/r0.jpg')).toBeNull();
    expect(lookupFeedMediaRatio('https://example.com/r4.jpg')).toBeNull();
    expect(lookupFeedMediaRatio('https://example.com/r5.jpg')).toBeCloseTo(
      1 + 5 / 1000
    );
    expect(lookupFeedMediaRatio('https://example.com/r204.jpg')).toBeCloseTo(
      1 + 204 / 1000
    );
  });

  it('detects a windowed feed scroller that already owns scroll correction', () => {
    const empty = {
      querySelector: () => null,
    } as unknown as ParentNode;
    expect(scrollerOwnsFeedWindow(empty)).toBe(false);
    const windowed = {
      querySelector: (sel: string) =>
        sel.includes('data-feed-window-spacer') ? {} : null,
    } as unknown as ParentNode;
    expect(scrollerOwnsFeedWindow(windowed)).toBe(true);
  });

  it('leaves the seat unlocked until dims are known, then takes the real ratio', () => {
    // Unknown — no forced 4:3 (main-like; avoids on-screen 4:3→snap).
    expect(resolveReservedSeatAspect(undefined, undefined, null)).toBeNull();
    expect(resolveReservedSeatAspect(undefined, undefined, 16 / 9)).toBe(
      String(16 / 9)
    );
    expect(resolveReservedSeatAspect(1920, 1080, null)).toBe('1920 / 1080');
    expect(resolveReservedSeatAspect(1920, 1080, 16 / 9)).toBe('1920 / 1080');
  });

  it('session-caches ratios the feed learns so open seats skip a placeholder frame', () => {
    const url = 'https://example.com/feed-learned.mp4';
    expect(lookupFeedMediaRatio(url)).toBeNull();
    rememberFeedMediaRatio(url, 16 / 9);
    expect(lookupFeedMediaRatio(url)).toBe(16 / 9);
    expect(
      resolveReservedSeatAspect(undefined, undefined, lookupFeedMediaRatio(url))
    ).toBe(String(16 / 9));
  });

  it('open page seat reads the feed-learned session ratio on first render', () => {
    const url = 'https://example.com/from-feed.mp4';
    rememberFeedMediaRatio(url, 16 / 9);

    const html = renderToStaticMarkup(
      createElement(PostMediaStrip, {
        items: [{ url, mime: 'video/mp4' }],
        size: 'page',
      })
    );

    expect(html).toMatch(
      new RegExp(`aspect-ratio:\\s*${String(16 / 9).replace('.', '\\.')}`)
    );
    expect(html).not.toMatch(/aspect-ratio:\s*4\s*\/\s*3/);
  });

  it('cold unhinted page seat does not force a 4:3 inline placeholder', () => {
    const html = renderToStaticMarkup(
      createElement(PostMediaStrip, {
        items: [{ url: 'https://example.com/cold.mp4', mime: 'video/mp4' }],
        size: 'page',
      })
    );

    expect(html).toContain('post-media-tile--page');
    expect(html).not.toMatch(/aspect-ratio:\s*4\s*\/\s*3/);
  });
});
