import { describe, expect, it, vi } from 'vitest';
import {
  isOsAppChromeVisuallyTucked,
  syncOsScreenChromeHeight,
} from './os-screen-chrome-height';

function headerWith(
  className = '',
  innerHTML = ''
): HTMLElement {
  const header = document.createElement('header');
  header.className = className;
  header.innerHTML = innerHTML;
  Object.defineProperty(header, 'offsetHeight', {
    configurable: true,
    get: () => 96,
  });
  return header;
}

describe('isOsAppChromeVisuallyTucked', () => {
  it('is false for a resting header', () => {
    expect(isOsAppChromeVisuallyTucked(headerWith())).toBe(false);
  });

  it('detects search tuck on the header', () => {
    expect(
      isOsAppChromeVisuallyTucked(headerWith('is-search-tucked'))
    ).toBe(true);
  });

  it('detects a scroll-hidden chrome rail', () => {
    expect(
      isOsAppChromeVisuallyTucked(
        headerWith('', '<div class="os-app-chrome-rail is-scroll-hidden"></div>')
      )
    ).toBe(true);
  });

  it('detects a scroll-hidden standing toolbar rail', () => {
    expect(
      isOsAppChromeVisuallyTucked(
        headerWith(
          '',
          '<div class="standing-toolbar-rail is-scroll-hidden"></div>'
        )
      )
    ).toBe(true);
  });
});

describe('syncOsScreenChromeHeight', () => {
  it('records resting height when chrome is revealed', () => {
    const screen = document.createElement('div');
    const setProperty = vi.spyOn(screen.style, 'setProperty');
    const resting = { current: 0 };
    const header = headerWith();

    syncOsScreenChromeHeight(screen, header, resting);

    expect(resting.current).toBe(96);
    expect(setProperty).toHaveBeenCalledWith('--os-screen-chrome-height', '96px');
  });

  it('freezes resting height while chrome is visually tucked', () => {
    const screen = document.createElement('div');
    const setProperty = vi.spyOn(screen.style, 'setProperty');
    const resting = { current: 112 };
    const header = headerWith('is-search-tucked');
    Object.defineProperty(header, 'offsetHeight', {
      configurable: true,
      get: () => 64,
    });

    syncOsScreenChromeHeight(screen, header, resting);

    expect(resting.current).toBe(112);
    expect(setProperty).toHaveBeenCalledWith(
      '--os-screen-chrome-height',
      '112px'
    );
  });

  it('does not write while tucked before a resting height exists', () => {
    const screen = document.createElement('div');
    const setProperty = vi.spyOn(screen.style, 'setProperty');
    const resting = { current: 0 };
    const header = headerWith('is-search-tucked');

    syncOsScreenChromeHeight(screen, header, resting);

    expect(setProperty).not.toHaveBeenCalled();
  });
});
