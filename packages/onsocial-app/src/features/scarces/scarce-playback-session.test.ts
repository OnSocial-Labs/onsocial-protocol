import { describe, expect, it } from 'vitest';
import {
  nextDockHoldForForeignMedia,
  nextDockHoldForPreview,
} from '@/features/scarces/drop-preview-dock';
import {
  scarcePlaybackSessionId,
  shouldAdoptPlaybackSession,
  dockSrcMatchesTrack,
  shouldBindPlaybackSession,
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
    expect(
      shouldTakeOverPlayback({
        sessionId: 'drop-1',
        surfaceId: 'drop-2',
        isAudio: false,
      })
    ).toBe(false);
  });
});

describe('dockSrcMatchesTrack', () => {
  it('matches the resolved file or its cid', () => {
    expect(
      dockSrcMatchesTrack(
        { currentSrc: 'https://ipfs.io/ipfs/bafy-track', src: '' },
        { url: 'https://gateway.example/bafy-track', cid: 'bafy-track' }
      )
    ).toBe(true);
    expect(
      dockSrcMatchesTrack(
        { currentSrc: 'https://cdn.example/other', src: '' },
        { url: 'https://cdn.example/song', cid: 'bafy-track' }
      )
    ).toBe(false);
  });
});

describe('shouldBindPlaybackSession', () => {
  it('binds audio when the dock is empty or already this release', () => {
    expect(
      shouldBindPlaybackSession({
        hasNowPlaying: true,
        persistId: 'drop-1',
        sessionId: null,
        isAudio: true,
      })
    ).toBe(true);
    expect(
      shouldBindPlaybackSession({
        hasNowPlaying: true,
        persistId: 'drop-1',
        sessionId: 'drop-1',
        isAudio: true,
      })
    ).toBe(true);
  });

  it('leaves a video on its own element', () => {
    expect(
      shouldBindPlaybackSession({
        hasNowPlaying: true,
        persistId: 'drop-9',
        sessionId: 'drop-9',
        isAudio: false,
      })
    ).toBe(false);
    expect(
      shouldBindPlaybackSession({
        hasNowPlaying: true,
        persistId: 'drop-9',
        sessionId: null,
        isAudio: false,
      })
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

describe('nextDockHoldForForeignMedia', () => {
  it('pauses the dock when the first audible video starts', () => {
    expect(
      nextDockHoldForForeignMedia({
        dockPaused: false,
        holdingDock: false,
        activeForeign: 1,
      })
    ).toEqual({ holdingDock: true, pauseDock: true, resumeDock: false });
  });

  it('pauses a playing dock even when a hold was already recorded', () => {
    expect(
      nextDockHoldForForeignMedia({
        dockPaused: false,
        holdingDock: true,
        activeForeign: 1,
      })
    ).toEqual({ holdingDock: true, pauseDock: true, resumeDock: false });
  });

  it('does not pause again for a second audible video', () => {
    expect(
      nextDockHoldForForeignMedia({
        dockPaused: true,
        holdingDock: true,
        activeForeign: 2,
      })
    ).toEqual({ holdingDock: true, pauseDock: false, resumeDock: false });
  });

  it('leaves a dock that was already paused', () => {
    expect(
      nextDockHoldForForeignMedia({
        dockPaused: true,
        holdingDock: false,
        activeForeign: 1,
      })
    ).toEqual({ holdingDock: false, pauseDock: false, resumeDock: false });
  });

  it('resumes when the last video stops and the dock is still paused', () => {
    expect(
      nextDockHoldForForeignMedia({
        dockPaused: true,
        holdingDock: true,
        activeForeign: 0,
      })
    ).toEqual({ holdingDock: false, pauseDock: false, resumeDock: true });
  });

  it('leaves a dock the listener started again during the video', () => {
    expect(
      nextDockHoldForForeignMedia({
        dockPaused: false,
        holdingDock: true,
        activeForeign: 0,
      })
    ).toEqual({ holdingDock: false, pauseDock: false, resumeDock: false });
  });
});
