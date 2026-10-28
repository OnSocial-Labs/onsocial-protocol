import { describe, expect, it } from 'vitest';
import { resolveSingleMediaPlayback } from './single-media-playback';

const playing = {
  sameElement: false,
  sameKey: true,
  active: true,
  audible: true,
  playing: true,
  time: 12.4,
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
});
