import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  albumHasAllTracksCached,
  mergeTrackIntoManifest,
  offlineAlbumToHoldingPeek,
  playableToOfflineMeta,
  playablesFromOfflineAlbum,
  resolvePlayableSrc,
} from '@/lib/collectibles-offline';

describe('mergeTrackIntoManifest', () => {
  it('adds and replaces tracks by cid', () => {
    const first = mergeTrackIntoManifest(
      null,
      { collectionId: 'night-drive', title: 'Night Drive', poster: null },
      { cid: 'bafk1', mime: 'audio/mpeg', url: '/a', title: 'One' }
    );
    const second = mergeTrackIntoManifest(first, first, {
      cid: 'bafk2',
      mime: 'audio/mpeg',
      url: '/b',
      title: 'Two',
    });
    const replaced = mergeTrackIntoManifest(second, second, {
      cid: 'bafk1',
      mime: 'audio/mpeg',
      url: '/a2',
      title: 'One (remaster)',
    });
    expect(replaced.tracks.map((track) => track.cid)).toEqual(['bafk2', 'bafk1']);
    expect(replaced.tracks[1]?.title).toBe('One (remaster)');
  });
});

describe('albumHasAllTracksCached', () => {
  it('requires every expected cid', () => {
    expect(albumHasAllTracksCached(['a', 'b'], new Set(['a', 'b']))).toBe(true);
    expect(albumHasAllTracksCached(['a', 'b'], new Set(['a']))).toBe(false);
    expect(albumHasAllTracksCached([], new Set())).toBe(false);
  });
});

describe('offline album library helpers', () => {
  it('turns a downloaded album into playables and a vault row', () => {
    const album = mergeTrackIntoManifest(
      null,
      { collectionId: 'night-drive', title: 'Night Drive', poster: '/art.jpg' },
      {
        cid: 'bafkreigdabcdefghijklmnopqrstuvwx',
        mime: 'audio/mpeg',
        url: '/api/ipfs/bafkreigdabcdefghijklmnopqrstuvwx',
        title: 'One',
      }
    );
    expect(playablesFromOfflineAlbum(album)).toEqual([
      {
        url: '/api/ipfs/bafkreigdabcdefghijklmnopqrstuvwx',
        mime: 'audio/mpeg',
        cid: 'bafkreigdabcdefghijklmnopqrstuvwx',
        title: 'One',
      },
    ]);
    const peek = offlineAlbumToHoldingPeek(album);
    expect(peek.actionLabel).toBe('Play');
    expect(peek.href).toContain('/collectibles/play');
    expect(peek.href).toContain('night-drive');
  });
});

describe('playableToOfflineMeta', () => {
  it('keeps cid mime title and lyrics', () => {
    expect(
      playableToOfflineMeta({
        url: 'https://cdn.onsocial.id/ipfs/bafkreigdabcdefghijklmnopqrstuvwx',
        mime: 'audio/mpeg',
        cid: 'bafkreigdabcdefghijklmnopqrstuvwx',
        title: 'Night',
        lyrics: 'go',
      })
    ).toEqual({
      cid: 'bafkreigdabcdefghijklmnopqrstuvwx',
      mime: 'audio/mpeg',
      url: 'https://cdn.onsocial.id/ipfs/bafkreigdabcdefghijklmnopqrstuvwx',
      title: 'Night',
      lyrics: 'go',
    });
  });
});

describe('resolvePlayableSrc', () => {
  const track = {
    url: '/api/ipfs/bafkreigdabcdefghijklmnopqrstuvwx',
    mime: 'audio/mpeg',
    cid: 'bafkreigdabcdefghijklmnopqrstuvwx',
  };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses the network URL while online', async () => {
    vi.stubGlobal('navigator', { onLine: true });
    await expect(resolvePlayableSrc(track)).resolves.toBe(track.url);
  });

  it('still uses the network URL online even when preferOffline is false', async () => {
    vi.stubGlobal('navigator', { onLine: true });
    await expect(
      resolvePlayableSrc(track, { preferOffline: false })
    ).resolves.toBe(track.url);
  });
});
