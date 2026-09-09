import { describe, expect, it, vi } from 'vitest';
import {
  OS_CHROME_TUCKED_ATTR,
  isOsAppChromeVisuallyTucked,
  syncOsScreenChromeHeight,
} from './os-screen-chrome-height';

function mockHeader({
  className = '',
  tuckedRail = false,
  standingTucked = false,
  dataTucked = false,
  childDataTucked = false,
  offsetHeight = 96,
}: {
  className?: string;
  tuckedRail?: boolean;
  standingTucked?: boolean;
  dataTucked?: boolean;
  childDataTucked?: boolean;
  offsetHeight?: number;
} = {}): HTMLElement {
  return {
    classList: {
      contains: (token: string) => className.split(/\s+/).includes(token),
    },
    hasAttribute: (name: string) =>
      dataTucked && name === OS_CHROME_TUCKED_ATTR,
    querySelector: (selector: string) => {
      if (
        childDataTucked &&
        selector === `[${OS_CHROME_TUCKED_ATTR}]`
      ) {
        return {};
      }
      if (
        tuckedRail &&
        selector === '.os-app-chrome-rail.is-scroll-hidden'
      ) {
        return {};
      }
      if (
        standingTucked &&
        selector === '.standing-toolbar-rail.is-scroll-hidden'
      ) {
        return {};
      }
      return null;
    },
    offsetHeight,
  } as unknown as HTMLElement;
}

describe('isOsAppChromeVisuallyTucked', () => {
  it('is false for a resting header', () => {
    expect(isOsAppChromeVisuallyTucked(mockHeader())).toBe(false);
  });

  it('detects data-os-chrome-tucked on the header', () => {
    expect(isOsAppChromeVisuallyTucked(mockHeader({ dataTucked: true }))).toBe(
      true
    );
  });

  it('detects data-os-chrome-tucked on a descendant rail', () => {
    expect(
      isOsAppChromeVisuallyTucked(mockHeader({ childDataTucked: true }))
    ).toBe(true);
  });

  it('detects search tuck on the header (class fallback)', () => {
    expect(
      isOsAppChromeVisuallyTucked(mockHeader({ className: 'is-search-tucked' }))
    ).toBe(true);
  });

  it('detects a scroll-hidden chrome rail (class fallback)', () => {
    expect(
      isOsAppChromeVisuallyTucked(mockHeader({ tuckedRail: true }))
    ).toBe(true);
  });

  it('detects a scroll-hidden standing toolbar rail (class fallback)', () => {
    expect(
      isOsAppChromeVisuallyTucked(mockHeader({ standingTucked: true }))
    ).toBe(true);
  });
});

describe('syncOsScreenChromeHeight', () => {
  it('records resting height when chrome is revealed', () => {
    const setProperty = vi.fn();
    const screen = { style: { setProperty } } as unknown as HTMLElement;
    const resting = { current: 0 };

    syncOsScreenChromeHeight(screen, mockHeader(), resting);

    expect(resting.current).toBe(96);
    expect(setProperty).toHaveBeenCalledWith('--os-screen-chrome-height', '96px');
  });

  it('freezes resting height while chrome is visually tucked', () => {
    const setProperty = vi.fn();
    const screen = { style: { setProperty } } as unknown as HTMLElement;
    const resting = { current: 112 };

    syncOsScreenChromeHeight(
      screen,
      mockHeader({ dataTucked: true, offsetHeight: 64 }),
      resting
    );

    expect(resting.current).toBe(112);
    expect(setProperty).toHaveBeenCalledWith(
      '--os-screen-chrome-height',
      '112px'
    );
  });

  it('does not write while tucked before a resting height exists', () => {
    const setProperty = vi.fn();
    const screen = { style: { setProperty } } as unknown as HTMLElement;
    const resting = { current: 0 };

    syncOsScreenChromeHeight(
      screen,
      mockHeader({ dataTucked: true }),
      resting
    );

    expect(setProperty).not.toHaveBeenCalled();
  });
});
