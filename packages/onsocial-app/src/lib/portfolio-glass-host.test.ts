import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { OverlayInterceptRoot } from '@/components/overlay/overlay-intercept-root';
import OverlayDefault from '@/app/[accountId]/@overlay/default';
import {
  resolveOverlaySlotMode,
  shouldMountPortfolioGlassHost,
} from './portfolio-glass-host';

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

describe('shouldMountPortfolioGlassHost', () => {
  it('mounts on soft intercept from profile', () => {
    expect(
      shouldMountPortfolioGlassHost({
        pathname: '/@alice.testnet/standing/incoming',
        layoutSegments: [],
        overlaySlotMode: 'intercept',
      })
    ).toBe(true);
  });

  it('mounts when portfolio is still active before slot mode commits', () => {
    expect(
      shouldMountPortfolioGlassHost({
        pathname: '/@alice.testnet/discover',
        layoutSegments: [],
        overlaySlotMode: 'idle',
      })
    ).toBe(true);
  });

  it('does not mount on hard refresh full-page panel routes', () => {
    expect(
      shouldMountPortfolioGlassHost({
        pathname: '/@alice.testnet/standing/incoming',
        layoutSegments: ['standing', 'incoming'],
        overlaySlotMode: 'idle',
      })
    ).toBe(false);
    expect(
      shouldMountPortfolioGlassHost({
        pathname: '/@alice.testnet/discover',
        layoutSegments: ['discover'],
        overlaySlotMode: 'intercept',
      })
    ).toBe(false);
  });

  it('does not mount on portfolio root', () => {
    expect(
      shouldMountPortfolioGlassHost({
        pathname: '/@alice.testnet',
        layoutSegments: [],
        overlaySlotMode: 'idle',
      })
    ).toBe(false);
  });
});
