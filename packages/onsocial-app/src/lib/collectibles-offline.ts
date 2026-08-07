/**
 * Holder offline library — OPFS audio blobs keyed by CID + album manifests.
 * Playback resolves a blob URL when cached; otherwise the network URL.
 */

import type { ScarcePlayableMedia } from '@/features/market/market-listings';
import { collectiblesPlayPath } from '@/lib/app-routes';
import { cidFromMediaRef } from '@/lib/media-download';
import type { PortfolioHoldingPeek } from '@/lib/portfolio-holdings';

const ROOT_DIR = 'collectibles-offline';
const TRACKS_DIR = 'tracks';
const INDEX_FILE = 'index.json';
export const NOW_PLAYING_STORAGE_KEY = 'onsocial.collectibles.nowPlaying.v1';

export interface OfflineTrackMeta {
  cid: string;
  mime: string;
  url: string;
  title?: string;
  lyrics?: string;
}

export interface OfflineAlbumManifest {
  collectionId: string;
  title: string;
  poster: string | null;
  tracks: OfflineTrackMeta[];
  updatedAt: number;
}

interface OfflineIndex {
  tracks: Record<string, { mime: string }>;
  albums: Record<string, OfflineAlbumManifest>;
}

export interface PersistedNowPlayingSession {
  collectionId: string;
  title: string;
  poster: string | null;
  tracks: ScarcePlayableMedia[];
  activeIndex: number;
  localOnly?: boolean;
}

function emptyIndex(): OfflineIndex {
  return { tracks: {}, albums: {} };
}

export function isOfflineCacheSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.storage?.getDirectory === 'function'
  );
}

export function trackCidFromPlayable(
  track: Pick<ScarcePlayableMedia, 'cid' | 'url'>
): string | null {
  return cidFromMediaRef(track.cid, track.url);
}

export function playableToOfflineMeta(
  track: ScarcePlayableMedia
): OfflineTrackMeta | null {
  const cid = trackCidFromPlayable(track);
  if (!cid) return null;
  return {
    cid,
    mime: track.mime,
    url: track.url,
    ...(track.title?.trim() ? { title: track.title.trim() } : {}),
    ...(track.lyrics?.trim() ? { lyrics: track.lyrics } : {}),
  };
}

export function mergeTrackIntoManifest(
  current: OfflineAlbumManifest | null,
  album: {
    collectionId: string;
    title: string;
    poster: string | null;
  },
  track: OfflineTrackMeta
): OfflineAlbumManifest {
  const tracks = current?.tracks.filter((entry) => entry.cid !== track.cid) ?? [];
  tracks.push(track);
  return {
    collectionId: album.collectionId,
    title: album.title,
    poster: album.poster,
    tracks,
    updatedAt: Date.now(),
  };
}

export function albumHasAllTracksCached(
  expectedCids: readonly string[],
  cachedCids: ReadonlySet<string>
): boolean {
  if (expectedCids.length === 0) return false;
  return expectedCids.every((cid) => cachedCids.has(cid));
}

async function rootDir(): Promise<FileSystemDirectoryHandle> {
  if (!isOfflineCacheSupported()) {
    throw new Error('Offline library is not supported in this browser.');
  }
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(ROOT_DIR, { create: true });
}

async function tracksDir(): Promise<FileSystemDirectoryHandle> {
  const root = await rootDir();
  return root.getDirectoryHandle(TRACKS_DIR, { create: true });
}

async function readIndex(): Promise<OfflineIndex> {
  try {
    const root = await rootDir();
    const handle = await root.getFileHandle(INDEX_FILE);
    const file = await handle.getFile();
    const parsed = JSON.parse(await file.text()) as OfflineIndex;
    return {
      tracks: parsed.tracks ?? {},
      albums: parsed.albums ?? {},
    };
  } catch {
    return emptyIndex();
  }
}

async function writeIndex(index: OfflineIndex): Promise<void> {
  const root = await rootDir();
  const handle = await root.getFileHandle(INDEX_FILE, { create: true });
  const writable = await handle.createWritable();
  await writable.write(JSON.stringify(index));
  await writable.close();
}

export async function isTrackCached(cid: string): Promise<boolean> {
  if (!cid || !isOfflineCacheSupported()) return false;
  try {
    const dir = await tracksDir();
    await dir.getFileHandle(cid);
    return true;
  } catch {
    return false;
  }
}

export async function cachedTrackCids(
  cids: readonly string[]
): Promise<Set<string>> {
  const out = new Set<string>();
  await Promise.all(
    cids.map(async (cid) => {
      if (cid && (await isTrackCached(cid))) out.add(cid);
    })
  );
  return out;
}

export async function isAlbumCached(
  expectedCids: readonly string[]
): Promise<boolean> {
  const cached = await cachedTrackCids(expectedCids);
  return albumHasAllTracksCached(expectedCids, cached);
}

