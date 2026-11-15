import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PostThreadPageSkeleton } from '@/features/home/post-skeleton';

function markup() {
  return renderToStaticMarkup(createElement(PostThreadPageSkeleton));
}

describe('PostThreadPageSkeleton', () => {
  it('matches the opened post: focal block, replies label, then reply rows', () => {
    const html = markup();
    const focal = html.indexOf('post-card--detail');
    const time = html.indexOf('post-card-detail-time');
    const actions = html.indexOf('post-card-engagement');
    const replies = html.indexOf('thread-controls-row');
    const replyRows = html.indexOf('post-row-skeleton-list', replies);

    expect(focal).toBeGreaterThan(-1);
    expect(time).toBeGreaterThan(focal);
    expect(actions).toBeGreaterThan(time);
    expect(replies).toBeGreaterThan(actions);
    expect(replyRows).toBeGreaterThan(replies);
    expect(html).toContain('divider-detail');
    expect(html).toContain('aria-hidden="true"');
  });
});
