/**
 * @vitest-environment jsdom
 */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PostRow } from '@onsocial/sdk';
import type { PersonalPostPageData } from '@/lib/load-personal-post-page';

const fetchPersonalPostMock = vi.hoisted(() => vi.fn());
const nav = vi.hoisted(() => ({
  router: {
    push: () => undefined,
    replace: () => undefined,
    prefetch: () => undefined,
  },
  params: new URLSearchParams(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => nav.router,
  usePathname: () => '/@alice.near/posts/p1',
  useSearchParams: () => nav.params,
}));

vi.mock('@/contexts/app-transaction-feedback-context', () => ({
  useAppTransactionFeedback: () => ({
    txResult: null,
    setTxResult: () => undefined,
    clearTxResult: () => undefined,
    trackTransaction: async () => false,
  }),
}));

vi.mock('@/lib/fetch-personal-post', () => ({
  fetchPersonalPost: (...args: unknown[]) => fetchPersonalPostMock(...args),
  fetchIndexedPost: async () => null,
  fetchIndexedPostsByRefs: async () => new Map(),
}));

function resolvedPage(): unknown {
  const rows: unknown[] = [];
  return Promise.resolve(
    new Proxy(rows, {
      get(target, prop) {
        if (prop === 'items' || prop === 'replies') return [];
        const value = Reflect.get(target, prop);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    })
  );
}

function clientStub(): unknown {
  const call = () => resolvedPage();
  return new Proxy(call, {
    get(_target, prop) {
      if (prop === 'then') return undefined;
      return clientStub();
    },
    apply() {
      return resolvedPage();
    },
  });
}

vi.mock('@/lib/create-readonly-onsocial-client', () => ({
  createReadOnlyOnSocialClient: () => clientStub(),
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

import { LivePersonalPostPanel } from '@/features/home/live-personal-post-panel';
import { clearThreadSessionCache } from '@/lib/thread-session-cache';
import { clearThreadFirstPageCache } from '@/lib/thread-first-page';

function indexedRow(overrides: Partial<PostRow> = {}): PostRow {
  return {
    accountId: 'alice.near',
    postId: 'p1',
    value: JSON.stringify({ v: 1, text: 'from the row' }),
    blockHeight: 200,
    blockTimestamp: 1_700_000_000_000,
    receiptId: 'receipt-row',
    authorName: 'Ada Lovelace',
    authorAvatar: null,
    replyCount: 4,
    quoteCount: 2,
    repostCount: 1,
    reactionCount: 3,
    quotedPost: { postId: 'quoted-1', value: '{"text":"quoted body"}' },
    ...overrides,
  } as PostRow;
}

function fetched(overrides: Partial<PostRow> = {}): PostRow {
  return {
    accountId: 'alice.near',
    postId: 'p1',
    value: JSON.stringify({ v: 1, text: 'from the refetch' }),
    blockHeight: 200,
    blockTimestamp: 1_700_000_000_000,
    receiptId: 'receipt-row',
    ...overrides,
  } as PostRow;
}

function page(root: PostRow, ssr = false): PersonalPostPageData {
  return {
    root,
    replies: [],
    quotes: [],
    replyTree: [],
    hasMoreReplies: false,
    ...(ssr ? { directRepliesResolved: true } : {}),
    engagement: {},
    scarceEmbeds: {},
  };
}

describe('personal post row seed', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    clearThreadSessionCache();
    clearThreadFirstPageCache();
    fetchPersonalPostMock.mockReset();
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }));
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    );
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
        takeRecords() {
          return [];
        }
      }
    );
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });

  async function paint(initial: PersonalPostPageData | null) {
    await act(async () => {
      root.unmount();
    });
    root = createRoot(host);
    await act(async () => {
      root.render(
        createElement(LivePersonalPostPanel, {
          author: 'alice.near',
          postId: 'p1',
          initial,
        })
      );
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }

  it('keeps the row text and marks a newer block Edited', async () => {
    fetchPersonalPostMock.mockResolvedValue(
      fetched({ blockHeight: 260, receiptId: 'receipt-next' })
    );
    await paint(page(indexedRow()));
    const html = host.innerHTML;
    expect(html).toContain('from the row');
    expect(html).not.toContain('from the refetch');
    expect(html).toContain('Ada Lovelace');
    expect(html).toContain('post-card-detail-revision');
    expect(html).toContain('Edited');
    expect(html).not.toContain('Deleted');
  });

  it('marks an empty indexed read Deleted and a thrown read as nothing', async () => {
    fetchPersonalPostMock.mockResolvedValue(null);
    await paint(page(indexedRow()));
    expect(host.innerHTML).toContain('from the row');
    expect(host.innerHTML).toContain('Deleted');
    expect(host.innerHTML).not.toContain('Edited');

    fetchPersonalPostMock.mockRejectedValue(new Error('network down'));
    await paint(page(indexedRow()));
    expect(host.innerHTML).toContain('from the row');
    expect(host.innerHTML).not.toContain('Deleted');
    expect(host.innerHTML).not.toContain('post-card-detail-revision');
  });

  it('still swaps the root on a permalink / SSR open', async () => {
    fetchPersonalPostMock.mockResolvedValue(
      fetched({
        blockHeight: 260,
        value: JSON.stringify({ v: 1, text: 'from the refetch' }),
      })
    );
    await paint(
      page(
        indexedRow({
          value: JSON.stringify({ v: 1, text: 'from the server' }),
          authorName: undefined,
        }),
        true
      )
    );
    expect(host.innerHTML).toContain('from the refetch');
    expect(host.innerHTML).not.toContain('from the server');
    expect(host.innerHTML).not.toContain('Edited');
    expect(host.innerHTML).not.toContain('Deleted');
  });
});
