import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  APP_SMOOTH_SCROLL_LENIS_OPTIONS,
  APP_SMOOTH_SCROLL_ROOT_SELECTOR,
  APP_SMOOTH_WHEEL_MEDIA,
  isAppSmoothScrollLocked,
  isAppSmoothScrollPagerHost,
  prefersReducedMotion,
  shouldBindAppSmoothScrollRoot,
  shouldUseAppSmoothScroll,
} from './app-smooth-scroll';

const here = dirname(fileURLToPath(import.meta.url));
const provider = readFileSync(
  join(here, '../components/providers/app-smooth-scroll-provider.tsx'),
  'utf8'
);
const osAppScreen = readFileSync(
  join(here, '../components/app/os-app-screen.tsx'),
  'utf8'
);

describe('app smooth scroll', () => {
  it('targets the page and overlay overflow roots', () => {
    expect(APP_SMOOTH_SCROLL_ROOT_SELECTOR).toContain('.os-app-screen-body');
    expect(APP_SMOOTH_SCROLL_ROOT_SELECTOR).toContain('.portfolio-page');
    expect(APP_SMOOTH_SCROLL_ROOT_SELECTOR).toContain('.gate-scroll');
    expect(APP_SMOOTH_SCROLL_ROOT_SELECTOR).toContain('.glass-sheet-body');
    expect(APP_SMOOTH_SCROLL_ROOT_SELECTOR).toContain(
      '.os-app-chrome-scroller'
    );
    expect(APP_SMOOTH_SCROLL_ROOT_SELECTOR).toContain(
      '.leaderboard-pager-scroll'
    );
    // Drawers that scroll their own region, not a shared screen body.
    expect(APP_SMOOTH_SCROLL_ROOT_SELECTOR).toContain(
      '.feed-photo-thread-body'
    );
    expect(APP_SMOOTH_SCROLL_ROOT_SELECTOR).toContain('.post-quotes-screen');
    expect(APP_SMOOTH_SCROLL_ROOT_SELECTOR).toContain(
      '.post-quotes-page-scroll'
    );
  });

  it('keeps sideways swipes native on the paged quotes lists', () => {
    // The quotes pager is a horizontal snap strip; Lenis slices the event
    // path before the scroll root, so the guard must sit on the list inside.
    const panel = readFileSync(
      join(here, '../features/home/post-quotes-panel.tsx'),
      'utf8'
    );
    expect(panel).toContain('data-lenis-prevent-horizontal');
  });

  it('keeps Lenis off shells that do not scroll', () => {
    expect(shouldBindAppSmoothScrollRoot(false, 'auto')).toBe(true);
    expect(shouldBindAppSmoothScrollRoot(false, 'scroll')).toBe(true);
    expect(shouldBindAppSmoothScrollRoot(false, 'hidden')).toBe(false);
    expect(shouldBindAppSmoothScrollRoot(true, 'auto')).toBe(false);
    expect(provider).toContain('shouldBindAppSmoothScrollRoot');
  });

  it('keeps Lenis off the leaderboard pager host', () => {
    const host = {
      classList: { contains: (name: string) => name === 'os-app-screen-body' },
      querySelector: (selector: string) =>
        selector === '.leaderboard-pager' ? {} : null,
    } as unknown as HTMLElement;
    const plain = {
      classList: { contains: () => false },
      querySelector: () => null,
    } as unknown as HTMLElement;
    expect(isAppSmoothScrollPagerHost(host)).toBe(true);
    expect(isAppSmoothScrollPagerHost(plain)).toBe(false);
    const facePage = {
      classList: { contains: () => false },
      querySelector: () => null,
      closest: (selector: string) =>
        selector === '.protocol-face-pair' ? {} : null,
    } as unknown as HTMLElement;
    expect(isAppSmoothScrollPagerHost(facePage)).toBe(true);
    const proposals = {
      classList: { contains: () => false },
      querySelector: () => null,
      closest: (selector: string) =>
        selector === '.protocol-face-pair' ||
        selector.includes('.dao-proposals-page')
          ? {}
          : null,
    } as unknown as HTMLElement;
    expect(isAppSmoothScrollPagerHost(proposals)).toBe(false);
    const sheet = {
      classList: { contains: () => false },
      querySelector: () => null,
      closest: (selector: string) =>
        selector === '.protocol-face-pair' ||
        selector.includes('.glass-sheet-root')
          ? {}
          : null,
    } as unknown as HTMLElement;
    expect(isAppSmoothScrollPagerHost(sheet)).toBe(false);
    const slide = {
      classList: { contains: () => false },
      querySelector: () => null,
      closest: (selector: string) =>
        selector === '.protocol-face-pair' ||
        selector.includes('.os-slide-over')
          ? {}
          : null,
    } as unknown as HTMLElement;
    expect(isAppSmoothScrollPagerHost(slide)).toBe(false);
    expect(provider).toContain('isAppSmoothScrollPagerHost');
  });

  it('defers Lenis bind and suppresses class hydration on OsAppScreen body', () => {
    expect(provider).toContain('requestAnimationFrame');
    expect(provider).toContain('bindAppSmoothScrollRoots');
    expect(osAppScreen).toContain('os-app-screen-body');
    expect(osAppScreen).toContain('suppressHydrationWarning');
  });

  it('matches portal Lenis wheel coast', () => {
    expect(APP_SMOOTH_SCROLL_LENIS_OPTIONS.lerp).toBe(0.1);
    expect(APP_SMOOTH_SCROLL_LENIS_OPTIONS.duration).toBe(1.5);
    expect(APP_SMOOTH_SCROLL_LENIS_OPTIONS.smoothWheel).toBe(true);
  });

  it('keeps nested overflow on live scrollHeight', () => {
    expect(APP_SMOOTH_SCROLL_LENIS_OPTIONS.allowNestedScroll).toBe(true);
    expect(APP_SMOOTH_SCROLL_LENIS_OPTIONS.naiveDimensions).toBe(true);
    expect(APP_SMOOTH_SCROLL_LENIS_OPTIONS.autoRaf).toBe(true);
  });

  it('treats data-scroll-locked as stopped', () => {
    expect(isAppSmoothScrollLocked({ scrollLocked: 'true' })).toBe(true);
    expect(isAppSmoothScrollLocked({})).toBe(false);
    expect(isAppSmoothScrollLocked({ scrollLocked: '' })).toBe(false);
  });

  it('honors reduced motion', () => {
    expect(prefersReducedMotion(() => ({ matches: true }))).toBe(true);
    expect(prefersReducedMotion(() => ({ matches: false }))).toBe(false);
  });

  it('uses Lenis only for fine-pointer wheel, not touch phones', () => {
    const desktop = (query: string) => ({
      matches:
        query === APP_SMOOTH_WHEEL_MEDIA
          ? true
          : query === '(prefers-reduced-motion: reduce)'
            ? false
            : false,
    });
    const phone = (_query: string) => ({
      matches: false,
    });
    const reducedDesktop = (query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
    });

    expect(shouldUseAppSmoothScroll(desktop)).toBe(true);
    expect(shouldUseAppSmoothScroll(phone)).toBe(false);
    expect(shouldUseAppSmoothScroll(reducedDesktop)).toBe(false);
  });
});
