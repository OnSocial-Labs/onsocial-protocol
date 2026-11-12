import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  estimateTextareaCaretOffsetTop,
  focusComposerField,
  keepComposerCaretVisible,
  nearestScrollContainer,
  scrollMobileFieldIntoView,
  shouldForceComposerPrimaryFocus,
} from '@/hooks/use-mobile-field-focus-scroll';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('shouldForceComposerPrimaryFocus', () => {
  it('is false for field onFocus (keeps poll / article body focus)', () => {
    expect(shouldForceComposerPrimaryFocus()).toBe(false);
    expect(shouldForceComposerPrimaryFocus({})).toBe(false);
    expect(shouldForceComposerPrimaryFocus({ focusPrimary: false })).toBe(
      false
    );
  });

  it('is true only for muted-beat clicks that need a primary field', () => {
    expect(shouldForceComposerPrimaryFocus({ focusPrimary: true })).toBe(true);
  });
});

describe('focusComposerField', () => {
  it('no-ops without a field', () => {
    expect(() => focusComposerField(null)).not.toThrow();
  });

  it('focuses and puts the caret at the end', () => {
    const field = {
      value: 'hello',
      focus: vi.fn(),
      setSelectionRange: vi.fn(),
    } as unknown as HTMLTextAreaElement;

    focusComposerField(field);

    expect(field.focus).toHaveBeenCalledOnce();
    expect(field.setSelectionRange).toHaveBeenCalledWith(5, 5);
  });
});

describe('nearestScrollContainer', () => {
  it('returns null without a field', () => {
    expect(nearestScrollContainer(null)).toBeNull();
  });
});

describe('estimateTextareaCaretOffsetTop', () => {
  it('returns the mirror marker offset for the caret', () => {
    const marker = { offsetTop: 66, textContent: '' };
    const mirror = {
      style: {} as Record<string, string>,
      setAttribute: vi.fn(),
      textContent: '',
      appendChild: vi.fn(),
      remove: vi.fn(),
    };
    const field = {
      value: 'one\ntwo\nthree',
      selectionStart: 8,
    } as unknown as HTMLTextAreaElement;

    vi.stubGlobal('document', {
      createElement: (tag: string) => (tag === 'span' ? marker : mirror),
      body: { appendChild: vi.fn() },
    });
    vi.stubGlobal('window', {
      getComputedStyle: () =>
        Object.fromEntries(
          [
            'boxSizing',
            'width',
            'paddingTop',
            'paddingRight',
            'paddingBottom',
            'paddingLeft',
            'borderTopWidth',
            'borderRightWidth',
            'borderBottomWidth',
            'borderLeftWidth',
            'fontStyle',
            'fontVariant',
            'fontWeight',
            'fontStretch',
            'fontSize',
            'fontFamily',
            'lineHeight',
            'letterSpacing',
            'textTransform',
            'textAlign',
            'whiteSpace',
            'wordSpacing',
            'wordBreak',
            'overflowWrap',
          ].map((key) => [key, ''])
        ),
    });

    expect(estimateTextareaCaretOffsetTop(field)).toBe(66);
    expect(mirror.appendChild).toHaveBeenCalledWith(marker);
    expect(mirror.remove).toHaveBeenCalledOnce();
  });
});

describe('keepComposerCaretVisible', () => {
  it('no-ops without a field', () => {
    expect(() => keepComposerCaretVisible(null)).not.toThrow();
  });

  it('scrolls the sheet body when the field bottom sits below the fold', () => {
    const scroller = {
      scrollTop: 0,
      scrollHeight: 800,
      clientHeight: 400,
      parentElement: null,
      style: { overflowY: 'auto' },
      getBoundingClientRect: () => ({
        top: 0,
        bottom: 400,
        left: 0,
        right: 300,
        width: 300,
        height: 400,
      }),
    };

    const field = {
      tagName: 'INPUT',
      parentElement: scroller,
      getBoundingClientRect: () => ({
        top: 200,
        bottom: 520,
        left: 0,
        right: 300,
        width: 300,
        height: 320,
      }),
    } as unknown as HTMLInputElement;

    vi.stubGlobal('document', { activeElement: field });
    vi.stubGlobal('getComputedStyle', () => ({ overflowY: 'auto' }));
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    vi.stubGlobal('window', {
      getComputedStyle: () => ({ overflowY: 'auto' }),
      requestAnimationFrame: (cb: FrameRequestCallback) => {
        cb(0);
        return 1;
      },
      innerHeight: 800,
    });

    keepComposerCaretVisible(field);
    expect(scroller.scrollTop).toBeGreaterThan(0);
  });

  it('scrolls mid-document caret into the sheet fold', () => {
    const scroller = {
      scrollTop: 0,
      scrollHeight: 900,
      clientHeight: 200,
      parentElement: null,
      style: { overflowY: 'auto' },
      getBoundingClientRect: () => ({
        top: 0,
        bottom: 200,
        left: 0,
        right: 280,
        width: 280,
        height: 200,
      }),
    };

    const marker = { offsetTop: 420, textContent: '' };
    const mirror = {
      style: {} as Record<string, string>,
      setAttribute: vi.fn(),
      textContent: '',
      appendChild: vi.fn(),
      remove: vi.fn(),
    };

    const field = {
      tagName: 'TEXTAREA',
      value: 'long body',
      selectionStart: 4,
      scrollTop: 0,
      parentElement: scroller,
      getBoundingClientRect: () => ({
        top: -100,
        bottom: 700,
        left: 0,
        right: 260,
        width: 260,
        height: 800,
      }),
    } as unknown as HTMLTextAreaElement;

    vi.stubGlobal('document', {
      activeElement: field,
      createElement: (tag: string) => (tag === 'span' ? marker : mirror),
      body: { appendChild: vi.fn() },
    });
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    vi.stubGlobal('window', {
      getComputedStyle: () => ({
        overflowY: 'auto',
        lineHeight: '22px',
        ...Object.fromEntries(
          [
            'boxSizing',
            'width',
            'paddingTop',
            'paddingRight',
            'paddingBottom',
            'paddingLeft',
            'borderTopWidth',
            'borderRightWidth',
            'borderBottomWidth',
            'borderLeftWidth',
            'fontStyle',
            'fontVariant',
            'fontWeight',
            'fontStretch',
            'fontSize',
            'fontFamily',
            'letterSpacing',
            'textTransform',
            'textAlign',
            'whiteSpace',
            'wordSpacing',
            'wordBreak',
            'overflowWrap',
          ].map((key) => [key, ''])
        ),
      }),
      requestAnimationFrame: (cb: FrameRequestCallback) => {
        cb(0);
        return 1;
      },
      innerHeight: 800,
    });

    keepComposerCaretVisible(field);
    // caretBottom ≈ -100 + 420 + 22 = 342 → past fold 200 → scroll ~154
    expect(scroller.scrollTop).toBeGreaterThan(100);
  });
});

