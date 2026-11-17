import { describe, expect, it } from 'vitest';
import type { PostRow } from '@onsocial/sdk';
import {
  feedBlockEstimateKind,
  feedBlockEstimatePx,
  feedBlockIsPollRow,
  feedCardEstimateKind,
  threadReplyRowEstimatePx,
} from './feed-block-estimate';
import {
  FEED_WINDOW_ESTIMATE_PX,
  FEED_WINDOW_FOLD_ESTIMATE_PX,
  FEED_WINDOW_JACKET_ESTIMATE_PX,
  FEED_WINDOW_MEDIA_ESTIMATE_PX,
  FEED_WINDOW_POLL_ESTIMATE_PX,
  FEED_WINDOW_QUOTE_INSET_PX,
  FEED_WINDOW_QUOTE_ESTIMATE_PX,
  feedWindowRowEstimatePx,
} from './feed-window';

function row(
  accountId: string,
  postId: string,
  extra: Partial<PostRow> = {}
): PostRow {
  return {
    accountId,
    postId,
    blockHeight: 1,
    blockTimestamp: 1,
    value: '',
    ...extra,
  } as PostRow;
}

function pollValue(question: string): string {
  return JSON.stringify({
    text: question,
    embeds: [
      {
        kind: 'poll',
        question,
        options: ['Red', 'Blue'],
      },
    ],
  });
}

describe('feedBlockEstimatePx', () => {
  it('sizes a solo media card above text', () => {
    const withPhoto = row('alice.near', 'photo', {
      value: JSON.stringify({
        text: 'hi',
        media: ['https://example.test/a.jpg'],
      }),
    });
    expect(feedBlockEstimateKind({ posts: [withPhoto] }, {})).toBe('media');
    expect(feedBlockEstimatePx({ posts: [withPhoto] }, {})).toBe(
      FEED_WINDOW_MEDIA_ESTIMATE_PX
    );
  });

  it('sums media root + reply instead of undercounting as text', () => {
    const withPhoto = row('alice.near', 'photo', {
      value: JSON.stringify({
        text: 'hi',
        media: ['https://example.test/a.jpg'],
      }),
    });
    const reply = row('alice.near', 'reply', {
      value: JSON.stringify({ text: 'nice' }),
      parentPath: 'alice.near/post/photo',
    });
    expect(feedBlockEstimateKind({ posts: [withPhoto, reply] }, {})).toBe(
      'text'
    );
    expect(feedBlockEstimatePx({ posts: [withPhoto, reply] }, {})).toBe(
      FEED_WINDOW_MEDIA_ESTIMATE_PX + FEED_WINDOW_ESTIMATE_PX
    );
  });

  it('includes standing peek height under the root', () => {
    const root = row('alice.near', 'root', {
      value: JSON.stringify({ text: 'hello' }),
    });
    const peek = row('bob.near', 'peek', {
      value: JSON.stringify({
        text: 'standing',
        media: ['https://example.test/b.jpg'],
      }),
    });
    expect(
      feedBlockEstimatePx({ posts: [root], standingPeek: peek }, {})
    ).toBe(FEED_WINDOW_ESTIMATE_PX + FEED_WINDOW_MEDIA_ESTIMATE_PX);
  });

  it('adds fold allowance when a long chain collapses', () => {
    const posts = [1, 2, 3, 4, 5].map((n) =>
      row('alice.near', `p${n}`, {
        value: JSON.stringify({ text: `n${n}` }),
      })
    );
    // Visible: first + last two text cards + fold.
    expect(feedBlockEstimatePx({ posts }, {})).toBe(
      FEED_WINDOW_ESTIMATE_PX * 3 + FEED_WINDOW_FOLD_ESTIMATE_PX
    );
  });

  it('sizes scarce/article jackets above media', () => {
    const article = row('alice.near', 'essay', {
      value: JSON.stringify({
        text: 'body',
        x: {
          onsocial: {
            article: {
              title: 'After midnight',
              format: 'essay',
            },
          },
        },
      }),
    });
    expect(feedCardEstimateKind(article, {})).toBe('jacket');
    expect(feedBlockEstimatePx({ posts: [article] }, {})).toBe(
      FEED_WINDOW_JACKET_ESTIMATE_PX
    );
  });

  it('adds quote inset under a media card that also cites', () => {
    const withBoth = row('alice.near', 'cite-photo', {
      refType: 'quote',
      refPath: 'bob.near/post/1',
      value: JSON.stringify({
        text: 'citing',
        media: ['https://example.test/a.jpg'],
      }),
    });
    expect(feedBlockEstimatePx({ posts: [withBoth] }, {})).toBe(
      FEED_WINDOW_MEDIA_ESTIMATE_PX + FEED_WINDOW_QUOTE_INSET_PX
    );
  });

  it('bumps quote-of-media to the media estimate', () => {
    const cited = row('bob.near', '1', {
      value: JSON.stringify({
        text: 'orig',
        media: ['https://example.test/a.jpg'],
      }),
    });
    const cite = row('alice.near', 'cite', {
      refType: 'quote',
      refPath: 'bob.near/post/1',
      value: JSON.stringify({ text: 'citing' }),
    });
    expect(
      feedCardEstimateKind(cite, { 'bob.near/post/1': cited })
    ).toBe('media');
    expect(
      feedBlockEstimatePx({ posts: [cite] }, { 'bob.near/post/1': cited })
    ).toBe(FEED_WINDOW_MEDIA_ESTIMATE_PX);
  });

  it('keeps solo polls on the poll estimate; chains are not poll rows', () => {
    const poll = row('alice.near', 'poll', {
      kind: 'poll',
      value: pollValue('Favorite color?'),
    });
    const reply = row('alice.near', 'reply');
    expect(feedBlockIsPollRow({ posts: [poll] }, {})).toBe(true);
    expect(feedBlockEstimatePx({ posts: [poll] }, {})).toBe(
      FEED_WINDOW_POLL_ESTIMATE_PX
    );
    expect(feedBlockIsPollRow({ posts: [poll, reply] }, {})).toBe(false);
    expect(feedWindowRowEstimatePx('quote')).toBe(FEED_WINDOW_QUOTE_ESTIMATE_PX);
  });
});

describe('threadReplyRowEstimatePx', () => {
  it('sizes a media reply and a fold coil', () => {
    const mediaReply = row('alice.near', 'r1', {
      value: JSON.stringify({
        text: 'pic',
        media: ['https://example.test/a.jpg'],
      }),
    });
    expect(
      threadReplyRowEstimatePx(
        { kind: 'post', post: mediaReply, connectedToPrevious: false },
        {}
      )
    ).toBe(FEED_WINDOW_MEDIA_ESTIMATE_PX);
    expect(
      threadReplyRowEstimatePx({
        kind: 'more',
        branchKey: 'alice.near/post/r1',
        hiddenCount: 4,
        hidden: [],
      })
    ).toBe(FEED_WINDOW_FOLD_ESTIMATE_PX);
    expect(
      threadReplyRowEstimatePx({
        kind: 'post',
        post: row('alice.near', 'r2', {
          value: JSON.stringify({ text: 'ok' }),
        }),
        connectedToPrevious: true,
      })
    ).toBe(FEED_WINDOW_ESTIMATE_PX);
  });
});
