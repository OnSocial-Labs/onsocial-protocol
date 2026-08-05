/**
 * Same-origin IPFS downloads — fetch bytes, save with a human filename.
 * Never navigate to the CDN (that opens/plays the CID path).
 */

import { zipSync } from 'fflate';
import {
  isLikelyIpfsCid,
  writingContentUrl,
} from '@/features/scarces/drop-writing';

const MIME_EXTENSION: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/ogg': 'ogg',
  'audio/webm': 'webm',
  'audio/x-m4a': 'm4a',
  'audio/m4a': 'm4a',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'application/pdf': 'pdf',
  'text/markdown': 'md',
  'text/x-markdown': 'md',
  'text/plain': 'txt',
  'application/zip': 'zip',
};

export function extensionForMime(mime: string): string {
  const key = mime.trim().toLowerCase();
  if (MIME_EXTENSION[key]) return MIME_EXTENSION[key]!;
  if (key.startsWith('audio/')) return 'audio';
  if (key.startsWith('video/')) return 'video';
  if (key.startsWith('text/')) return 'txt';
  return 'bin';
}

/** Safe basename + extension for Content-Disposition / save-as. */
export function downloadFilename(
  title: string | undefined,
  mime: string,
  fallback: string
): string {
  const ext = extensionForMime(mime);
  const raw = (title?.trim() || fallback).trim() || fallback;
  const base = raw
    .replace(/[^\w\s.-]+/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
  const stem = base || fallback.replace(/[^\w.-]+/g, '-') || 'download';
  const lower = stem.toLowerCase();
  if (lower.endsWith(`.${ext}`)) return stem;
  return `${stem}.${ext}`;
}

/** CID from metadata, or scraped from a CDN / ipfs:// / proxy URL. */
export function cidFromMediaRef(
  cid?: string | null,
  url?: string | null
): string | null {
  const direct = cid?.trim().replace(/^ipfs:\/\//i, '') ?? '';
  const directRoot = direct.split('/')[0] ?? '';
  if (directRoot && isLikelyIpfsCid(directRoot)) return directRoot;

  const href = url?.trim() ?? '';
  if (!href) return null;
  const fromPath = href.match(
    /(?:\/ipfs\/|ipfs:\/\/)([A-Za-z0-9]+)/i
  )?.[1];
  if (fromPath && isLikelyIpfsCid(fromPath)) return fromPath;
  return null;
}

/** Same-origin proxy URL that forces attachment download. */
export function ipfsDownloadUrl(cid: string, filename: string): string | null {
  const path = writingContentUrl(cid);
  if (!path) return null;
  const params = new URLSearchParams({
    download: '1',
    filename,
  });
  return `${path}?${params.toString()}`;
}

function saveBlob(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 2_000);
}

export type DownloadProgressHandler = (ratio: number | null) => void;

export function isDownloadAbort(error: unknown): boolean {
  return (
    (error instanceof DOMException || error instanceof Error) &&
    error.name === 'AbortError'
  );
}

type SaveFilePicker = (options: {
  suggestedName?: string;
  types?: Array<{
    description?: string;
    accept: Record<string, string[]>;
  }>;
}) => Promise<FileSystemFileHandle>;

function mediaHref(opts: { cid?: string | null; url: string }): string {
  const cid = cidFromMediaRef(opts.cid, opts.url);
  const href = cid ? writingContentUrl(cid) : null;
  if (!href) {
    throw new Error('Could not resolve a downloadable file.');
  }
  return href;
}

type DirectoryPicker = (options?: {
  id?: string;
  mode?: 'read' | 'readwrite';
  startIn?: 'downloads' | 'music' | 'documents';
}) => Promise<FileSystemDirectoryHandle>;

async function pickSaveDirectory(): Promise<FileSystemDirectoryHandle | null> {
  const picker = (
    window as Window & { showDirectoryPicker?: DirectoryPicker }
  ).showDirectoryPicker;
  if (typeof picker !== 'function') return null;
  try {
    return await picker({ id: 'onsocial-media-export', startIn: 'music' });
  } catch (error) {
    if (isDownloadAbort(error)) throw error;
    return null;
  }
}

async function pickSaveFile(
  filename: string,
  mime: string
): Promise<FileSystemFileHandle | null> {
  const picker = (
    window as Window & { showSaveFilePicker?: SaveFilePicker }
  ).showSaveFilePicker;
  if (typeof picker !== 'function') return null;
  const ext = extensionForMime(mime);
  const acceptMime = mime.split(';')[0]?.trim() || 'application/octet-stream';
  try {
    return await picker({
      suggestedName: filename,
      types: [
        {
          description: ext.toUpperCase(),
          accept: { [acceptMime]: [`.${ext}`] },
        },
      ],
    });
  } catch (error) {
    if (isDownloadAbort(error)) throw error;
    return null;
  }
}

async function writeResponseToHandle(
  response: Response,
  handle: FileSystemFileHandle,
  onProgress?: DownloadProgressHandler
): Promise<void> {
  const writable = await handle.createWritable();
  const total = Number(response.headers.get('content-length')) || 0;
  const reader = response.body?.getReader();
  if (!reader) {
    await writable.write(await response.blob());
    await writable.close();
    onProgress?.(1);
    return;
  }

  let received = 0;
  onProgress?.(total > 0 ? 0 : null);
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      await writable.write(value);
      received += value.byteLength;
      onProgress?.(total > 0 ? Math.min(1, received / total) : null);
    }
    await writable.close();
    onProgress?.(1);
  } catch (error) {
    await writable.abort().catch(() => undefined);
    throw error;
  }
}

