import { describe, expect, it } from 'vitest';
import {
  launcherReclaimFor,
  shouldBorrowSpeakers,
  shouldYieldToIncoming,
  mediaIsQuietUnderCovers,
  resolveSingleMediaPlayback,
  shouldPauseForeignOwner,
} from './single-media-playback';

const playing = {
  sameElement: false,
  sameKey: true,
  active: true,
  audible: true,
  playing: true,
  time: 12.4,
  stage: false,
};

describe('resolveSingleMediaPlayback', () => {
  it('lets a nested copy stay quiet while the same video is already playing', () => {
    expect(
      resolveSingleMediaPlayback({
        intent: 'passive',
        selfQuiet: false,
        selfMuted: true,
        atStart: true,
        savedTime: 12.4,
        owner: playing,
      })
    ).toEqual({ allow: false, pauseOwner: false, seekTo: null });
  });

  it('hands the clock to an explicit tap instead of starting again at 0', () => {
    expect(
      resolveSingleMediaPlayback({
        intent: 'explicit',
        selfQuiet: false,
        selfMuted: false,
        atStart: true,
        savedTime: 4,
        owner: playing,
      })
    ).toEqual({ allow: true, pauseOwner: true, seekTo: 12.4 });
  });

  it('starts a replay at 0 even if the same file was mid-play', () => {
    expect(
      resolveSingleMediaPlayback({
        intent: 'restart',
        selfQuiet: false,
        selfMuted: false,
        atStart: true,
        savedTime: 12.4,
        owner: playing,
      })
    ).toEqual({ allow: true, pauseOwner: true, seekTo: null });
  });

  it('does not let a muted autoplay cut off audio that is already audible', () => {
    expect(
      resolveSingleMediaPlayback({
        intent: 'passive',
        selfQuiet: false,
        selfMuted: true,
        atStart: true,
        savedTime: 0,
        owner: { ...playing, sameKey: false, time: 30 },
      })
    ).toEqual({ allow: false, pauseOwner: false, seekTo: null });
  });

  it('still swaps two muted list videos', () => {
    expect(
      resolveSingleMediaPlayback({
        intent: 'passive',
        selfQuiet: false,
        selfMuted: true,
        atStart: true,
        savedTime: 0,
        owner: {
          sameElement: false,
          sameKey: false,
          active: true,
          audible: false,
          playing: true,
          time: 3,
          stage: false,
        },
      })
    ).toEqual({ allow: true, pauseOwner: true, seekTo: null });
  });

  it('continues a covered video when the visible copy starts', () => {
    expect(
      resolveSingleMediaPlayback({
        intent: 'passive',
        selfQuiet: false,
        selfMuted: true,
        atStart: true,
        savedTime: 1,
        owner: { ...playing, active: false, audible: false, playing: true },
      })
    ).toEqual({ allow: true, pauseOwner: true, seekTo: 12.4 });
  });

  it('refuses passive autoplay from under a covering drawer', () => {
    expect(
      resolveSingleMediaPlayback({
        intent: 'passive',
        selfQuiet: true,
        selfMuted: true,
        atStart: true,
        savedTime: 8,
        owner: null,
      })
    ).toEqual({ allow: false, pauseOwner: false, seekTo: null });
  });

  it('does not undo a scrub back to the start on the element that was playing', () => {
    expect(
      resolveSingleMediaPlayback({
        intent: 'explicit',
        selfQuiet: false,
        selfMuted: false,
        atStart: true,
        savedTime: 9,
        owner: { ...playing, sameElement: true, time: 0 },
      })
    ).toEqual({ allow: true, pauseOwner: false, seekTo: null });
  });

  it('keeps an explicit resume on the same element', () => {
    expect(
      resolveSingleMediaPlayback({
        intent: 'explicit',
        selfQuiet: false,
        selfMuted: false,
        atStart: false,
        savedTime: 9,
        owner: { ...playing, sameElement: true },
      })
    ).toEqual({ allow: true, pauseOwner: false, seekTo: null });
  });

  it('keeps the enlarged film when a different reply video autoplays', () => {
    expect(
      resolveSingleMediaPlayback({
        intent: 'passive',
        selfQuiet: false,
        selfMuted: true,
        atStart: true,
        savedTime: 0,
        owner: { ...playing, sameKey: false, audible: false, stage: true },
      })
    ).toEqual({ allow: false, pauseOwner: false, seekTo: null });
  });

  it('still hands the enlarged film to an explicit tap', () => {
    expect(
      resolveSingleMediaPlayback({
        intent: 'explicit',
        selfQuiet: false,
        selfMuted: false,
        atStart: true,
        savedTime: 4,
        owner: { ...playing, stage: true },
      })
    ).toEqual({ allow: true, pauseOwner: true, seekTo: 12.4 });
  });
});

