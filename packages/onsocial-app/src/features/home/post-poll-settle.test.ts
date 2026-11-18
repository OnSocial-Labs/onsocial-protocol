import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PostPollEmbedCard } from '@/features/home/post-poll-embed';
import type { PostPollEmbed } from '@/lib/post-display';

const closed: PostPollEmbed = {
  kind: 'poll',
  question: 'What is your favourite colour?',
  options: ['Blue', 'Green'],
  closesAt: 1,
};

function markup(tally?: {
  counts: number[];
  total: number;
  viewerOptionIndex: number | null;
}) {
  return renderToStaticMarkup(
    createElement(PostPollEmbedCard, {
      poll: closed,
      tally,
    })
  );
}

describe('closed poll percents', () => {
  it('shows no percent and no vote count while the tally is pending', () => {
    const html = markup(undefined);

    expect(html).toContain('Blue');
    expect(html).toContain('Green');
    expect(html).toContain('Closed');
    expect(html).not.toMatch(/\d+%/);
    expect(html).not.toContain('No votes yet');
  });

  it('shows the tally once it is in', () => {
    const html = markup({
      counts: [1, 1],
      total: 2,
      viewerOptionIndex: null,
    });

    expect(html).toContain('50%');
    expect(html).toContain('2 votes');
    expect(html).toContain('Closed');
  });
});
