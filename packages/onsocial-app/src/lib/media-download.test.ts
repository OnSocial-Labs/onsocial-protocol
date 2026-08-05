import { describe, expect, it } from 'vitest';
import {
  cidFromMediaRef,
  downloadFilename,
  extensionForMime,
  ipfsDownloadUrl,
  mediaItemsNotCached,
} from '@/lib/media-download';
import { isLikelyIpfsCid } from '@/features/scarces/drop-writing';

describe('extensionForMime', () => {
  it('maps common audio and writing types', () => {
    expect(extensionForMime('audio/mpeg')).toBe('mp3');
    expect(extensionForMime('application/pdf')).toBe('pdf');
    expect(extensionForMime('text/markdown')).toBe('md');
    expect(extensionForMime('application/zip')).toBe('zip');
  });
});

describe('downloadFilename', () => {
  it('builds a safe name with extension', () => {
    expect(downloadFilename('Night Drive', 'audio/mpeg', 'track-1')).toBe(
      'Night-Drive.mp3'
    );
    expect(downloadFilename('zine.pdf', 'application/pdf', 'chapter-1')).toBe(
      'zine.pdf'
    );
  });
});

describe('cidFromMediaRef', () => {
  it('accepts raw audio CIDs and CDN paths', () => {
    const raw = 'bafkreigdabcdefghijklmnopqrstuvwx';
    expect(isLikelyIpfsCid(raw)).toBe(true);
    expect(cidFromMediaRef(raw)).toBe(raw);
    expect(
      cidFromMediaRef(null, `https://cdn.onsocial.id/ipfs/${raw}`)
    ).toBe(raw);
  });
});

describe('ipfsDownloadUrl', () => {
  it('adds download query params for a valid cid', () => {
    const href = ipfsDownloadUrl(
      'bafychapteroneaaaaaaaaaaaaaaaaaa',
      'chapter-1.md'
    );
    expect(href).toContain('/api/ipfs/bafychapteroneaaaaaaaaaaaaaaaaaa');
    expect(href).toContain('download=1');
    expect(href).toContain('filename=chapter-1.md');
  });

  it('accepts bafk raw CIDs', () => {
    const href = ipfsDownloadUrl(
      'bafkreigdabcdefghijklmnopqrstuvwx',
      'Night-Drive.mp3'
    );
    expect(href).toContain('/api/ipfs/bafkreigdabcdefghijklmnopqrstuvwx');
    expect(href).toContain('Night-Drive.mp3');
  });
});

describe('mediaItemsNotCached', () => {
  it('keeps tracks that are not on device yet', () => {
    const cid = 'bafkreigdabcdefghijklmnopqrstuvwx';
    expect(
      mediaItemsNotCached(
        [
          { cid, url: `/api/ipfs/${cid}`, mime: 'audio/mpeg' },
          {
            cid: 'bafkotheraaaaaaaaaaaaaaaaaaaaaaa',
            url: '/api/ipfs/bafkotheraaaaaaaaaaaaaaaaaaaaaaa',
            mime: 'audio/mpeg',
          },
        ],
        new Set([cid])
      ).map((item) => item.cid)
    ).toEqual(['bafkotheraaaaaaaaaaaaaaaaaaaaaaa']);
  });
});
