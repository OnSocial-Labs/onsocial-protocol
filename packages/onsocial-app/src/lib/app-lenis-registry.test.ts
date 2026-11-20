/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from 'vitest';
import Lenis from 'lenis';
import {
  readAppScrollTop,
  registerAppLenis,
  shiftAppLenisScroll,
  unregisterAppLenis,
} from './app-lenis-registry';

function scrollRoot(): HTMLElement {
  const root = document.createElement('div');
  Object.defineProperty(root, 'clientHeight', { value: 600 });
  Object.defineProperty(root, 'clientWidth', { value: 400 });
  Object.defineProperty(root, 'scrollHeight', { value: 8000 });
  Object.defineProperty(root, 'scrollWidth', { value: 400 });
  root.scrollTo = ((options?: ScrollToOptions) => {
    if (options && typeof options.top === 'number')
      root.scrollTop = options.top;
  }) as HTMLElement['scrollTo'];
  document.body.appendChild(root);
  return root;
}

describe('shiftAppLenisScroll', () => {
  const roots: HTMLElement[] = [];

  afterEach(() => {
    for (const root of roots) root.remove();
    roots.length = 0;
  });

  it('keeps a coast shift after the next animation frame', () => {
    const root = scrollRoot();
    roots.push(root);
    const lenis = new Lenis({
      wrapper: root,
      content: root,
      autoRaf: false,
      autoResize: false,
      duration: 1.5,
      lerp: 0.1,
      smoothWheel: true,
    });
    registerAppLenis(root, lenis);
    lenis.scrollTo(900, {
      programmatic: false,
      duration: lenis.options.duration,
      easing: lenis.options.easing,
      lerp: lenis.options.lerp,
    });
    lenis.raf(1_000);
    const animated = lenis.animatedScroll;
    const target = lenis.targetScroll;
    expect(animated).toBeGreaterThan(0);
    expect(animated).toBeLessThan(target);

    shiftAppLenisScroll(root, 300);
    // One frame. The unshifted animator is still near `animated`;
    // a shift that sticks stays about 300px ahead of it.
    lenis.raf(1_016);

    expect(lenis.targetScroll).toBeGreaterThanOrEqual(target + 299);
    expect(lenis.animatedScroll).toBeGreaterThan(animated + 250);
    expect(root.scrollTop).toBeGreaterThan(animated + 250);
    unregisterAppLenis(root);
    lenis.destroy();
  });
});

describe('readAppScrollTop', () => {
  it('prefers the larger of native scrollTop and Lenis scroll', () => {
    const root = document.createElement('div');
    root.scrollTop = 120;
    expect(readAppScrollTop(root)).toBe(120);
    registerAppLenis(root, {
      limit: 1000,
      scroll: 400,
      resize: () => {},
      scrollTo: () => {},
    });
    expect(readAppScrollTop(root)).toBe(400);
    root.scrollTop = 500;
    expect(readAppScrollTop(root)).toBe(500);
    unregisterAppLenis(root);
  });
});
