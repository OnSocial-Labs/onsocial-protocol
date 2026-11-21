// @ts-nocheck — renderer tests follow the existing panel harness.
import { act, createElement } from 'react';
import { create } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RollingNumber } from '@/components/ui/rolling-number';

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe('first-like zero crossing paint (render)', () => {
  const pending = new Map<number, FrameRequestCallback>();
  let rafId = 0;

  beforeEach(() => {
    pending.clear();
    rafId = 0;
    const requestAnimationFrame = (cb: FrameRequestCallback) => {
      rafId += 1;
      pending.set(rafId, cb);
      return rafId;
    };
    const cancelAnimationFrame = (id: number) => {
      pending.delete(id);
    };
    const matchMedia = () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    });
    vi.stubGlobal('window', {
      matchMedia,
      requestAnimationFrame,
      cancelAnimationFrame,
      setTimeout: () => 0,
      clearTimeout: () => {},
    });
    vi.stubGlobal('matchMedia', matchMedia);
    vi.stubGlobal('requestAnimationFrame', requestAnimationFrame);
    vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrame);
    vi.stubGlobal('setTimeout', () => 0);
    vi.stubGlobal('clearTimeout', () => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function flushRaf() {
    const batch = [...pending.entries()];
    pending.clear();
    for (const [, cb] of batch) cb(0);
  }

  function stripCount(root: ReturnType<typeof create>): number {
    return root.root.findAll(
      (node) =>
        typeof node.props?.className === 'string' &&
        node.props.className.includes('os-rolling-digit-strip')
    ).length;
  }

  it('mounts the strip for 0→1 so the ones place rolls', () => {
    let root!: ReturnType<typeof create>;
    act(() => {
      root = create(createElement(RollingNumber, { value: 0, rollSignal: 0 }));
    });

    act(() => {
      root.update(createElement(RollingNumber, { value: 1, rollSignal: 1 }));
    });
    act(() => {
      flushRaf();
    });
    expect(stripCount(root)).toBe(1);

    act(() => {
      flushRaf();
    });
    expect(
      root.root.findAll(
        (node) =>
          typeof node.props?.className === 'string' &&
          node.props.className.includes('is-rolling')
      ).length
    ).toBe(1);
  });
});
