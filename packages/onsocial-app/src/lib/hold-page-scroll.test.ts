import { describe, expect, it, vi } from 'vitest';
import {
  rememberPageScrollOutside,
  restorePageScroll,
} from '@/lib/hold-page-scroll';

describe('rememberPageScrollOutside', () => {
  it('restores ancestors and the window, and leaves the page body free to scroll', () => {
    const body = {
      scrollTop: 40,
      scrollLeft: 0,
      parentElement: null as HTMLElement | null,
    };
    const windowHost = {
      scrollTop: 12,
      scrollLeft: 3,
      parentElement: null as HTMLElement | null,
    };
    body.parentElement = windowHost as unknown as HTMLElement;
    const field = {
      parentElement: body,
    } as unknown as HTMLElement;

    vi.stubGlobal('window', { scrollX: 0, scrollY: 180, scrollTo: vi.fn() });

    const snap = rememberPageScrollOutside(
      field,
      body as unknown as HTMLElement
    );
    body.scrollTop = 400;
    windowHost.scrollTop = 90;
    window.scrollY = 420;

    restorePageScroll(snap);

    expect(body.scrollTop).toBe(400);
    expect(windowHost.scrollTop).toBe(12);
    expect(window.scrollTo).toHaveBeenCalledWith(0, 180);
  });
});
