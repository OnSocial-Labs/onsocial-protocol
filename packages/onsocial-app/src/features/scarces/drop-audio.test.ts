import { describe, expect, it } from 'vitest';
import { reorderByInsert } from './drop-track-order';
import {
  DROP_LYRICS_MAX_CHARS,
  isDropAudioMime,
  musicTracksValid,
  normalizeTrackLyrics,
  playableFromPinnedFiles,
  sha256BlobBase64,
  trackTitleFromFile,
} from './drop-audio';

function mp3(name: string): File {
  return new File(['audio'], name, { type: 'audio/mpeg' });
}

describe('isDropAudioMime', () => {
  it('accepts common audio types', () => {
    expect(isDropAudioMime('audio/mpeg')).toBe(true);
    expect(isDropAudioMime('audio/mp4')).toBe(true);
    expect(isDropAudioMime('audio/wav')).toBe(true);
  });

  it('rejects images', () => {
    expect(isDropAudioMime('image/png')).toBe(false);
  });
});

describe('trackTitleFromFile', () => {
  it('strips extension and softens separators', () => {
    expect(trackTitleFromFile(new File([], 'cool-track_v2.mp3'))).toBe(
      'cool track v2'
    );
  });
});

describe('musicTracksValid', () => {
  it('requires exactly one track for a single', () => {
    expect(musicTracksValid('single', 1)).toBe(true);
    expect(musicTracksValid('single', 2)).toBe(false);
  });

  it('requires two or more for an album', () => {
    expect(musicTracksValid('album', 1)).toBe(false);
    expect(musicTracksValid('album', 2)).toBe(true);
    expect(musicTracksValid('album', 10)).toBe(true);
  });
});

describe('sha256BlobBase64', () => {
  it('returns base64 of a 32-byte digest', async () => {
    const hash = await sha256BlobBase64(new Blob(['onsocial']));
    expect(hash).toMatch(/^[A-Za-z0-9+/]{43}=$/);
  });
});

describe('normalizeTrackLyrics', () => {
  it('omits blank lyrics', () => {
    expect(normalizeTrackLyrics('')).toBeUndefined();
    expect(normalizeTrackLyrics('   \n  ')).toBeUndefined();
    expect(normalizeTrackLyrics(null)).toBeUndefined();
  });

  it('keeps plain text and clamps length', () => {
    expect(normalizeTrackLyrics('  verse one\r\nverse two  ')).toBe(
      '  verse one\nverse two'
    );
    const long = 'a'.repeat(DROP_LYRICS_MAX_CHARS + 40);
    expect(normalizeTrackLyrics(long)?.length).toBe(DROP_LYRICS_MAX_CHARS);
  });
});

describe('playableFromPinnedFiles', () => {
  it('pins extra.playable in the post-reorder UI order, including lyrics', () => {
    const picked = [
      mp3('01-sunrise.mp3'),
      mp3('02-noon.mp3'),
      mp3('03-dusk.mp3'),
    ];
    const lyrics = ['dawn verse', 'midday verse', 'night verse'];

    const lastToTop = reorderByInsert(picked, 2, 0);
    const lastToTopLyrics = reorderByInsert(lyrics, 2, 0);
    expect(lastToTop.map((f) => f.name)).toEqual([
      '03-dusk.mp3',
      '01-sunrise.mp3',
      '02-noon.mp3',
    ]);

    const midList = reorderByInsert(lastToTop, 2, 1);
    const midListLyrics = reorderByInsert(lastToTopLyrics, 2, 1);
    expect(midList.map((f) => f.name)).toEqual([
      '03-dusk.mp3',
      '02-noon.mp3',
      '01-sunrise.mp3',
    ]);

    const uploaded = [
      { cid: 'bafydusktrackaaaaaaaaaaaaaaaaaaa' },
      { cid: 'bafynoontrackaaaaaaaaaaaaaaaaaaa' },
      { cid: 'bafysunrisetrackaaaaaaaaaaaaaaaa' },
    ];
    const playable = playableFromPinnedFiles(midList, uploaded, midListLyrics);

    expect(playable.map((t) => t.title)).toEqual([
      '03 dusk',
      '02 noon',
      '01 sunrise',
    ]);
    expect(playable.map((t) => t.cid)).toEqual([
      'bafydusktrackaaaaaaaaaaaaaaaaaaa',
      'bafynoontrackaaaaaaaaaaaaaaaaaaa',
      'bafysunrisetrackaaaaaaaaaaaaaaaa',
    ]);
    expect(playable.map((t) => t.lyrics)).toEqual([
      'night verse',
      'midday verse',
      'dawn verse',
    ]);
  });
});
