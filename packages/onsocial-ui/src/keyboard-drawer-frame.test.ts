import { describe, expect, it } from 'vitest';
import {
  correctedKeyboardSeat,
  keyboardDrawerFrameStyle,
  keyboardFrameNeedsSeat,
  keyboardRootFrameStyle,
  keyboardSeatPx,
  pageKeyboardLiftStyle,
  settleKeyboardDrawerMetrics,
  settleVisualKeyboardFrame,
  visualKeyboardFrame,
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

  it('keeps the seat when typing pans the visual viewport', () => {
    const held = { isMobile: true, height: 380, lift: 320 };
    expect(
      settleKeyboardDrawerMetrics(held, {
        isMobile: true,
        height: 380,
        lift: 40,
      })
    ).toBe(held);
  });

  it('follows a real keyboard resize', () => {
    const held = { isMobile: true, height: 380, lift: 320 };
    const grown = { isMobile: true, height: 260, lift: 440 };
    expect(settleKeyboardDrawerMetrics(held, grown)).toEqual(grown);
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

describe('correctedKeyboardSeat', () => {
  it('leaves a drawer that is already on the keys', () => {
    expect(
      correctedKeyboardSeat({
        lift: 320,
        appliedSeat: 0,
        panelBottom: 524,
        visibleBottom: 524,
        fallbackSeat: 320,
      })
    ).toBe(0);
  });

  it('lifts a drawer that is still under the keys', () => {
    expect(
      correctedKeyboardSeat({
        lift: 320,
        appliedSeat: 0,
        panelBottom: 844,
        visibleBottom: 524,
        fallbackSeat: 0,
      })
    ).toBe(320);
  });

  it('drops a double lift back onto the keys', () => {
    expect(
      correctedKeyboardSeat({
        lift: 320,
        appliedSeat: 320,
        panelBottom: 204,
        visibleBottom: 524,
        fallbackSeat: 320,
      })
    ).toBe(0);
  });

  it('uses the root overlap before the panel is laid out', () => {
    expect(
      correctedKeyboardSeat({
        lift: 320,
        appliedSeat: 0,
        panelBottom: null,
        visibleBottom: 524,
        fallbackSeat: 180,
      })
    ).toBe(180);
  });
});

describe('visualKeyboardFrame', () => {
  it('pins a fixed drawer to the visible screen', () => {
    expect(
      visualKeyboardFrame({
        position: 'fixed',
        parentTop: 0,
        parentHeight: 844,
        offsetTop: 140,
        visualHeight: 520,
      })
    ).toEqual({ top: 140, height: 520 });
  });

  it('moves an absolute drawer down when its card still fills the layout', () => {
    expect(
      visualKeyboardFrame({
        position: 'absolute',
        parentTop: 0,
        parentHeight: 844,
        offsetTop: 140,
        visualHeight: 520,
      })
    ).toEqual({ top: 140, height: 520 });
  });

  it('does not push a card that has already shrunk onto the keys', () => {
    expect(
      visualKeyboardFrame({
        position: 'absolute',
        parentTop: 0,
        parentHeight: 520,
        offsetTop: 140,
        visualHeight: 520,
      })
    ).toEqual({ top: 0, height: 520 });
  });

  it('follows the visible top and ignores a suggestion-bar height twitch', () => {
    const held = { top: 0, height: 520 };
    expect(settleVisualKeyboardFrame(held, { top: 48, height: 480 })).toEqual({
      top: 48,
      height: 520,
    });
  });

  it('follows a real keyboard resize', () => {
    expect(
      settleVisualKeyboardFrame(
        { top: 0, height: 700 },
        { top: 0, height: 380 }
      )
    ).toEqual({ top: 0, height: 380 });
  });

  it('styles the root as that box and does not add a keyboard margin', () => {
    expect(keyboardRootFrameStyle({ top: 140, height: 520 })).toEqual({
      top: '140px',
      height: '520px',
      bottom: 'auto',
      paddingBottom: 0,
    });
  });
});

describe('keyboardFrameNeedsSeat', () => {
  it('ignores a caret scroll once the keyboard height is settled', () => {
    expect(keyboardFrameNeedsSeat('scroll', false)).toBe(false);
  });

  it('reseats when the keyboard height changes, including on scroll', () => {
    expect(keyboardFrameNeedsSeat('scroll', true)).toBe(true);
    expect(keyboardFrameNeedsSeat('layout', false)).toBe(true);
  });
});

describe('pageKeyboardLiftStyle', () => {
  it('writes the measured seat and clears a stale lift', () => {
    expect(
      pageKeyboardLiftStyle({ isMobile: true, height: 380, lift: 320 }, 0)
    ).toEqual({ '--os-keyboard-lift': '0px' });
  });
});
