import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { OverlayInterceptRoot } from '@/components/overlay/overlay-intercept-root';
import OverlayDefault from '@/app/[accountId]/@overlay/default';
import {
  isOverlayDefaultSlot,
  isOverlayInterceptSlot,
  isOverlaySlotActive,
  resolveOverlaySlotMode,
} from './overlay-slot';

describe('resolveOverlaySlotMode', () => {
  it('returns idle for the default parallel slot', () => {
    expect(resolveOverlaySlotMode(createElement(OverlayDefault))).toBe('idle');
    expect(resolveOverlaySlotMode(null)).toBe('idle');
  });

  it('returns intercept for intercept overlay pages', () => {
    expect(
      resolveOverlaySlotMode(
        createElement(OverlayInterceptRoot, null, 'content')
      )
    ).toBe('intercept');
  });
});

describe('isOverlayDefaultSlot', () => {
  it('is true for the parallel route default', () => {
    expect(isOverlayDefaultSlot(createElement(OverlayDefault))).toBe(true);
    expect(isOverlayDefaultSlot(null)).toBe(true);
  });

  it('is false for intercept overlay pages', () => {
    expect(
      isOverlayDefaultSlot(
        createElement(OverlayInterceptRoot, null, 'content')
      )
    ).toBe(false);
  });
});

describe('isOverlaySlotActive', () => {
  it('is false when the overlay slot is idle', () => {
    expect(isOverlaySlotActive(createElement(OverlayDefault))).toBe(false);
  });

  it('is true when intercept content is mounted', () => {
    expect(
      isOverlaySlotActive(
        createElement(OverlayInterceptRoot, null, 'content')
      )
    ).toBe(true);
  });
});

describe('isOverlayInterceptSlot', () => {
  it('is true for intercept overlay pages', () => {
    expect(
      isOverlayInterceptSlot(
        createElement(OverlayInterceptRoot, null, 'content')
      )
    ).toBe(true);
  });
});