export async function cacheTrackBlob(
  cid: string,
  mime: string,
  blob: Blob
): Promise<void> {
  const dir = await tracksDir();
  const handle = await dir.getFileHandle(cid, { create: true });
  const writable = await handle.createWritable();
  await writable.write(blob);
  await writable.close();
  const index = await readIndex();
  index.tracks[cid] = { mime };
  await writeIndex(index);
}

export async function upsertAlbumManifest(
  manifest: OfflineAlbumManifest
): Promise<void> {
  const index = await readIndex();
  index.albums[manifest.collectionId] = manifest;
  await writeIndex(index);
}

export async function rememberCachedTrack(opts: {
  collectionId: string;
  title: string;
  poster: string | null;
  track: ScarcePlayableMedia;
  blob: Blob;
}): Promise<void> {
  const meta = playableToOfflineMeta(opts.track);
  if (!meta) {
    throw new Error('Could not keep this offline.');
  }
  await cacheTrackBlob(meta.cid, meta.mime || opts.blob.type || opts.track.mime, opts.blob);
  const index = await readIndex();
  const merged = mergeTrackIntoManifest(
    index.albums[opts.collectionId] ?? null,
    {
      collectionId: opts.collectionId,
      title: opts.title,
      poster: opts.poster,
    },
    meta
  );
  index.tracks[meta.cid] = { mime: meta.mime };
  index.albums[opts.collectionId] = merged;
  await writeIndex(index);
}

export async function removeTrack(cid: string): Promise<void> {
  if (!cid) return;
  try {
    const dir = await tracksDir();
    await dir.removeEntry(cid);
  } catch {
    // already gone
  }
  const index = await readIndex();
  delete index.tracks[cid];
  for (const album of Object.values(index.albums)) {
    album.tracks = album.tracks.filter((track) => track.cid !== cid);
  }
  await writeIndex(index);
}

export async function removeAlbumTracks(cids: readonly string[]): Promise<void> {
  for (const cid of cids) {
    await removeTrack(cid);
  }
}

export async function listOfflineAlbums(): Promise<OfflineAlbumManifest[]> {
  if (!isOfflineCacheSupported()) return [];
  const index = await readIndex();
  return Object.values(index.albums)
    .filter((album) => album.tracks.length > 0)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getOfflineAlbum(
  collectionId: string
): Promise<OfflineAlbumManifest | null> {
  const id = collectionId.trim();
  if (!id || !isOfflineCacheSupported()) return null;
  const index = await readIndex();
  const album = index.albums[id];
  return album && album.tracks.length > 0 ? album : null;
}

export function playablesFromOfflineAlbum(
  album: OfflineAlbumManifest
): ScarcePlayableMedia[] {
  return album.tracks.map((track) => ({
    url: track.url,
    mime: track.mime,
    cid: track.cid,
    ...(track.title ? { title: track.title } : {}),
    ...(track.lyrics ? { lyrics: track.lyrics } : {}),
  }));
}

export function offlineAlbumToHoldingPeek(
  album: OfflineAlbumManifest
): PortfolioHoldingPeek {
  return {
    tokenId: `offline:${album.collectionId}`,
    title: album.title,
    mediaUrl: album.poster,
    collectionId: album.collectionId,
    // Offline manifests omit facets/audioFormat; genre/format filters hide them.
    mediumKind: 'audio',
    href: collectiblesPlayPath(album.collectionId),
    actionLabel: 'Play',
    kindLabel: 'Downloaded',
  };
}

export async function blobUrlForTrack(cid: string): Promise<string | null> {
  if (!cid || !isOfflineCacheSupported()) return null;
  try {
    const dir = await tracksDir();
    const handle = await dir.getFileHandle(cid);
    const file = await handle.getFile();
    const index = await readIndex();
    const mime = index.tracks[cid]?.mime;
    const blob = mime && file.type !== mime ? new Blob([file], { type: mime }) : file;
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

export async function resolvePlayableSrc(
  track: Pick<ScarcePlayableMedia, 'cid' | 'url' | 'mime'>
): Promise<string> {
  const cid = trackCidFromPlayable(track);
  if (!cid) return track.url;
  return (await blobUrlForTrack(cid)) ?? track.url;
}

export function persistNowPlayingSession(
  session: PersistedNowPlayingSession
): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      NOW_PLAYING_STORAGE_KEY,
      JSON.stringify(session)
    );
  } catch {
    // quota / private mode
  }
}

export function readPersistedNowPlayingSession(): PersistedNowPlayingSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(NOW_PLAYING_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedNowPlayingSession;
    if (!parsed?.collectionId || !Array.isArray(parsed.tracks)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearPersistedNowPlayingSession(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(NOW_PLAYING_STORAGE_KEY);
  } catch {
    // ignore
  }
}