async function readResponseBlob(
  response: Response,
  onProgress?: DownloadProgressHandler
): Promise<Blob> {
  const total = Number(response.headers.get('content-length')) || 0;
  if (!response.body) {
    onProgress?.(1);
    return response.blob();
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  onProgress?.(total > 0 ? 0 : null);
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    chunks.push(value);
    received += value.byteLength;
    onProgress?.(total > 0 ? Math.min(1, received / total) : null);
  }
  onProgress?.(1);
  return new Blob(chunks as BlobPart[]);
}

async function fetchMediaBlob(
  opts: {
    cid?: string | null;
    url: string;
  },
  onProgress?: DownloadProgressHandler
): Promise<Blob> {
  const response = await fetch(mediaHref(opts));
  if (!response.ok) {
    throw new Error('Could not download this file.');
  }
  return readResponseBlob(response, onProgress);
}

async function exportBlob(
  blob: Blob,
  filename: string,
  mime: string
): Promise<void> {
  try {
    const handle = await pickSaveFile(filename, mime);
    if (handle) {
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    }
  } catch (error) {
    if (isDownloadAbort(error)) return;
    throw error;
  }
  saveBlob(blob, filename);
}

export type OfflineCacheBytesHandler = (args: {
  cid: string;
  mime: string;
  blob: Blob;
}) => Promise<void>;

export function mediaItemsNotCached<
  T extends { cid?: string | null; url: string },
>(items: readonly T[], cachedCids: ReadonlySet<string>): T[] {
  return items.filter((item) => {
    const cid = cidFromMediaRef(item.cid, item.url);
    return !cid || !cachedCids.has(cid);
  });
}

/**
 * Pick save location first (Chromium), then stream bytes.
 * Safari / Firefox fall back to blob + browser download after fetch.
 */
export async function downloadIpfsMedia(opts: {
  cid?: string | null;
  url: string;
  mime: string;
  title?: string;
  fallbackName: string;
  onProgress?: DownloadProgressHandler;
  /** Cache in-app (holders). Defaults to no file export when set. */
  cacheOffline?: boolean;
  /** Save a file copy. Defaults to true unless `cacheOffline` is set. */
  exportFile?: boolean;
  onOfflineCache?: OfflineCacheBytesHandler;
}): Promise<void> {
  const filename = downloadFilename(opts.title, opts.mime, opts.fallbackName);
  const cid = cidFromMediaRef(opts.cid, opts.url);
  const shouldExport = opts.exportFile ?? !opts.cacheOffline;

  if (opts.cacheOffline) {
    opts.onProgress?.(null);
    const response = await fetch(mediaHref(opts));
    if (!response.ok) {
      throw new Error('Could not download this file.');
    }
    const blob = await readResponseBlob(response, opts.onProgress);
    if (cid && opts.onOfflineCache) {
      await opts.onOfflineCache({ cid, mime: opts.mime, blob });
    }
    if (shouldExport) await exportBlob(blob, filename, opts.mime);
    return;
  }

  const handle = await pickSaveFile(filename, opts.mime);
  opts.onProgress?.(null);
  const response = await fetch(mediaHref(opts));
  if (!response.ok) {
    throw new Error('Could not download this file.');
  }
  if (handle) {
    await writeResponseToHandle(response, handle, opts.onProgress);
    return;
  }
  saveBlob(await readResponseBlob(response, opts.onProgress), filename);
}

/**
 * Export each track as its real file (mp3 / m4a / …), not a zip.
 * Chromium: pick a folder once, skip names that already exist.
 * Safari / Firefox: sequential browser downloads into Downloads.
 */
