import { describe, expect, it } from 'vitest';
import {
  DROP_LYRICS_MAX_CHARS,
  audioReleaseFormatLabel,
  isDropAudioMime,
  isMultiTrackAudioFormat,
  musicTracksValid,
  normalizeTrackLyrics,
  sha256BlobBase64,
  trackTitleFromFile,
} from './drop-audio';

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

  it('allows one or more episodes for a podcast', () => {
    expect(musicTracksValid('podcast', 0)).toBe(false);
    expect(musicTracksValid('podcast', 1)).toBe(true);
    expect(musicTracksValid('podcast', 2)).toBe(true);
    expect(musicTracksValid('podcast', 30)).toBe(true);
    expect(musicTracksValid('podcast', 31)).toBe(false);
  });
});

describe('audioReleaseFormatLabel', () => {
  it('labels create-drop release formats', () => {
    expect(audioReleaseFormatLabel('single')).toBe('Single');
    expect(audioReleaseFormatLabel('album')).toBe('Album');
    expect(audioReleaseFormatLabel('podcast')).toBe('Podcast');
  });
});

describe('isMultiTrackAudioFormat', () => {
  it('treats album and podcast as multi-file', () => {
    expect(isMultiTrackAudioFormat('single')).toBe(false);
    expect(isMultiTrackAudioFormat('album')).toBe(true);
    expect(isMultiTrackAudioFormat('podcast')).toBe(true);
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
