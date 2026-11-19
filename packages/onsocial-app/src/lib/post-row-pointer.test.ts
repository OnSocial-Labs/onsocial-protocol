/**
 * @vitest-environment jsdom
 */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PostRow } from '@onsocial/sdk';
import { pointerOpensThisPost } from '@/lib/post-row-pointer';

const repliesByPath = vi.hoisted(() => vi.fn());

function clientStub(extra: Record<string, unknown> = {}): unknown {
  const call = () => Promise.resolve([]);
  return new Proxy(call, {
    get(_target, prop) {
      if (prop === 'then') return undefined;
      if (prop in extra) return extra[prop as string];
      return clientStub();
    },
    apply() {
      return Promise.resolve([]);
    },
  });
}

vi.mock('@/lib/create-readonly-onsocial-client', () => ({
  createReadOnlyOnSocialClient: () =>
    clientStub({
      query: clientStub({
        threads: clientStub({ repliesByPath }),
      }),
    }),
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    scroll: _scroll,
    onNavigate: _onNavigate,
    ...rest
  }: {
    children?: unknown;
    href?: string;
    scroll?: boolean;
    onNavigate?: unknown;
  }) => createElement('a', { href, ...rest }, children),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => undefined, replace: () => undefined }),
  usePathname: () => '/home',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/contexts/app-transaction-feedback-context', () => ({
  useAppTransactionFeedback: () => ({
    txResult: null,
    setTxResult: () => undefined,
    clearTxResult: () => undefined,
    trackTransaction: async () => false,
  }),
}));

vi.mock('@/features/home/post-thread-layer', async () => {
  const actual = await vi.importActual<
    typeof import('@/features/home/post-thread-layer')
  >('@/features/home/post-thread-layer');
  const { warmThreadOpen } = await import('@/lib/thread-first-page');
  const { postContentPath } = await import('@onsocial/sdk');
  return {
    ...actual,
    usePostThreadLayer: () => ({
      openPostThread: (input: { root?: PostRow | null }) => {
        if (input.root) {
          warmThreadOpen(
            postContentPath(input.root),
            input.root.groupId ? 'guild' : 'personal'
          );
        }
        return true;
      },
      closePostThread: () => undefined,
      openDrop: () => false,
      openPostQuotes: () => false,
    }),
  };
});

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

import { PostCard } from '@/features/home/post-card';
import {
  clearThreadFirstPageCache,
  warmThreadOpen,
} from '@/lib/thread-first-page';

function post(): PostRow {
  return {
    accountId: 'alice.near',
    postId: 'p1',
    value: JSON.stringify({ v: 1, text: 'Hello from the row' }),
    blockHeight: 20,
    blockTimestamp: 1_700_000_000_000,
    receiptId: 'r1',
    parentPath: '',
    parentAuthor: '',
    parentType: '',
    kind: 'post',
  } as PostRow;
}

function pointer(target: Element, button = 0) {
  const event = new Event('pointerdown', { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    button: { value: button },
    isPrimary: { value: true },
  });
  target.dispatchEvent(event);
}

describe('pointerOpensThisPost', () => {
  it('warms the hit and the time link, and skips inner controls', () => {
    const article = document.createElement('article');
    article.innerHTML = `
      <a class="post-card-hit"></a>
      <a class="post-identity-time">time</a>
      <a class="post-card-identity">Ada</a>
      <button class="post-card-react">Like</button>
      <button class="post-card-menu">Menu</button>
      <div class="post-card-article-cover"></div>
      <div class="post-media-tile"></div>
      <a class="post-card-quote-inset">quote</a>
    `;
    expect(pointerOpensThisPost(article.querySelector('.post-card-hit'))).toBe(
      true
    );
    expect(
      pointerOpensThisPost(article.querySelector('.post-identity-time'))
    ).toBe(true);
    expect(
      pointerOpensThisPost(article.querySelector('.post-card-identity'))
    ).toBe(false);
    expect(
      pointerOpensThisPost(article.querySelector('.post-card-react'))
    ).toBe(false);
    expect(pointerOpensThisPost(article.querySelector('.post-card-menu'))).toBe(
      false
    );
    expect(
      pointerOpensThisPost(article.querySelector('.post-card-article-cover'))
    ).toBe(false);
    expect(
      pointerOpensThisPost(article.querySelector('.post-media-tile'))
    ).toBe(false);
    expect(
      pointerOpensThisPost(article.querySelector('.post-card-quote-inset'))
    ).toBe(false);
  });
});

describe('post row pointer warm', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
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
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }));
    clearThreadFirstPageCache();
    repliesByPath.mockReset();
    repliesByPath.mockImplementation(() => new Promise(() => undefined));
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    clearThreadFirstPageCache();
    vi.unstubAllGlobals();
  });

  it('starts the first-page fetch on pointerdown and the click reuses it', async () => {
    await act(async () => {
      root.render(
        createElement(PostCard, {
          post: post(),
          actionHref: '/@alice.near/posts/p1',
          onToggleReaction: () => undefined,
        })
      );
    });

    const like = host.querySelector('button.post-card-react-heart');
    expect(like).toBeTruthy();
    await act(async () => {
      pointer(like!);
    });
    expect(repliesByPath).not.toHaveBeenCalled();

    const hit = host.querySelector('.post-card-hit');
    expect(hit).toBeTruthy();
    await act(async () => {
      pointer(hit!);
    });
    expect(repliesByPath).toHaveBeenCalledTimes(1);
    expect(repliesByPath.mock.calls[0]?.[0]).toBe('alice.near/post/p1');

    await act(async () => {
      hit!.dispatchEvent(
        new MouseEvent('click', { bubbles: true, button: 0, cancelable: true })
      );
    });
    expect(repliesByPath).toHaveBeenCalledTimes(1);

    warmThreadOpen('alice.near/post/p1', 'personal');
    expect(repliesByPath).toHaveBeenCalledTimes(1);
  });
});
