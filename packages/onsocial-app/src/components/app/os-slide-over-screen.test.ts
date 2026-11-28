// @vitest-environment jsdom
import { createElement, useEffect, useState } from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OsSlideOverScreen } from '@/components/app/os-slide-over-screen';

const calls = { close: 0, closed: 0 };

function Parent({ open, nonce }: { open: boolean; nonce: number }) {
  const props = {
    open,
    viewport: true as const,
    title: 'Article',
    onClose: () => {
      calls.close += 1;
    },
    onClosed: () => {
      calls.closed += 1;
    },
    children: `Body ${nonce}`,
  };
  return createElement(OsSlideOverScreen, props);
}

describe('OsSlideOverScreen close', () => {
  beforeEach(() => {
    calls.close = 0;
    calls.closed = 0;
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    );
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: false,
      media: query,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent() {
        return false;
      },
    }));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('finishes closing while the parent re-renders every 100ms', async () => {
    function Host() {
      const [open, setOpen] = useState(true);
      const [nonce, setNonce] = useState(0);
      useEffect(() => {
        const id = window.setInterval(() => {
          setNonce((value) => value + 1);
        }, 100);
        return () => window.clearInterval(id);
      }, []);
      return createElement(
        'div',
        null,
        createElement(
          'button',
          { type: 'button', onClick: () => setOpen(false) },
          'Dismiss'
        ),
        createElement(Parent, { open, nonce })
      );
    }

    const view = render(createElement(Host));
    expect(document.querySelector('.os-slide-over')).toBeTruthy();
    fireEvent.click(view.getByRole('button', { name: 'Dismiss' }));
    expect(document.querySelector('.os-slide-over.is-closing')).toBeTruthy();

    // 100ms parent renders restart a timer that waits on callback identity.
    // 280ms is enough for one close and not enough if that timer keeps resetting.
    await vi.waitFor(
      () => {
        expect(calls.closed).toBe(1);
      },
      { timeout: 900, interval: 20 }
    );
    expect(calls.close).toBe(1);
    expect(document.querySelector('.os-slide-over')).toBeNull();
  });

  it('unmounts on the reduced-motion timer and otherwise waits 280ms', () => {
    vi.useFakeTimers();
    const reduced = { matches: false };
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('reduce') ? reduced.matches : false,
      media: query,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent() {
        return false;
      },
    }));

    function Host() {
      const [open, setOpen] = useState(true);
      return createElement(
        'div',
        null,
        createElement(
          'button',
          { type: 'button', onClick: () => setOpen(false) },
          'Dismiss'
        ),
        createElement(Parent, { open, nonce: 0 })
      );
    }

    reduced.matches = true;
    const reducedView = render(createElement(Host));
    fireEvent.click(reducedView.getByRole('button', { name: 'Dismiss' }));
    expect(document.querySelector('.os-slide-over.is-closing')).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(calls.closed).toBe(1);
    expect(document.querySelector('.os-slide-over')).toBeNull();
    cleanup();
    calls.closed = 0;
    calls.close = 0;

    reduced.matches = false;
    const motionView = render(createElement(Host));
    fireEvent.click(motionView.getByRole('button', { name: 'Dismiss' }));
    act(() => {
      vi.advanceTimersByTime(279);
    });
    expect(calls.closed).toBe(0);
    expect(document.querySelector('.os-slide-over.is-closing')).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(calls.closed).toBe(1);
    expect(document.querySelector('.os-slide-over')).toBeNull();
    vi.useRealTimers();
  });

  it('waits 280ms when matchMedia is missing', () => {
    vi.useFakeTimers();
    vi.stubGlobal('matchMedia', undefined);

    function Host() {
      const [open, setOpen] = useState(true);
      return createElement(
        'div',
        null,
        createElement(
          'button',
          { type: 'button', onClick: () => setOpen(false) },
          'Dismiss'
        ),
        createElement(Parent, { open, nonce: 0 })
      );
    }

    const view = render(createElement(Host));
    fireEvent.click(view.getByRole('button', { name: 'Dismiss' }));
    act(() => {
      vi.advanceTimersByTime(279);
    });
    expect(calls.closed).toBe(0);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(calls.closed).toBe(1);
    expect(document.querySelector('.os-slide-over')).toBeNull();
    vi.useRealTimers();
  });
});
