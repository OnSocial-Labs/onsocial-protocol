import { describe, expect, it } from 'vitest';
import {
  keyboardDrawerFrameStyle,
  settleKeyboardDrawerMetrics,
} from './keyboard-drawer-frame.js';

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
      marginBottom: '320px',
    });
  });

  it('ignores a suggestion-bar twitch while the keyboard is already up', () => {
    const held = { isMobile: true, height: 380, lift: 320 };
    expect(
      settleKeyboardDrawerMetrics(held, {
        isMobile: true,
        height: 336,
        lift: 364,
      })
    ).toBe(held);
  });

  it('still lifts when the keyboard opens and drops when it closes', () => {
    const closed = { isMobile: true, height: 700, lift: 0 };
    const open = { isMobile: true, height: 380, lift: 320 };
    expect(settleKeyboardDrawerMetrics(closed, open)).toEqual(open);
    expect(settleKeyboardDrawerMetrics(open, closed)).toEqual(closed);
  });

  it('does not stretch a short phone past the commerce cap', () => {
    expect(
      keyboardDrawerFrameStyle({ isMobile: true, height: 900, lift: 100 }, 736)
        ?.maxHeight
    ).toBe('736px');
  });
});
