import { describe, expect, it } from 'vitest';
import {
  keyboardDrawerFrameStyle,
  keyboardSeatPx,
  pageKeyboardLiftStyle,
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

  it('uses a measured seat when the card already ends on the keys', () => {
    expect(
      keyboardDrawerFrameStyle(
        { isMobile: true, height: 380, lift: 320 },
        736,
        0
      )
    ).toEqual({
      maxHeight: '380px',
      marginBottom: '0px',
    });
  });
});

describe('keyboardSeatPx', () => {
  it('lifts a sheet that still runs under the keyboard', () => {
    expect(
      keyboardSeatPx({
        lift: 320,
        rootBottom: 844,
        rootHeight: 844,
        visualBottom: 524,
      })
    ).toBe(320);
  });

  it('stays put when the card has already shrunk onto the keys', () => {
    expect(
      keyboardSeatPx({
        lift: 320,
        rootBottom: 524,
        rootHeight: 524,
        visualBottom: 524,
      })
    ).toBe(0);
  });

  it('falls back to the raw overlap before the sheet is laid out', () => {
    expect(
      keyboardSeatPx({
        lift: 320,
        rootBottom: null,
        rootHeight: 0,
        visualBottom: 524,
      })
    ).toBe(320);
  });

  it('never lifts past the keyboard', () => {
    expect(
      keyboardSeatPx({
        lift: 320,
        rootBottom: 2000,
        rootHeight: 900,
        visualBottom: 524,
      })
    ).toBe(320);
  });
});

describe('pageKeyboardLiftStyle', () => {
  it('writes the measured seat and clears a stale lift', () => {
    expect(
      pageKeyboardLiftStyle({ isMobile: true, height: 380, lift: 320 }, 0)
    ).toEqual({ '--os-keyboard-lift': '0px' });
  });
});
