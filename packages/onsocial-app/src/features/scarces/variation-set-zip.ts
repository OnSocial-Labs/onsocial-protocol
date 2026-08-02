/**
 * Client-side variation set packaging — turn a creator's file selection into
 * the seat-named ZIP archive the gateway pins (`1.<ext>` … `N.<ext>`).
 *
 * Selection order is the seat order: the first picked file becomes piece 1.
 * The gateway re-validates naming, extensions, and density server-side; this
 * mirror exists so big uploads never require external tools or IPFS steps.
 */

import { zipSync } from 'fflate';

/** Seat-file extension for the client-zipped set, from the shared mime. */
export const SET_MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

/** Archive entry names for a selection — `1.<ext>` … `N.<ext>` in order. */
export function seatFileNames(count: number, ext: string): string[] {
  return Array.from({ length: count }, (_, index) => `${index + 1}.${ext}`);
}

/**
 * Zip a file selection into a seat-named art archive ready for
 * `scarces.collections.uploadVariationSet`. Files must already be validated
 * (same mime, size caps) by the caller.
 */
export async function buildVariationSetZip(
  files: readonly File[]
): Promise<{ imagesZip: Blob; ext: string }> {
  const ext = SET_MIME_EXT[files[0]?.type ?? ''] ?? 'png';
  const names = seatFileNames(files.length, ext);
  const artFiles: Record<string, Uint8Array> = {};
  for (let i = 0; i < files.length; i += 1) {
    artFiles[names[i]] = new Uint8Array(await files[i].arrayBuffer());
  }
  // Images are already compressed — store, don't deflate.
  const imagesZip = new Blob([zipSync(artFiles, { level: 0 })], {
    type: 'application/zip',
  });
  return { imagesZip, ext };
}
