import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { PostRow } from '@onsocial/sdk';
import type { PersonalPostPageData } from '@/lib/load-personal-post-page';
import { EMPTY_POST_ENGAGEMENT } from '@/hooks/use-post-engagement';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: () => undefined,
    replace: () => undefined,
    prefetch: () => undefined,
  }),
  usePathname: () => '/@alice.near/posts/root-post',
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

import { LivePersonalPostPanel } from '@/features/home/live-personal-post-panel';

const ROOT_TEXT = 'Root post already in hand';

function rootPost(): PostRow {
  return {
    accountId: 'alice.near',
    postId: 'root-post',
    value: JSON.stringify({ v: 1, text: ROOT_TEXT }),
    blockHeight: 200,
    blockTimestamp: 1_700_000_000_000,
    receiptId: 'receipt-root-post',
    parentPath: '',
    parentAuthor: '',
    parentType: '',
    kind: 'post',
  };
}

function seededPage(): PersonalPostPageData {
  return {
    root: rootPost(),
    replies: [],
    quotes: [],
    replyTree: [],
    hasMoreReplies: false,
    engagement: {
      'alice.near:root-post': {
        ...EMPTY_POST_ENGAGEMENT,
        replyCount: 1,
      },
    },
    scarceEmbeds: {},
  };
}

function markup(initial: PersonalPostPageData | null) {
  return renderToStaticMarkup(
    createElement(LivePersonalPostPanel, {
      author: 'alice.near',
      postId: 'root-post',
      initial,
    })
  );
}

describe('personal post server HTML', () => {
  it('paints a server root with no cover and a replies skeleton', () => {
    const html = markup(seededPage());

    expect(html).toContain(ROOT_TEXT);
    expect(html).toContain('is-ready');
    expect(html).not.toContain('os-route-skeleton');
    expect(html).not.toContain('post-card--skeleton post-card--detail');
    expect(html).toContain('thread-replies-sort');
    expect(html).toContain('>Replies');
    expect(html).not.toContain('thread-controls-row is-idle');
    const repliesAt = html.indexOf('guild-connected-stack');
    expect(repliesAt).toBeGreaterThan(-1);
    expect(html.indexOf('post-row-skeleton-list', repliesAt)).toBeGreaterThan(
      repliesAt
    );
  });

  it('keeps the full skeleton when a cold load has no seed', () => {
    const html = markup(null);

    expect(html).toContain('os-route-skeleton');
    expect(html).toContain('post-card--detail');
    expect(html).not.toContain('is-ready');
    expect(html).not.toContain(ROOT_TEXT);
  });
});
