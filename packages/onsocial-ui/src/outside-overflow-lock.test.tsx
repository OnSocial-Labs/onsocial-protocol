/** @vitest-environment jsdom */
import { act, useRef, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useKeyboardDrawerFrame } from './keyboard-drawer-frame.js';

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Phone sheets lock background scroll through `useKeyboardDrawerFrame`.
 * Two holders must restore the inline overflow the page had before the
 * first lock, whichever one releases first.
 */
function SheetLock({ active, root }: { active: boolean; root: HTMLElement }) {
  const rootRef = useRef<HTMLElement | null>(root);
  rootRef.current = root;
  useKeyboardDrawerFrame(active, rootRef, 'page');
  return null;
}

function LockHost({
  flags,
  roots,
}: {
  flags: boolean[];
  roots: HTMLElement[];
}) {
  const sheets: ReactNode[] = [];
  for (let index = 0; index < flags.length; index += 1) {
    const root = roots[index];
    if (!root) continue;
    sheets.push(
      <SheetLock key={index} active={flags[index] === true} root={root} />
    );
  }
  return <>{sheets}</>;
}

function sheetRoot(): HTMLElement {
  const root = document.createElement('div');
  const inner = document.createElement('div');
  inner.className = 'os-app-screen-body';
  inner.style.overflow = 'scroll';
  root.appendChild(inner);
  document.body.appendChild(root);
  return root;
}

describe('phone sheet overflow lock', () => {
  let view: Root;
  let host: HTMLDivElement;
  let screen: HTMLDivElement;
  let portfolio: HTMLDivElement;
  let glassBody: HTMLDivElement;
  const roots: HTMLElement[] = [];

  beforeEach(() => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: query.includes('767'),
        media: query,
        addEventListener() {},
        removeEventListener() {},
        addListener() {},
        removeListener() {},
        dispatchEvent() {
          return false;
        },
        onchange: null,
      }))
    );
    document.documentElement.style.overflow = '';
    screen = document.createElement('div');
    screen.className = 'os-app-screen-body';
    screen.style.overflow = 'auto';
    screen.scrollTop = 80;
    portfolio = document.createElement('div');
    portfolio.className = 'portfolio-page';
    portfolio.style.overflow = 'scroll';
    glassBody = document.createElement('div');
    glassBody.className = 'glass-sheet-body';
    glassBody.style.overflow = '';
    document.body.append(screen, portfolio, glassBody);
    roots.splice(0, roots.length, sheetRoot(), sheetRoot(), sheetRoot());
    host = document.createElement('div');
    document.body.appendChild(host);
    view = createRoot(host);
  });

  afterEach(() => {
    act(() => {
      view.unmount();
    });
    host.remove();
    document.body.replaceChildren();
    document.documentElement.style.overflow = '';
    vi.unstubAllGlobals();
  });

  function renderLocks(flags: boolean[]) {
    act(() => {
      view.render(<LockHost flags={flags} roots={roots} />);
    });
  }

  function expectLocked() {
    expect(screen.style.overflow).toBe('hidden');
    expect(document.documentElement.style.overflow).toBe('hidden');
    expect(portfolio.style.overflow).toBe('hidden');
    expect(glassBody.style.overflow).toBe('hidden');
  }

  function expectOriginal() {
    expect(screen.style.overflow).toBe('auto');
    expect(screen.scrollTop).toBe(80);
    expect(document.documentElement.style.overflow).toBe('');
    expect(portfolio.style.overflow).toBe('scroll');
    expect(glassBody.style.overflow).toBe('');
  }

  it('does not lock the open sheet own scroller', () => {
    renderLocks([true]);
    const inner = roots[0]?.querySelector('.os-app-screen-body');
    expect(inner).toBeInstanceOf(HTMLElement);
    if (inner instanceof HTMLElement) {
      expect(inner.style.overflow).toBe('scroll');
    }
    expectLocked();
  });

  it('restores the original when the earlier sheet closes first', () => {
    renderLocks([true, true]);
    expectLocked();
    renderLocks([false, true]);
    expect(screen.style.overflow).toBe('hidden');
    renderLocks([false, false]);
    expectOriginal();
  });

  it('restores the original when the later sheet closes first', () => {
    renderLocks([true, true]);
    expectLocked();
    renderLocks([true, false]);
    expect(screen.style.overflow).toBe('hidden');
    renderLocks([false, false]);
    expectOriginal();
  });

  it('restores the original when stacked sheets unmount together', () => {
    renderLocks([true, true]);
    expectLocked();
    act(() => {
      view.render(null);
    });
    expectOriginal();
  });

  it('restores the original after a three-deep stack closes outer-first', () => {
    renderLocks([true, true, true]);
    expectLocked();
    renderLocks([false, true, true]);
    expect(screen.style.overflow).toBe('hidden');
    renderLocks([false, false, true]);
    expect(screen.style.overflow).toBe('hidden');
    renderLocks([false, true, false]);
    expect(screen.style.overflow).toBe('hidden');
    renderLocks([false, false, false]);
    expectOriginal();
  });
});
