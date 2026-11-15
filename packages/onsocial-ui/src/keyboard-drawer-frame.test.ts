import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  correctedKeyboardSeat,
  ensureVirtualKeyboardOverlay,
  keyboardDrawerFrameStyle,
  keyboardFrameNeedsSeat,
  keyboardFrameTop,
  keyboardRootFrameStyle,
  keyboardSeatPx,
  pageKeyboardLiftStyle,
  readKeyboardDrawerMetrics,
  readKeyboardVisibleBottom,
  readVirtualKeyboardInset,
  settleKeyboardDrawerMetrics,
  settleVisualKeyboardFrame,
  virtualKeyboardSeatActive,
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

  it('brings an absolute drawer back when its card has left the screen', () => {
    expect(
      visualKeyboardFrame({
        position: 'absolute',
        parentTop: -140,
        parentHeight: 844,
        offsetTop: 140,
        visualHeight: 520,
      })
    ).toEqual({ top: 140, height: 520 });
  });

  it('keeps an absolute drawer at the top of a card that is already on screen', () => {
    expect(
      visualKeyboardFrame({
        position: 'absolute',
        parentTop: 0,
        parentHeight: 844,
        offsetTop: 140,
        visualHeight: 520,
      })
    ).toEqual({ top: 0, height: 520 });
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

  it('ignores a paste pan while the keyboard height is held', () => {
    const held = { top: 0, height: 520 };
    expect(settleVisualKeyboardFrame(held, { top: 48, height: 480 })).toBe(
      held
    );
  });

  it('follows a real keyboard resize', () => {
    expect(
      settleVisualKeyboardFrame(
        { top: 0, height: 700 },
        { top: 0, height: 380 }
      )
    ).toEqual({ top: 0, height: 380 });
    expect(
      settleVisualKeyboardFrame(
        { top: 0, height: 700 },
        { top: 40, height: 380 }
      )
    ).toEqual({ top: 40, height: 380 });
  });

  it('fills the root to the layout bottom so the page cannot peek under', () => {
    expect(keyboardRootFrameStyle({ top: 140, height: 520 })).toEqual({
      top: '140px',
      bottom: 0,
      height: 'auto',
      paddingBottom: 0,
    });
  });
});

