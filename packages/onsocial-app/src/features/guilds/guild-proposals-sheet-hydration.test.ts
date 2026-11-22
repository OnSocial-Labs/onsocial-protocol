// @ts-nocheck
import { createElement } from 'react';
import { act } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/contexts/app-transaction-feedback-context', () => ({
  useAppTransactionFeedback: () => ({
    trackTransaction: vi.fn(),
    setTxResult: vi.fn(),
  }),
}));

vi.mock('@/hooks/use-post-author-profiles', () => ({
  usePostAuthorProfiles: () => ({}),
}));

vi.mock('@/lib/create-readonly-onsocial-client', () => ({
  createReadOnlyOnSocialClient: () => ({
    groups: {
      listProposals: () => new Promise(() => {}),
      getProposal: () => new Promise(() => {}),
      getProposalTally: () => new Promise(() => {}),
      getVote: () => new Promise(() => {}),
    },
  }),
}));

import { GlassSheetPortalProvider } from '@onsocial/ui';
import { GuildProposalsSheet } from '@/features/guilds/guild-proposals-sheet';
import { probeOsCardHost } from '@/lib/os-card-host';

function loggedOutSheet() {
  return createElement(
    GlassSheetPortalProvider,
    { container: null, resolveHost: probeOsCardHost },
    createElement(GuildProposalsSheet, {
      open: true,
      groupId: 'dao.testnet',
      accountId: null,
      isMember: false,
      memberDriven: true,
      onClose: () => {},
    })
  );
}

describe('logged-out proposals sheet hydration', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('matches the server markup on the first client render', async () => {
    const serverHtml = renderToStaticMarkup(loggedOutSheet());
    const dom = new JSDOM(
      `<!doctype html><html><body><div id="root">${serverHtml}</div></body></html>`
    );
    const host = dom.window.document.createElement('div');
    host.className = 'os-app-screen app-surface';
    dom.window.document.body.appendChild(host);
    const matchMedia = () => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
    });
    Object.defineProperty(dom.window, 'matchMedia', {
      configurable: true,
      value: matchMedia,
    });
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    vi.stubGlobal('Node', dom.window.Node);
    vi.stubGlobal('navigator', dom.window.navigator);
    vi.stubGlobal('getComputedStyle', dom.window.getComputedStyle);
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});

    const errors: string[] = [];
    const consoleError = console.error;
    console.error = (...args: unknown[]) => {
      errors.push(args.map((arg) => String(arg)).join(' '));
    };
    const root = dom.window.document.getElementById('root');
    expect(root).not.toBeNull();
    let thrown = '';
    try {
      await act(async () => {
        hydrateRoot(root!, loggedOutSheet());
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    } catch (error) {
      thrown = error instanceof Error ? error.message : String(error);
    } finally {
      console.error = consoleError;
    }

    const noise = [...errors, thrown].join('\n');
    expect(noise).not.toMatch(/Hydration failed|did not match/i);
  });
});
