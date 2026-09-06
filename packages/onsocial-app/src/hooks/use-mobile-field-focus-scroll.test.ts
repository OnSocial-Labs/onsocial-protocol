import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  focusComposerField,
  scrollMobileFieldIntoView,
} from '@/hooks/use-mobile-field-focus-scroll';

afterEach(() => {
  vi.unstubAllGlobals();
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
