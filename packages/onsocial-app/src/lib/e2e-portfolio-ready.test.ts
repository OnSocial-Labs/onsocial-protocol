import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  E2E_PORTFOLIO_READY_ATTR,
  installE2eAppRouterPush,
  markPortfolioClientReady,
  readPortfolioClientReady,
  unmarkPortfolioClientReady,
} from './e2e-portfolio-ready';

function stubReadyDocument() {
  const dataset: Record<string, string | undefined> = {};
  vi.stubGlobal('document', { body: { dataset } });
  return dataset;
}

describe('portfolio client ready refcount', () => {
  afterEach(() => {
    for (let i = 0; i < 8; i += 1) unmarkPortfolioClientReady();
    vi.unstubAllGlobals();
  });

  it('stays on while one holder remounts under another', () => {
    const dataset = stubReadyDocument();
    markPortfolioClientReady();
    markPortfolioClientReady();
    unmarkPortfolioClientReady();
    expect(readPortfolioClientReady()).toBe(true);
    expect(dataset[E2E_PORTFOLIO_READY_ATTR]).toBe('true');
    unmarkPortfolioClientReady();
    expect(readPortfolioClientReady()).toBe(false);
    expect(dataset[E2E_PORTFOLIO_READY_ATTR]).toBeUndefined();
  });
});

describe('installE2eAppRouterPush', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('replaces and cleans up only its own push', () => {
    vi.stubGlobal('window', {} as Window);
    const first = () => undefined;
    const second = () => undefined;
    const uninstallFirst = installE2eAppRouterPush(first);
    const uninstallSecond = installE2eAppRouterPush(second);
    expect(window.__onsocialE2ePush).toBe(second);
    uninstallFirst();
    expect(window.__onsocialE2ePush).toBe(second);
    uninstallSecond();
    expect(window.__onsocialE2ePush).toBeUndefined();
  });
});
