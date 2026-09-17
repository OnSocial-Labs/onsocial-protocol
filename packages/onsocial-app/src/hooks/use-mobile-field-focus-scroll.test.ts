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