describe('scrollMobileFieldIntoView', () => {
  it('scrolls a field that sits below the mobile keyboard gap', () => {
    const scrollIntoView = vi.fn();
    const field = {
      getBoundingClientRect: () => ({ top: 500, bottom: 580 }),
      scrollIntoView,
    } as unknown as HTMLElement;

    vi.stubGlobal('window', {
      matchMedia: () => ({ matches: true }),
      visualViewport: { offsetTop: 0, height: 400 },
      requestAnimationFrame: (cb: FrameRequestCallback) => {
        cb(0);
        return 1;
      },
      setTimeout: (cb: () => void) => {
        cb();
        return 1 as unknown as ReturnType<typeof setTimeout>;
      },
    });

    scrollMobileFieldIntoView(field);
    expect(scrollIntoView).toHaveBeenCalledWith({
      block: 'center',
      behavior: 'smooth',
    });
  });

  it('scrolls the page body so the field clears the keyboard chrome', () => {
    const scrollIntoView = vi.fn();
    let scrollTop = 0;
    const scroller = {
      get scrollTop() {
        return scrollTop;
      },
      set scrollTop(value: number) {
        scrollTop = value;
      },
      scrollHeight: 1400,
      clientHeight: 500,
      parentElement: null,
      getBoundingClientRect: () => ({
        top: 56,
        bottom: 844,
        left: 0,
        right: 390,
        width: 390,
        height: 788,
      }),
    };
    const field = {
      tagName: 'INPUT',
      isContentEditable: false,
      parentElement: scroller,
      closest: () => null,
      getBoundingClientRect: () => ({
        top: 700 - scrollTop,
        bottom: 744 - scrollTop,
      }),
      scrollIntoView,
    } as unknown as HTMLElement;

    vi.stubGlobal('window', {
      matchMedia: () => ({ matches: true }),
      visualViewport: { offsetTop: 0, height: 524 },
      getComputedStyle: () => ({ overflowY: 'auto' }),
      requestAnimationFrame: (cb: FrameRequestCallback) => {
        cb(0);
        return 1;
      },
      setTimeout: (cb: () => void) => {
        cb();
        return 1 as unknown as ReturnType<typeof setTimeout>;
      },
    });

    scrollMobileFieldIntoView(field);
    // Visible bottom is the keyboard (524) minus 12, not the layout bottom.
    expect(scrollTop).toBe(744 - (524 - 12));
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('clears a lifted format bar that sits above the keyboard', () => {
    let scrollTop = 0;
    const footer = {
      getBoundingClientRect: () => ({ top: 470, height: 54, bottom: 524 }),
    };
    const host = {
      querySelector: () => footer,
    };
    const scroller = {
      get scrollTop() {
        return scrollTop;
      },
      set scrollTop(value: number) {
        scrollTop = value;
      },
      scrollHeight: 1400,
      clientHeight: 500,
      parentElement: null,
      getBoundingClientRect: () => ({
        top: 56,
        bottom: 844,
        left: 0,
        right: 390,
        width: 390,
        height: 788,
      }),
    };
    const field = {
      tagName: 'INPUT',
      isContentEditable: false,
      parentElement: scroller,
      closest: (selector: string) =>
        selector === '.is-keyboard-open' ? host : null,
      getBoundingClientRect: () => ({
        top: 700 - scrollTop,
        bottom: 744 - scrollTop,
      }),
      scrollIntoView: vi.fn(),
    } as unknown as HTMLElement;

    vi.stubGlobal('window', {
      matchMedia: () => ({ matches: true }),
      visualViewport: { offsetTop: 0, height: 524 },
      getComputedStyle: () => ({ overflowY: 'auto' }),
      requestAnimationFrame: (cb: FrameRequestCallback) => {
        cb(0);
        return 1;
      },
      setTimeout: (cb: () => void) => {
        cb();
        return 1 as unknown as ReturnType<typeof setTimeout>;
      },
    });

    scrollMobileFieldIntoView(field);
    expect(scrollTop).toBe(744 - (470 - 12));
  });

  it('scrolls the drawer body and leaves the page still', () => {
    const scrollIntoView = vi.fn();
    const state = { scrollTop: 20 };
    const body = {
      get scrollTop() {
        return state.scrollTop;
      },
      set scrollTop(value: number) {
        state.scrollTop = value;
      },
      scrollHeight: 800,
      clientHeight: 220,
      parentElement: null,
      getBoundingClientRect: () => ({ top: 80, bottom: 300 }),
    };
    const field = {
      tagName: 'INPUT',
      isContentEditable: false,
      parentElement: body,
      closest: () => null,
      getBoundingClientRect: () => {
        const delta = state.scrollTop - 20;
        return { top: 340 - delta, bottom: 390 - delta };
      },
      scrollIntoView,
    } as unknown as HTMLElement;

    vi.stubGlobal('window', {
      matchMedia: () => ({ matches: true }),
      visualViewport: { offsetTop: 0, height: 800 },
      getComputedStyle: () => ({ overflowY: 'auto' }),
      requestAnimationFrame: (cb: FrameRequestCallback) => {
        cb(0);
        return 1;
      },
      setTimeout: (cb: () => void) => {
        cb();
        return 1 as unknown as ReturnType<typeof setTimeout>;
      },
    });

    scrollMobileFieldIntoView(field);
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(state.scrollTop).toBe(20 + (390 - (300 - 12)));
  });

  it('keeps a focused line below the overlay header', () => {
    let scrollTop = 80;
    const header = {
      getBoundingClientRect: () => ({ top: 0, bottom: 64, height: 64 }),
    };
    const screen = {
      querySelector: (selector: string) =>
        selector.includes('header') ? header : null,
    };
    const scroller = {
      get scrollTop() {
        return scrollTop;
      },
      set scrollTop(value: number) {
        scrollTop = value;
      },
      scrollHeight: 1400,
      clientHeight: 700,
      parentElement: null,
      getBoundingClientRect: () => ({
        top: 0,
        bottom: 800,
        left: 0,
        right: 390,
        width: 390,
        height: 800,
      }),
    };
    const field = {
      tagName: 'DIV',
      isContentEditable: true,
      parentElement: scroller,
      closest: (selector: string) =>
        selector.includes('os-app-screen') ? screen : null,
      getBoundingClientRect: () => ({
        top: 20 + (80 - scrollTop),
        bottom: 48 + (80 - scrollTop),
      }),
      scrollIntoView: vi.fn(),
    } as unknown as HTMLElement;

    vi.stubGlobal('window', {
      matchMedia: () => ({ matches: true }),
      visualViewport: { offsetTop: 0, height: 800 },
      getComputedStyle: () => ({ overflowY: 'auto' }),
      getSelection: () => null,
      requestAnimationFrame: (cb: FrameRequestCallback) => {
        cb(0);
        return 1;
      },
      setTimeout: (cb: () => void) => {
        cb();
        return 1 as unknown as ReturnType<typeof setTimeout>;
      },
    });

    scrollMobileFieldIntoView(field);
    expect(scrollTop).toBe(80 - (64 + 12 - 20));
  });

  it('does not scroll the page under an open editor', () => {
    const scrollIntoView = vi.fn();
    const field = {
      getBoundingClientRect: () => ({ top: 500, bottom: 580 }),
      closest: () => ({ nodeType: 1 }),
      scrollIntoView,
    } as unknown as HTMLElement;

    vi.stubGlobal('window', {
      matchMedia: () => ({ matches: true }),
      visualViewport: { offsetTop: 80, height: 400 },
      requestAnimationFrame: (cb: FrameRequestCallback) => {
        cb(0);
        return 1;
      },
      setTimeout: (cb: () => void) => {
        cb();
        return 1 as unknown as ReturnType<typeof setTimeout>;
      },
    });

    scrollMobileFieldIntoView(field);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('does not scroll on desktop', () => {
    const scrollIntoView = vi.fn();
    const field = {
      getBoundingClientRect: () => ({ top: 500, bottom: 580 }),
      scrollIntoView,
    } as unknown as HTMLElement;

    vi.stubGlobal('window', {
      matchMedia: () => ({ matches: false }),
      requestAnimationFrame: (cb: FrameRequestCallback) => {
        cb(0);
        return 1;
      },
    });

    scrollMobileFieldIntoView(field);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});
