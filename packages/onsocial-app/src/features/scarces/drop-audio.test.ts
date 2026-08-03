import { describe, expect, it } from 'vitest';
import {
  isDropAudioMime,
  musicTracksValid,
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
});

describe('sha256BlobBase64', () => {
  it('returns base64 of a 32-byte digest', async () => {
    const hash = await sha256BlobBase64(new Blob(['onsocial']));
    expect(hash).toMatch(/^[A-Za-z0-9+/]{43}=$/);
  });
});
