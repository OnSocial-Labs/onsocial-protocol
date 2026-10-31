import { describe, expect, it } from 'vitest';
import {
  DM_REPLY_SWIPE_COMMIT_PX,
  DM_REPLY_SWIPE_MAX_PX,
  dmQuoteJumpLabel,
  dmReplyActionLabel,
  dmReplySwipeBlockedTarget,
  dmReplySwipeFrame,
} from './dm-reply-gesture';

describe('dmReplySwipeFrame', () => {
  it('ignores a slop wiggle and a vertical scroll', () => {
    expect(dmReplySwipeFrame({ dx: 4, dy: 3, axis: null }, 'move')).toEqual({
      axis: null,
      offset: 0,
      commit: false,
    });
    expect(dmReplySwipeFrame({ dx: 12, dy: 40, axis: null }, 'end')).toEqual({
      axis: 'y',
      offset: 0,
      commit: false,
    });
  });

  it('commits a rightward swipe and ignores a left drag', () => {
    expect(
      dmReplySwipeFrame(
        { dx: DM_REPLY_SWIPE_COMMIT_PX, dy: 4, axis: null },
        'end'
      ).commit
    ).toBe(true);
    expect(dmReplySwipeFrame({ dx: -80, dy: 0, axis: null }, 'end')).toEqual({
      axis: 'x',
      offset: 0,
      commit: false,
    });
  });

  it('caps the drag and keeps a locked horizontal swipe', () => {
    expect(
      dmReplySwipeFrame({ dx: 200, dy: 0, axis: null }, 'move').offset
    ).toBe(DM_REPLY_SWIPE_MAX_PX);
    expect(dmReplySwipeFrame({ dx: 60, dy: 80, axis: 'x' }, 'move').axis).toBe(
      'x'
    );
  });
});

describe('dm reply labels', () => {
  it('names the message being replied to', () => {
    expect(dmReplyActionLabel('later today')).toBe('Reply to “later today”');
    expect(dmReplyActionLabel('  ')).toBe('Reply to “this message”');
  });

  it('names the quoted author', () => {
    expect(
      dmQuoteJumpLabel({ mine: true, peerName: 'Ada', preview: 'Origin' })
    ).toBe('Show your message, Origin');
    expect(
      dmQuoteJumpLabel({ mine: false, peerName: 'Ada', preview: 'Origin' })
    ).toBe('Show Ada’s message, Origin');
  });
});

describe('dmReplySwipeBlockedTarget', () => {
  it('is false for a non-element', () => {
    expect(dmReplySwipeBlockedTarget(null)).toBe(false);
  });
});
