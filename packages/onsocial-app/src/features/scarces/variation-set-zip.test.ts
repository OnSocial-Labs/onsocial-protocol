import { describe, expect, it } from 'vitest';
import { unzipSync } from 'fflate';
import {
  buildVariationSetZip,
  seatFileNames,
  SET_MIME_EXT,
} from './variation-set-zip';

function pngFile(bytes: number[], name: string): File {
  return new File([new Uint8Array(bytes)], name, { type: 'image/png' });
}

describe('seatFileNames', () => {
  it('names seats densely from 1 in order', () => {
    expect(seatFileNames(3, 'png')).toEqual(['1.png', '2.png', '3.png']);
  });

  it('carries the extension through', () => {
    expect(seatFileNames(2, 'webp')).toEqual(['1.webp', '2.webp']);
  });
});

describe('SET_MIME_EXT', () => {
  it('maps every accepted upload mime to a gateway-supported extension', () => {
    expect(SET_MIME_EXT['image/png']).toBe('png');
    expect(SET_MIME_EXT['image/jpeg']).toBe('jpg');
    expect(SET_MIME_EXT['image/webp']).toBe('webp');
  });
});

describe('buildVariationSetZip', () => {
  it('zips files as 1.<ext> … N.<ext> in selection order', async () => {
    const files = [
      pngFile([1, 1], 'zebra.png'),
      pngFile([2, 2], 'apple.png'),
      pngFile([3, 3], 'mango.png'),
    ];

    const { imagesZip, ext } = await buildVariationSetZip(files);
    expect(ext).toBe('png');

    const unpacked = unzipSync(
      new Uint8Array(await imagesZip.arrayBuffer())
    );
    expect(Object.keys(unpacked).sort()).toEqual(['1.png', '2.png', '3.png']);
    // Selection order defines the seat, not the original filenames.
    expect(Array.from(unpacked['1.png'])).toEqual([1, 1]);
    expect(Array.from(unpacked['2.png'])).toEqual([2, 2]);
    expect(Array.from(unpacked['3.png'])).toEqual([3, 3]);
  });

  it('derives the archive extension from the shared mime', async () => {
    const files = [
      new File([new Uint8Array([9])], 'a.jpg', { type: 'image/jpeg' }),
      new File([new Uint8Array([8])], 'b.jpg', { type: 'image/jpeg' }),
    ];
    const { imagesZip, ext } = await buildVariationSetZip(files);
    expect(ext).toBe('jpg');
    const unpacked = unzipSync(
      new Uint8Array(await imagesZip.arrayBuffer())
    );
    expect(Object.keys(unpacked).sort()).toEqual(['1.jpg', '2.jpg']);
  });
});
