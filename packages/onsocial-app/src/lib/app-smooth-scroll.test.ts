import { describe, expect, it } from 'vitest';
import {
  APP_SMOOTH_SCROLL_LENIS_OPTIONS,
  APP_SMOOTH_SCROLL_ROOT_SELECTOR,
  APP_SMOOTH_WHEEL_MEDIA,
  isAppSmoothScrollLocked,
  prefersReducedMotion,
  shouldUseAppSmoothScroll,
} from './app-smooth-scroll';

describe('app smooth scroll', () => {
  it('targets the page and overlay overflow roots', () => {
    expect(APP_SMOOTH_SCROLL_ROOT_SELECTOR).toContain('.os-app-screen-body');
    expect(APP_SMOOTH_SCROLL_ROOT_SELECTOR).toContain('.portfolio-page');
    expect(APP_SMOOTH_SCROLL_ROOT_SELECTOR).toContain('.gate-scroll');
    expect(APP_SMOOTH_SCROLL_ROOT_SELECTOR).toContain('.glass-sheet-body');
    expect(APP_SMOOTH_SCROLL_ROOT_SELECTOR).toContain(
      '.os-app-chrome-scroller'
    );
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
