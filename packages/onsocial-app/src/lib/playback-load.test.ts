import { describe, expect, it } from 'vitest';
import {
  beginPlaybackLoad,
  playbackLoadIsCurrent,
  shouldApplyPlaybackSrc,
} from './playback-load';

describe('playback load generation', () => {
  it('lets the later load win', () => {
    const first = beginPlaybackLoad(0);
    const second = beginPlaybackLoad(first.next);
    expect(playbackLoadIsCurrent(first.issued, second.next)).toBe(false);
    expect(playbackLoadIsCurrent(second.issued, second.next)).toBe(true);
  });
});

describe('shouldApplyPlaybackSrc', () => {
  it('replaces the source when switching to a pinned release', () => {
    expect(
      shouldApplyPlaybackSrc({
        mode: 'replace',
        indexChanged: false,
        hasSrc: true,
      })
    ).toBe(true);
  });

  it('keeps the current source when the same track is already loaded', () => {
    expect(
      shouldApplyPlaybackSrc({
        mode: 'if-needed',
        indexChanged: false,
        hasSrc: true,
      })
    ).toBe(false);
  });
});
