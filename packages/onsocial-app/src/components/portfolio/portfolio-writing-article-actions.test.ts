// @vitest-environment jsdom
import { createElement, type ReactNode } from 'react';
import { render, renderHook, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PostRow } from '@onsocial/sdk';

vi.mock('next/link', () => ({
  default: ({ children, href }: { children?: ReactNode; href: string }) =>
    createElement('a', { href: String(href) }, children),
}));

vi.mock('@/contexts/app-transaction-feedback-context', () => ({
  useAppTransactionFeedback: () => ({
    txResult: null,
    setTxResult: () => undefined,
    clearTxResult: () => undefined,
    trackTransaction: async () => false,
  }),
}));

vi.mock('@/lib/create-readonly-onsocial-client', () => ({
  createReadOnlyOnSocialClient: () => ({ query: {} }),
}));

import { PortfolioWritingArticleActions } from '@/components/portfolio/portfolio-writing-article-panel';
import { usePostEngagement } from '@/hooks/use-post-engagement';

function essayPost(): PostRow {
  return {
    accountId: 'ada.near',
    postId: 'essay-1',
    value: JSON.stringify({
      v: 1,
      text: 'A longer piece.',
      x: { onsocial: { article: { title: 'A Quiet Miracle' } } },
    }),
    blockHeight: 20,
    blockTimestamp: 1_700_000_000_000,
    receiptId: 'receipt-essay',
    replyCount: 2,
    quoteCount: 1,
    repostCount: 0,
    reactionCount: 4,
    amplifyCount: 1,
  } as PostRow;
}

describe('writing essay actions', () => {
  beforeEach(() => {
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
  });

  it('does not loop when one essay is passed as a fresh array', () => {
    const post = essayPost();
    const { result, rerender } = renderHook(() => usePostEngagement([post]));
    rerender();
    expect(result.current.engagement['ada.near:essay-1']?.reactionCount).toBe(
      4
    );
  });

  it('keeps the like control after the reader paints again', () => {
    const post = essayPost();
    const { rerender } = render(
      createElement(PortfolioWritingArticleActions, { post })
    );
    expect(
      screen.getByRole('button', { name: 'Like this article' })
    ).toBeTruthy();

    rerender(createElement(PortfolioWritingArticleActions, { post }));

    expect(
      screen.getByRole('button', { name: 'Like this article' })
    ).toBeTruthy();
  });
});