describe('keyboardFrameTop', () => {
  it('pulls a sheet back up when the pan top left a strip', () => {
    expect(
      keyboardFrameTop({ appliedTop: 140, frameTop: 140, parentTop: 0 })
    ).toBe(0);
  });

  it('pulls a lifted page back onto the visual top', () => {
    expect(
      keyboardFrameTop({ appliedTop: 0, frameTop: -140, parentTop: 0 })
    ).toBe(140);
  });

  it('leaves a sheet that is already on the visual top', () => {
    expect(keyboardFrameTop({ appliedTop: 0, frameTop: 0, parentTop: 0 })).toBe(
      0
    );
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

describe('virtual keyboard seat', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(navigator, 'virtualKeyboard');
  });

  function stubPhoneWindow(input: {
    innerHeight: number;
    viewportHeight: number;
    offsetTop?: number;
  }) {
    const visualViewport = {
      height: input.viewportHeight,
      offsetTop: input.offsetTop ?? 0,
      addEventListener() {},
      removeEventListener() {},
    };
    const matchMedia = vi.fn().mockReturnValue({ matches: true });
    vi.stubGlobal('window', {
      innerHeight: input.innerHeight,
      visualViewport,
      matchMedia,
    });
    vi.stubGlobal('innerHeight', input.innerHeight);
    vi.stubGlobal('visualViewport', visualViewport);
    vi.stubGlobal('matchMedia', matchMedia);
  }

  it('returns no IME inset without the Virtual Keyboard API', () => {
    expect(readVirtualKeyboardInset()).toBe(0);
    expect(ensureVirtualKeyboardOverlay()).toBe(false);
  });

  it('seats on the IME top when overlaysContent reports a keyboard', () => {
    const virtualKeyboard = {
      overlaysContent: false,
      boundingRect: { x: 0, y: 520, width: 390, height: 324 },
      addEventListener() {},
      removeEventListener() {},
    };
    Object.defineProperty(navigator, 'virtualKeyboard', {
      configurable: true,
      value: virtualKeyboard,
    });
    stubPhoneWindow({ innerHeight: 844, viewportHeight: 844 });

    expect(ensureVirtualKeyboardOverlay()).toBe(true);
    expect(virtualKeyboard.overlaysContent).toBe(true);
    expect(readVirtualKeyboardInset()).toBe(324);
    expect(readKeyboardVisibleBottom()).toBe(520);
    expect(readKeyboardDrawerMetrics()).toEqual({
      lift: 324,
      height: 520,
      isMobile: true,
    });
  });

  it('falls back to visualViewport when the IME is closed', () => {
    const virtualKeyboard = {
      overlaysContent: true,
      boundingRect: { x: 0, y: 0, width: 0, height: 0 },
      addEventListener() {},
      removeEventListener() {},
    };
    Object.defineProperty(navigator, 'virtualKeyboard', {
      configurable: true,
      value: virtualKeyboard,
    });
    stubPhoneWindow({ innerHeight: 844, viewportHeight: 520 });

    expect(readVirtualKeyboardInset()).toBe(0);
    expect(readKeyboardVisibleBottom()).toBe(520);
    expect(readKeyboardDrawerMetrics()).toEqual({
      lift: 324,
      height: 520,
      isMobile: true,
    });
  });

  it('closes the Brave tab gap when VV stays full and IME reports key top', () => {
    // Tab browser: visualViewport often does not shrink; only VK has the keys.
    // height fills to layout bottom (844 - 500) so y and height agree.
    const virtualKeyboard = {
      overlaysContent: true,
      boundingRect: { x: 0, y: 500, width: 390, height: 344 },
      addEventListener() {},
      removeEventListener() {},
    };
    Object.defineProperty(navigator, 'virtualKeyboard', {
      configurable: true,
      value: virtualKeyboard,
    });
    stubPhoneWindow({ innerHeight: 844, viewportHeight: 844 });

    const vvOnlyLift = 844 - 844 - 0;
    expect(vvOnlyLift).toBe(0);
    expect(readKeyboardDrawerMetrics()).toEqual({
      lift: 344,
      height: 500,
      isMobile: true,
    });
    expect(readKeyboardVisibleBottom()).toBe(500);

    // Same flush assert the Playwright Location drawer checks: root bottom = key top.
    const metrics = readKeyboardDrawerMetrics();
    const box = visualKeyboardFrame({
      position: 'fixed',
      parentTop: 0,
      parentHeight: 844,
      offsetTop: 0,
      visualHeight: metrics.height,
    });
    const root = keyboardRootFrameStyle(box);
    expect(root).toEqual({
      top: '0px',
      bottom: 0,
      height: 'auto',
      paddingBottom: 0,
    });
    // Panel maxHeight still tracks the visible box above the keys.
    expect(box.top + box.height).toBe(500);
  });

  it('takes the lower IME edge when Brave leaves a shortfall under the box', () => {
    // y=500, height=300 → 44px short of innerHeight. That strip is the gap.
    const virtualKeyboard = {
      overlaysContent: true,
      boundingRect: { x: 0, y: 500, width: 390, height: 300 },
      addEventListener() {},
      removeEventListener() {},
    };
    Object.defineProperty(navigator, 'virtualKeyboard', {
      configurable: true,
      value: virtualKeyboard,
    });
    stubPhoneWindow({ innerHeight: 844, viewportHeight: 844 });

    expect(readKeyboardVisibleBottom()).toBe(544);
    expect(readKeyboardDrawerMetrics()).toEqual({
      lift: 300,
      height: 544,
      isMobile: true,
    });
  });

  it('follows a ~40px IME correction instead of settling it as suggestion noise', () => {
    // Brave often paints one short geometrychange, then corrects by ~40px —
    // the same magnitude as a suggestion bar. Trust IME; do not hold short.
    const virtualKeyboard = {
      overlaysContent: true,
      boundingRect: { x: 0, y: 540, width: 390, height: 304 },
      addEventListener() {},
      removeEventListener() {},
    };
    Object.defineProperty(navigator, 'virtualKeyboard', {
      configurable: true,
      value: virtualKeyboard,
    });
    stubPhoneWindow({ innerHeight: 844, viewportHeight: 844 });

    const short = { isMobile: true, height: 540, lift: 304 };
    const corrected = readKeyboardDrawerMetrics();
    expect(corrected).toEqual({ lift: 304, height: 540, isMobile: true });
    // Without trust, settle would keep `short` forever on a 40px height drop.
    expect(
      settleKeyboardDrawerMetrics(short, {
        isMobile: true,
        height: 500,
        lift: 344,
      })
    ).toBe(short);
    // Callers skip settle while virtualKeyboardSeatActive().
    expect(virtualKeyboardSeatActive()).toBe(true);
    virtualKeyboard.boundingRect = { x: 0, y: 500, width: 390, height: 344 };
    expect(readKeyboardDrawerMetrics()).toEqual({
      lift: 344,
      height: 500,
      isMobile: true,
    });
  });
});
