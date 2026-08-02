/**
 * Variation-set archives — pin generated drop sets as IPFS directories.
 *
 * The app's generative art builder (and any external tool) zips a full set
 * of per-seat files and posts it here. The gateway unpacks the archive,
 * validates the `1.<ext>` … `N.<ext>` naming contract that the collection's
 * `metadata_template` relies on, and pins the files as one content-addressed
 * directory. The returned CIDs feed straight into create-collection as
 * `variationsCid` / `referenceCid`.
 */

import { unzipSync } from 'fflate';
import type { UploadedFile } from './shared.js';
import {
  ComposeError,
  logger,
  uploadNamedDirectory,
  variationMediaUrl,
} from './shared.js';

/** Hard cap on pieces per archive — matches the app's drop supply ceiling. */
export const MAX_ARCHIVE_PIECES = 10_000;
const MIN_ARCHIVE_PIECES = 2;

/** Per-file caps keep a hostile archive from ballooning gateway memory. */
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_TRAIT_JSON_BYTES = 64 * 1024;

const ARCHIVE_IMAGE_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
};

export interface VariationDirResult {
  cid: string;
  count: number;
  ext: string;
  urlTemplate: string;
}

export interface VariationSetArchiveResult {
  variations: VariationDirResult;
  reference?: VariationDirResult;
}

interface ArchiveEntry {
  seat: number;
  ext: string;
  data: Uint8Array;
}

/**
 * Unzip an archive and validate the seat-file naming contract: every kept
 * entry must be `<n>.<ext>` with seats forming a dense 1..N range and one
 * shared extension. Directory prefixes and OS junk files are ignored.
 */
function readSeatArchive(
  zip: UploadedFile,
  label: string,
  allowedExts: Set<string>,
  maxBytesPerFile: number
): ArchiveEntry[] {
  let unpacked: Record<string, Uint8Array>;
  try {
    unpacked = unzipSync(new Uint8Array(zip.buffer));
  } catch {
    throw new ComposeError(400, `The ${label} archive is not a valid ZIP`);
  }

  const entries: ArchiveEntry[] = [];
  const seen = new Set<number>();

  for (const [path, data] of Object.entries(unpacked)) {
    if (path.endsWith('/')) continue; // directory marker
    if (path.startsWith('__MACOSX/')) continue;
    const basename = path.split('/').pop() ?? '';
    if (!basename || basename.startsWith('.')) continue; // .DS_Store & co.

    const match = /^(\d+)\.([a-z0-9]+)$/i.exec(basename);
    if (!match) {
      throw new ComposeError(
        400,
        `${label} archive entry "${basename}" must be named <seat>.<ext> (1.png, 2.png, …)`
      );
    }
    const seat = Number.parseInt(match[1], 10);
    const ext = match[2].toLowerCase();
    if (!allowedExts.has(ext)) {
      throw new ComposeError(
        400,
        `${label} archive entry "${basename}" has unsupported extension .${ext}`
      );
    }
    if (seat < 1 || seat > MAX_ARCHIVE_PIECES) {
      throw new ComposeError(
        400,
        `${label} archive seat ${seat} is out of range (1-${MAX_ARCHIVE_PIECES})`
      );
    }
    if (seen.has(seat)) {
      throw new ComposeError(
        400,
        `${label} archive has more than one file for seat ${seat}`
      );
    }
    if (data.length > maxBytesPerFile) {
      throw new ComposeError(
        400,
        `${label} archive entry "${basename}" exceeds ${Math.floor(maxBytesPerFile / (1024 * 1024))} MB`
      );
    }
    seen.add(seat);
    entries.push({ seat, ext, data });
  }

  if (entries.length < MIN_ARCHIVE_PIECES) {
    throw new ComposeError(
      400,
      `${label} archive needs at least ${MIN_ARCHIVE_PIECES} seat files (1.<ext>, 2.<ext>, …)`
    );
  }

  const ext = entries[0].ext;
  if (entries.some((entry) => entry.ext !== ext)) {
    throw new ComposeError(
      400,
      `All ${label} files must share one extension so tokens can resolve them by seat number`
    );
  }

  for (let seat = 1; seat <= entries.length; seat += 1) {
    if (!seen.has(seat)) {
      throw new ComposeError(
        400,
        `${label} archive is missing seat ${seat} — files must run 1.${ext} through ${entries.length}.${ext} with no gaps`
      );
    }
  }

  entries.sort((a, b) => a.seat - b.seat);
  return entries;
}

/** Trait JSON must parse and be an object — marketplaces read it verbatim. */
function assertTraitJson(entry: ArchiveEntry): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(entry.data).toString('utf8'));
  } catch {
    throw new ComposeError(
      400,
      `Traits file ${entry.seat}.json is not valid JSON`
    );
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new ComposeError(
      400,
      `Traits file ${entry.seat}.json must be a JSON object (e.g. { "attributes": [...] })`
    );
  }
}

/**
 * Pin a zipped variation set (and optional trait set) as IPFS directories.
 *
 * Returns the directory CIDs plus `{seat_number}` URL templates ready to be
 * passed to create-collection as `variationsCid` / `referenceCid`.
 */
export async function uploadVariationSetArchives(
  imagesZip: UploadedFile,
  traitsZip?: UploadedFile
): Promise<VariationSetArchiveResult> {
  const images = readSeatArchive(
    imagesZip,
    'art',
    new Set(Object.keys(ARCHIVE_IMAGE_MIME)),
    MAX_IMAGE_BYTES
  );

  let traits: ArchiveEntry[] | undefined;
  if (traitsZip) {
    traits = readSeatArchive(
      traitsZip,
      'traits',
      new Set(['json']),
      MAX_TRAIT_JSON_BYTES
    );
    if (traits.length !== images.length) {
      throw new ComposeError(
        400,
        `Traits archive has ${traits.length} files but the art archive has ${images.length} — one JSON per piece`
      );
    }
    for (const entry of traits) assertTraitJson(entry);
  }

  const ext = images[0].ext;
  const artCid = await uploadNamedDirectory(
    images.map((entry) => ({
      buffer: Buffer.from(entry.data),
      filename: `${entry.seat}.${ext}`,
      mime: ARCHIVE_IMAGE_MIME[ext],
    }))
  );

  const result: VariationSetArchiveResult = {
    variations: {
      cid: artCid,
      count: images.length,
      ext,
      urlTemplate: variationMediaUrl(artCid, ext),
    },
  };

  if (traits) {
    const traitsCid = await uploadNamedDirectory(
      traits.map((entry) => ({
        buffer: Buffer.from(entry.data),
        filename: `${entry.seat}.json`,
        mime: 'application/json',
      }))
    );
    result.reference = {
      cid: traitsCid,
      count: traits.length,
      ext: 'json',
      urlTemplate: variationMediaUrl(traitsCid, 'json'),
    };
  }

  logger.info(
    {
      artCid: result.variations.cid,
      traitsCid: result.reference?.cid,
      count: images.length,
      ext,
    },
    'Variation set archive pinned to Lighthouse'
  );

  return result;
}