export async function exportIpfsAlbumTracks(
  items: ReadonlyArray<{
    cid?: string | null;
    url: string;
    mime: string;
    title?: string;
    fallbackName: string;
  }>,
  onProgress?: DownloadProgressHandler
): Promise<void> {
  if (items.length === 0) return;
  if (items.length === 1) {
    await downloadIpfsMedia({ ...items[0]!, onProgress, exportFile: true });
    return;
  }

  const directory = await pickSaveDirectory();
  onProgress?.(null);
  const used = new Set<string>();
  const total = items.length;
  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    const name = uniqueZipName(
      downloadFilename(
        item.title,
        item.mime,
        item.fallbackName || `track-${i + 1}`
      ),
      i,
      used
    );
    if (directory) {
      try {
        await directory.getFileHandle(name);
        onProgress?.((i + 1) / total);
        continue;
      } catch {
        const handle = await directory.getFileHandle(name, { create: true });
        const response = await fetch(mediaHref(item));
        if (!response.ok) {
          throw new Error('Could not download this file.');
        }
        await writeResponseToHandle(response, handle, (fileRatio) => {
          if (fileRatio == null) {
            onProgress?.(i / total);
            return;
          }
          onProgress?.((i + fileRatio) / total);
        });
        continue;
      }
    }
    await downloadIpfsMedia({
      ...item,
      exportFile: true,
      onProgress: (fileRatio) => {
        if (fileRatio == null) {
          onProgress?.(i / total);
          return;
        }
        onProgress?.((i + fileRatio) / total);
      },
    });
  }
  onProgress?.(1);
}

/** One zip of every track / chapter — save dialog first, then fetch + zip. */
export async function downloadIpfsAlbumZip(
  items: ReadonlyArray<{
    cid?: string | null;
    url: string;
    mime: string;
    title?: string;
    fallbackName: string;
  }>,
  albumTitle?: string,
  onProgress?: DownloadProgressHandler,
  opts?: {
    cacheOffline?: boolean;
    exportFile?: boolean;
    onOfflineCache?: OfflineCacheBytesHandler;
    skipCids?: ReadonlySet<string>;
  }
): Promise<void> {
  const pending = opts?.skipCids
    ? mediaItemsNotCached(items, opts.skipCids)
    : [...items];
  if (pending.length === 0) {
    onProgress?.(1);
    return;
  }
  if (pending.length === 1 && !opts?.cacheOffline) {
    await downloadIpfsMedia({
      ...pending[0]!,
      onProgress,
      cacheOffline: opts?.cacheOffline,
      exportFile: opts?.exportFile,
      onOfflineCache: opts?.onOfflineCache,
    });
    return;
  }

  const shouldExport = opts?.exportFile ?? !opts?.cacheOffline;
  if (opts?.cacheOffline && !shouldExport) {
    onProgress?.(null);
    const total = pending.length;
    for (let i = 0; i < pending.length; i++) {
      const item = pending[i]!;
      const blob = await fetchMediaBlob(item, (fileRatio) => {
        if (fileRatio == null) {
          onProgress?.(total > 0 ? i / total : null);
          return;
        }
        onProgress?.((i + fileRatio) / total);
      });
      const cid = cidFromMediaRef(item.cid, item.url);
      if (cid && opts.onOfflineCache) {
        await opts.onOfflineCache({ cid, mime: item.mime, blob });
      }
    }
    onProgress?.(1);
    return;
  }

  const filename = downloadFilename(albumTitle, 'application/zip', 'album');
  const handle = await pickSaveFile(filename, 'application/zip');
  onProgress?.(null);
  const files: Record<string, Uint8Array> = {};
  const used = new Set<string>();
  const total = pending.length;
  for (let i = 0; i < pending.length; i++) {
    const item = pending[i]!;
    const blob = await fetchMediaBlob(item, (fileRatio) => {
      if (fileRatio == null) {
        onProgress?.(total > 0 ? i / total : null);
        return;
      }
      onProgress?.((i + fileRatio) / total);
    });
    const cid = cidFromMediaRef(item.cid, item.url);
    if (cid && opts?.onOfflineCache) {
      await opts.onOfflineCache({ cid, mime: item.mime, blob });
    }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    files[
      uniqueZipName(
        downloadFilename(
          item.title,
          item.mime,
          item.fallbackName || `track-${i + 1}`
        ),
        i,
        used
      )
    ] = bytes;
  }
  onProgress?.(0.97);
  const zipped = zipSync(files);
  if (handle) {
    const writable = await handle.createWritable();
    await writable.write(zipped);
    await writable.close();
  } else {
    saveBlob(new Blob([zipped], { type: 'application/zip' }), filename);
  }
  onProgress?.(1);
}

function uniqueZipName(
  name: string,
  index: number,
  used: Set<string>
): string {
  let next = name;
  if (used.has(next.toLowerCase())) {
    const dot = next.lastIndexOf('.');
    const stem = dot > 0 ? next.slice(0, dot) : next;
    const ext = dot > 0 ? next.slice(dot) : '';
    next = `${stem}-${index + 1}${ext}`;
  }
  used.add(next.toLowerCase());
  return next;
}
