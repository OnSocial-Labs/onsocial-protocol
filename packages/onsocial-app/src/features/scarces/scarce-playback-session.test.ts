import { describe, expect, it } from 'vitest';
import { nextDockHoldForPreview } from '@/features/scarces/drop-preview-dock';
import {
  scarcePlaybackSessionId,
  shouldAdoptPlaybackSession,
  shouldTakeOverPlayback,
} from '@/features/scarces/scarce-playback-session';

describe('scarcePlaybackSessionId', () => {
  it('keeps a drop id', () => {
    expect(
      scarcePlaybackSessionId({
        collectionId: 'drop-9',
        tokenId: 'other:1',
      })
    ).toBe('drop-9');
  });

  it('resolves an edition token to its drop', () => {
    expect(
      scarcePlaybackSessionId({ collectionId: null, tokenId: 'drop-1:3' })
    ).toBe('drop-1');
  });

  it('uses a post scarce token as its own session', () => {
    expect(
      scarcePlaybackSessionId({ collectionId: '  ', tokenId: 's:319' })
    ).toBe('s:319');
  });

  it('returns null when nothing identifies the release', () => {
    expect(scarcePlaybackSessionId({})).toBeNull();
  });
});

describe('shouldAdoptPlaybackSession', () => {
  it('claims a silent dock and refreshes the same release', () => {
    expect(
      shouldAdoptPlaybackSession({ currentId: null, nextId: 'drop-1' })
    ).toBe(true);
    expect(
      shouldAdoptPlaybackSession({ currentId: 'drop-1', nextId: 'drop-1' })
    ).toBe(true);
  });

  it('leaves a different release on the dock', () => {
    expect(
      shouldAdoptPlaybackSession({ currentId: 'drop-1', nextId: 'drop-2' })
    ).toBe(false);
  });
});

describe('shouldTakeOverPlayback', () => {
  it('starts a different release only from an explicit play', () => {
    expect(
      shouldTakeOverPlayback({ sessionId: 'drop-1', surfaceId: 'drop-2' })
    ).toBe(true);
    expect(
      shouldTakeOverPlayback({ sessionId: 'drop-1', surfaceId: 'drop-1' })
    ).toBe(false);
    expect(
      shouldTakeOverPlayback({ sessionId: null, surfaceId: 'drop-2' })
    ).toBe(false);
  });
});

describe('nextDockHoldForPreview', () => {
  it('pauses the dock when a preview starts', () => {
    expect(
      nextDockHoldForPreview({
        dockPlaying: true,
        holdingDock: false,
        previewPlaying: true,
      })
    ).toEqual({ holdingDock: true, pauseDock: true, resumeDock: false });
  });

  it('resumes a dock that is still paused when the preview stops', () => {
    expect(
      nextDockHoldForPreview({
        dockPlaying: false,
        holdingDock: true,
        previewPlaying: false,
      })
    ).toEqual({ holdingDock: false, pauseDock: false, resumeDock: true });
  });

  it('leaves a dock the listener started again during the preview', () => {
    expect(
      nextDockHoldForPreview({
        dockPlaying: true,
        holdingDock: true,
        previewPlaying: false,
      })
    ).toEqual({ holdingDock: false, pauseDock: false, resumeDock: false });
  });
});
