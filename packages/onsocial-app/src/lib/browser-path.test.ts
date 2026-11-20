import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('subscribeBrowserPath', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('defers listeners so replaceState does not notify synchronously', async () => {
    const history = {
      state: null as unknown,
      pushState: vi.fn(),
      replaceState: vi.fn(function replaceState(
        this: { state: unknown },
        state: unknown,
        _title: string,
        url?: string | URL | null
      ) {
        this.state = state;
        if (typeof url === 'string' && url.startsWith('/')) {
          window.location.pathname = url.split('?')[0] ?? url;
          window.location.search = url.includes('?')
            ? `?${url.split('?')[1]}`
            : '';
        }
      }),
    };
    vi.stubGlobal('window', {
      location: { pathname: '/a', search: '' },
      history,
      addEventListener: vi.fn(),
    });

    const { subscribeBrowserPath } = await import('./browser-path');
    const listener = vi.fn();
    const unsubscribe = subscribeBrowserPath(listener);

    window.history.replaceState(null, '', '/b');
    expect(listener).not.toHaveBeenCalled();

    await Promise.resolve();
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
  });
});
