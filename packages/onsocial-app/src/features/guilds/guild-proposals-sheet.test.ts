// @ts-nocheck
import { createElement, type ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';

const proposalsLoad = vi.hoisted(() => ({
  resolve: null as null | ((rows: unknown[]) => void),
}));

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
      listProposals: () =>
        new Promise((resolve) => {
          proposalsLoad.resolve = resolve;
        }),
      getProposal: () => new Promise(() => {}),
      getProposalTally: () => new Promise(() => {}),
      getVote: () => new Promise(() => {}),
    },
  }),
}));

vi.mock('@onsocial/ui', async () => {
  const actual = await vi.importActual<typeof import('@onsocial/ui')>(
    '@onsocial/ui'
  );
  return {
    ...actual,
    OsHugSheet: ({
      label,
      copy,
      children,
    }: {
      label: string;
      copy?: string;
      children?: ReactNode;
    }) =>
      createElement(
        'section',
        { 'aria-label': label },
        copy ? createElement('p', null, copy) : null,
        children
      ),
  };
});

import { GuildProposalsSheet } from '@/features/guilds/guild-proposals-sheet';

function installDom() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
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
  return dom;
}

function treeText(node: unknown): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(treeText).join('');
  if (typeof node === 'object' && 'children' in node) {
    return treeText((node as { children: unknown }).children);
  }
  return '';
}

function renderSheet(isMember: boolean | null) {
  let renderer: ReactTestRenderer;
  act(() => {
    renderer = create(
      createElement(GuildProposalsSheet, {
        open: true,
        groupId: 'dao.testnet',
        accountId: isMember ? 'member.testnet' : null,
        isMember: isMember as boolean,
        memberDriven: true,
        onClose: () => {},
      })
    );
  });
  return renderer!;
}

describe('guild proposals sheet membership', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps the loading dots for a member while membership is still unknown', () => {
    installDom();
    const renderer = renderSheet(null);
    const text = treeText(renderer.toJSON());
    expect(text).not.toContain('Join this guild to vote');
    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain('protocol-pulsing-dots');
  });

  it('still hides the join prompt after proposals load while membership is unknown', async () => {
    installDom();
    const renderer = renderSheet(null);
    await act(async () => {
      proposalsLoad.resolve?.([]);
    });
    const text = treeText(renderer.toJSON());
    expect(text).not.toContain('Join this guild to vote');
    expect(text).not.toContain('No active proposals');
    expect(JSON.stringify(renderer.toJSON())).toContain('protocol-pulsing-dots');
  });

  it('uses the member line when membership is already known true', () => {
    installDom();
    const renderer = renderSheet(true);
    const text = treeText(renderer.toJSON());
    expect(text).toContain('Support or oppose active governance items.');
    expect(text).not.toContain('Join this guild to vote');
  });

  it('shows the join prompt once membership is known false', () => {
    installDom();
    const renderer = renderSheet(false);
    const text = treeText(renderer.toJSON());
    expect(text).toContain('Join this guild to vote on proposals.');
  });
});
