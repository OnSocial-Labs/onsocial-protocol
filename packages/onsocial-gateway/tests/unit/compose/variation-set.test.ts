/**
 * Tests for variation-set archive uploads: uploadVariationSetArchives.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { zipSync } from 'fflate';
import { mockUploadDirectory, makeFile } from './helpers.js';
import {
  uploadVariationSetArchives,
  ComposeError,
} from '../../../src/services/compose/index.js';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);

function zipFile(entries: Record<string, Uint8Array>, name = 'set.zip') {
  return makeFile({
    originalname: name,
    mimetype: 'application/zip',
    buffer: Buffer.from(zipSync(entries)),
  });
}

function artZip(count: number, ext = 'png') {
  const entries: Record<string, Uint8Array> = {};
  for (let seat = 1; seat <= count; seat += 1) {
    entries[`${seat}.${ext}`] = PNG;
  }
  return zipFile(entries);
}

function traitsZip(count: number) {
  const entries: Record<string, Uint8Array> = {};
  for (let seat = 1; seat <= count; seat += 1) {
    entries[`${seat}.json`] = new TextEncoder().encode(
      JSON.stringify({
        attributes: [{ trait_type: 'Seat', value: String(seat) }],
      })
    );
  }
  return zipFile(entries, 'traits.zip');
}

function mockDirectoryUploads(...cids: string[]) {
  for (const cid of cids) {
    mockUploadDirectory.mockResolvedValueOnce({ dirHash: cid, entries: [] });
  }
}

describe('uploadVariationSetArchives', () => {
  beforeEach(() => vi.clearAllMocks());

  it('pins the art archive as one directory with seat-named files', async () => {
    mockDirectoryUploads('QmArtDir');

    const result = await uploadVariationSetArchives(artZip(3));

    expect(result.variations.cid).toBe('QmArtDir');
    expect(result.variations.count).toBe(3);
    expect(result.variations.ext).toBe('png');
    expect(result.variations.urlTemplate).toBe(
      'https://test-gw.lighthouseweb3.xyz/ipfs/QmArtDir/{seat_number}.png'
    );
    expect(result.reference).toBeUndefined();

    const uploaded = mockUploadDirectory.mock.calls[0][0].files;
    expect(uploaded.map((f: { filename: string }) => f.filename)).toEqual([
      '1.png',
      '2.png',
      '3.png',
    ]);
  });

  it('pins traits as a second directory and returns both CIDs', async () => {
    mockDirectoryUploads('QmArtDir', 'QmTraitsDir');

    const result = await uploadVariationSetArchives(artZip(2), traitsZip(2));

    expect(result.variations.cid).toBe('QmArtDir');
    expect(result.reference?.cid).toBe('QmTraitsDir');
    expect(result.reference?.ext).toBe('json');
    expect(result.reference?.urlTemplate).toBe(
      'https://test-gw.lighthouseweb3.xyz/ipfs/QmTraitsDir/{seat_number}.json'
    );
    expect(mockUploadDirectory).toHaveBeenCalledTimes(2);
  });

  it('ignores folder prefixes and OS junk entries', async () => {
    mockDirectoryUploads('QmArtDir');

    const result = await uploadVariationSetArchives(
      zipFile({
        'output/1.png': PNG,
        'output/2.png': PNG,
        '__MACOSX/1.png': PNG,
        'output/.DS_Store': new Uint8Array([1]),
      })
    );

    expect(result.variations.count).toBe(2);
  });

  it('rejects a non-ZIP payload', async () => {
    await expect(
      uploadVariationSetArchives(
        makeFile({
          originalname: 'not.zip',
          mimetype: 'application/zip',
          buffer: Buffer.from('plain text'),
        })
      )
    ).rejects.toThrow('not a valid ZIP');
  });

  it('rejects gaps in the seat numbering', async () => {
    await expect(
      uploadVariationSetArchives(zipFile({ '1.png': PNG, '3.png': PNG }))
    ).rejects.toThrow('missing seat 2');
  });

  it('rejects mixed image extensions', async () => {
    await expect(
      uploadVariationSetArchives(zipFile({ '1.png': PNG, '2.jpg': PNG }))
    ).rejects.toThrow('share one extension');
  });

  it('rejects files that are not seat-named', async () => {
    await expect(
      uploadVariationSetArchives(
        zipFile({ 'cover.png': PNG, '1.png': PNG, '2.png': PNG })
      )
    ).rejects.toThrow('must be named <seat>.<ext>');
  });

  it('rejects a traits archive whose count differs from the art', async () => {
    await expect(
      uploadVariationSetArchives(artZip(3), traitsZip(2))
    ).rejects.toThrow('one JSON per piece');
    expect(mockUploadDirectory).not.toHaveBeenCalled();
  });

  it('rejects trait files that are not JSON objects', async () => {
    const badTraits = zipFile(
      {
        '1.json': new TextEncoder().encode('"just a string"'),
        '2.json': new TextEncoder().encode('{}'),
      },
      'traits.zip'
    );
    await expect(
      uploadVariationSetArchives(artZip(2), badTraits)
    ).rejects.toThrow('must be a JSON object');
  });

  it('rejects sets with fewer than two pieces', async () => {
    await expect(
      uploadVariationSetArchives(zipFile({ '1.png': PNG }))
    ).rejects.toThrow('at least 2');
  });

  it('surfaces ComposeError with a 400 status', async () => {
    try {
      await uploadVariationSetArchives(zipFile({ '1.png': PNG }));
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ComposeError);
      expect((error as ComposeError).status).toBe(400);
    }
  });
});
