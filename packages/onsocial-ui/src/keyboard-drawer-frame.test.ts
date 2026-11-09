import { describe, expect, it } from 'vitest';
import { keyboardDrawerFrameStyle } from './keyboard-drawer-frame.js';

describe('keyboardDrawerFrameStyle', () => {
  it('stays unset when the keyboard is closed', () => {
    expect(
      keyboardDrawerFrameStyle({ isMobile: true, height: 700, lift: 0 })
    ).toBeUndefined();
  });

  it('sits the drawer on the keys and caps it at the visible screen', () => {
    expect(
      keyboardDrawerFrameStyle({ isMobile: true, height: 380, lift: 320 })
    ).toEqual({
      maxHeight: '380px',
      marginBottom: 'calc(320px - env(safe-area-inset-bottom, 0px))',
    });
  });

  it('does not stretch a short phone past the commerce cap', () => {
    expect(
      keyboardDrawerFrameStyle({ isMobile: true, height: 900, lift: 100 }, 736)
        ?.maxHeight
    ).toBe('736px');
  });
});
