import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { QuotedPostInsetPending } from '@/features/home/post-card-quote';
import type { PostRow } from '@onsocial/sdk';

const PendingWithPost = QuotedPostInsetPending as (props: {
  post: PostRow;
}) => ReactNode;

const quote = {
  accountId: 'greenghost.onsocial.testnet',
  postId: '1',
  value: 'Check this out',
  blockHeight: 1,
  blockTimestamp: 1,
} as PostRow;

describe('quote inset seat', () => {
  it('seats a known quote at its text instead of gray bars', () => {
    const html = renderToStaticMarkup(
      createElement(PendingWithPost, { post: quote })
    );

    expect(html).toContain('Check this out');
    expect(html).toContain('post-card-quote-inset-body');
    expect(html).not.toContain('post-row-skeleton-line');
    expect(html).not.toContain('post-card-quote-inset--pending');
  });

  it('keeps the cold skeleton bone when the quote is not known yet', () => {
    const html = renderToStaticMarkup(createElement(QuotedPostInsetPending));

    expect(html).toContain('post-card-quote-inset--pending');
    expect(html).not.toContain('Check this out');
  });
});