describe('mediaIsQuietUnderCovers', () => {
  it('does not treat a band reply drawer as a cover of the film above it', () => {
    expect(
      mediaIsQuietUnderCovers({
        connected: true,
        parkedOrCoveredFeed: false,
        covers: [
          {
            containsNode: false,
            band: true,
            inert: false,
            hidden: false,
            overlaps: true,
          },
          {
            containsNode: true,
            band: false,
            inert: false,
            hidden: false,
            overlaps: true,
          },
        ],
      })
    ).toBe(false);
  });

  it('quiets media a full sheet actually overlaps', () => {
    expect(
      mediaIsQuietUnderCovers({
        connected: true,
        parkedOrCoveredFeed: false,
        covers: [
          {
            containsNode: false,
            band: false,
            inert: false,
            hidden: false,
            overlaps: true,
          },
        ],
      })
    ).toBe(true);
  });

  it('ignores a sheet that does not overlap the element', () => {
    expect(
      mediaIsQuietUnderCovers({
        connected: true,
        parkedOrCoveredFeed: false,
        covers: [
          {
            containsNode: false,
            band: false,
            inert: false,
            hidden: false,
            overlaps: false,
          },
        ],
      })
    ).toBe(false);
  });

  it('leaves the launcher playing so the dock hold can resume it', () => {
    expect(
      shouldPauseForeignOwner({
        pauseOwner: true,
        incomingIsDockHost: false,
        ownerIsDockHost: true,
      })
    ).toBe(false);
  });

  it('does not stop a muted picture when the launcher comes back', () => {
    expect(
      shouldPauseForeignOwner({
        pauseOwner: true,
        incomingIsDockHost: true,
        ownerIsDockHost: false,
      })
    ).toBe(false);
  });

  it('still swaps two ordinary players', () => {
    expect(
      shouldPauseForeignOwner({
        pauseOwner: true,
        incomingIsDockHost: false,
        ownerIsDockHost: false,
      })
    ).toBe(true);
  });

  it('pauses an opened post when the launcher is asked to play', () => {
    expect(
      launcherReclaimFor({
        dockHost: false,
        dockBorrow: false,
        audible: true,
        soundChip: false,
      })
    ).toBe('pause');
  });

  it('silences a feed picture that only has a mute chip', () => {
    expect(
      launcherReclaimFor({
        dockHost: false,
        dockBorrow: false,
        audible: true,
        soundChip: true,
      })
    ).toBe('mute');
  });

  it('leaves a muted picture and the launcher itself alone', () => {
    expect(
      launcherReclaimFor({
        dockHost: false,
        dockBorrow: false,
        audible: false,
        soundChip: true,
      })
    ).toBe('keep');
    expect(
      launcherReclaimFor({
        dockHost: true,
        dockBorrow: false,
        audible: true,
        soundChip: false,
      })
    ).toBe('keep');
    expect(
      launcherReclaimFor({
        dockHost: false,
        dockBorrow: true,
        audible: true,
        soundChip: false,
      })
    ).toBe('keep');
  });

  it('stays quiet under a parked trail sheet', () => {
    expect(
      mediaIsQuietUnderCovers({
        connected: true,
        parkedOrCoveredFeed: true,
        covers: [],
      })
    ).toBe(true);
  });
});

describe('shouldYieldToIncoming', () => {
  it('stops another audible post and leaves the launcher and previews', () => {
    expect(
      shouldYieldToIncoming({
        incoming: false,
        dockHost: false,
        dockBorrow: false,
        audible: true,
      })
    ).toBe(true);
    expect(
      shouldYieldToIncoming({
        incoming: true,
        dockHost: false,
        dockBorrow: false,
        audible: true,
      })
    ).toBe(false);
    expect(
      shouldYieldToIncoming({
        incoming: false,
        dockHost: true,
        dockBorrow: false,
        audible: true,
      })
    ).toBe(false);
    expect(
      shouldYieldToIncoming({
        incoming: false,
        dockHost: false,
        dockBorrow: true,
        audible: true,
      })
    ).toBe(false);
    expect(
      shouldYieldToIncoming({
        incoming: false,
        dockHost: false,
        dockBorrow: false,
        audible: false,
      })
    ).toBe(false);
  });
});

describe('shouldBorrowSpeakers', () => {
  it('pauses the launcher for a post that starts with sound', () => {
    expect(
      shouldBorrowSpeakers({
        intent: 'explicit',
        dockHost: false,
        muted: false,
        volume: 1,
      })
    ).toBe(true);
    expect(
      shouldBorrowSpeakers({
        intent: 'restart',
        dockHost: false,
        muted: false,
        volume: 1,
      })
    ).toBe(true);
  });

  it('leaves the launcher for a muted picture and for the song itself', () => {
    expect(
      shouldBorrowSpeakers({
        intent: 'explicit',
        dockHost: false,
        muted: true,
        volume: 1,
      })
    ).toBe(false);
    expect(
      shouldBorrowSpeakers({
        intent: 'passive',
        dockHost: false,
        muted: false,
        volume: 1,
      })
    ).toBe(false);
    expect(
      shouldBorrowSpeakers({
        intent: 'explicit',
        dockHost: true,
        muted: false,
        volume: 1,
      })
    ).toBe(false);
  });
});
