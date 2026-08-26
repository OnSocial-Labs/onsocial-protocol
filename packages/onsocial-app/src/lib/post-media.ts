import type { MediaRef } from '@onsocial/sdk';
import {
  POST_QUOTE_PREVIEW_CHARS,
  truncatePostPreview,
} from '@/lib/post-display';
import { resolveProfileMediaUrl } from '@/lib/profile-display';

export const POST_VIDEO_MAX_SECONDS = 120;
/** Inbound size before gateway encode (encoded pin ≤ 50 MB). */
export const POST_VIDEO_MAX_BYTES = 200 * 1024 * 1024;
export const POST_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const POST_MEDIA_MAX_FILES = 4;

const POST_IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/** QuickTime/HEVC from phones is accepted; gateway re-encodes to H.264 MP4. */
const POST_VIDEO_MIMES = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
]);

export interface PostMediaItem {
  url: string;
  mime: string;
  cid?: string;
  alt?: string;
}

export function isPostImageMime(mime: string): boolean {
  return POST_IMAGE_MIMES.has(mime.toLowerCase());
}

export function isPostVideoMime(mime: string): boolean {
  return POST_VIDEO_MIMES.has(mime.toLowerCase());
}

/** Render-time video check — accept any video/* from stored media refs. */
export function isRenderablePostVideoMime(mime: string): boolean {
  return mime.toLowerCase().startsWith('video/');
}

/** Render-time audio check — accept any audio/* from stored media refs. */
export function isRenderablePostAudioMime(mime: string): boolean {
  return mime.toLowerCase().startsWith('audio/');
}

/** Video or audio — never the NEP-177 still cover. */
export function isRenderablePostPlayableMime(mime: string): boolean {
  return isRenderablePostVideoMime(mime) || isRenderablePostAudioMime(mime);
}

/** Still frames only — never video or audio. */
export function postStillImages(
  items: readonly PostMediaItem[]
): PostMediaItem[] {
  return items.filter((item) => !isRenderablePostPlayableMime(item.mime));
}

/** Index into `postStillImages(items)` for a media-strip index, or `-1`. */
export function postStillImageIndex(
  items: readonly PostMediaItem[],
  mediaIndex: number
): number {
  const item = items[mediaIndex];
  if (!item || isRenderablePostPlayableMime(item.mime)) return -1;
  let stillIndex = -1;
  for (let i = 0; i <= mediaIndex; i += 1) {
    const entry = items[i];
    if (entry && !isRenderablePostPlayableMime(entry.mime)) stillIndex += 1;
  }
  return stillIndex;
}

export type FeedMediaActivate =
  | { kind: 'enlarge'; stillIndex: number }
  | { kind: 'thread'; unmute: boolean; mediaIndex: number }
  | { kind: 'none' };

/**
 * Feed tile tap: stills enlarge in place; video goes to the thread with sound.
 * Thread-focused media stays inline (`none`).
 */
export function resolveFeedMediaActivate(
  items: readonly PostMediaItem[],
  mediaIndex: number,
  options: { mediaFocused?: boolean } = {}
): FeedMediaActivate {
  if (options.mediaFocused) return { kind: 'none' };
  const item = items[mediaIndex];
  if (!item) return { kind: 'none' };
  if (isRenderablePostVideoMime(item.mime)) {
    return { kind: 'thread', unmute: true, mediaIndex };
  }
  const stillIndex = postStillImageIndex(items, mediaIndex);
  if (stillIndex >= 0) return { kind: 'enlarge', stillIndex };
  return { kind: 'thread', unmute: false, mediaIndex };
}

/** Step one still. Stops at the ends — never wraps. */
export function stepFeedPhotoIndex(
  current: number,
  last: number,
  delta: -1 | 1
): number {
  if (last < 0) return 0;
  return Math.min(last, Math.max(0, current + delta));
}

/** Format seconds as `0:12` / `1:05` for quote thumbs. */
export function formatMediaDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '';
  const total = Math.round(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/** Quote inset body copy — hard cap with ellipsis. */
export function truncateQuoteText(
  text: string,
  maxChars = POST_QUOTE_PREVIEW_CHARS
): string {
  return truncatePostPreview(text, maxChars);
}

export function isPostMediaMime(mime: string): boolean {
  return isPostImageMime(mime) || isPostVideoMime(mime);
}

/** Optimistic / write-path kind when attaching files. */
export function mediaKindFromFile(file: File): 'image' | 'video' | undefined {
  const mime = file.type.toLowerCase();
  if (isPostVideoMime(mime) || mime.startsWith('video/')) return 'video';
  if (isPostImageMime(mime) || mime.startsWith('image/')) return 'image';
  return undefined;
}

/**
 * When writing media, override inherited parent/room `kind` so SDK
 * `inferKind` does not keep `text` (etc.) over image/video.
 */
export function applyMediaKindOverride<T extends { kind?: string }>(
  meta: T,
  files: File[]
): T {
  if (files.length === 0) return meta;
  const kind = mediaKindFromFile(files[0]!);
  if (kind) return { ...meta, kind };
  const { kind: _drop, ...rest } = meta;
  return rest as T;
}

function asMediaRef(
  entry: unknown
): (MediaRef & { previewUrl?: string }) | null {
  if (typeof entry === 'string') {
    const trimmed = entry.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('ipfs://')) {
      return { cid: trimmed.slice('ipfs://'.length), mime: 'image/*' };
    }
    if (/^https?:\/\//i.test(trimmed)) {
      return { cid: trimmed, mime: 'image/*', previewUrl: trimmed };
    }
    return null;
  }
  if (!entry || typeof entry !== 'object') return null;
  const record = entry as Record<string, unknown>;
  const cid = typeof record.cid === 'string' ? record.cid.trim() : '';
  const mime =
    typeof record.mime === 'string' && record.mime.trim()
      ? record.mime.trim()
      : 'image/*';
  if (!cid && typeof record.previewUrl !== 'string') return null;
  return {
    cid: cid || 'preview',
    mime,
    ...(typeof record.size === 'number' ? { size: record.size } : {}),
    ...(typeof record.width === 'number' ? { width: record.width } : {}),
    ...(typeof record.height === 'number' ? { height: record.height } : {}),
    ...(typeof record.alt === 'string' ? { alt: record.alt } : {}),
    ...(typeof record.previewUrl === 'string'
      ? { previewUrl: record.previewUrl }
      : {}),
  };
}

function resolveMediaUrl(
  ref: MediaRef & { previewUrl?: string }
): string | null {
  if (ref.previewUrl?.trim()) return ref.previewUrl.trim();
  if (ref.cid.startsWith('http://') || ref.cid.startsWith('https://')) {
    return ref.cid;
  }
  return resolveProfileMediaUrl(`ipfs://${ref.cid}`);
}

/** Parse post body media for feed/detail rendering (images + video). */
export function parsePostMedia(
  value: string | null | undefined
): PostMediaItem[] {
  const trimmed = value?.trim();
  if (!trimmed) return [];

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return [];
  }

  const raw = Array.isArray(parsed.media) ? parsed.media : [];
  const items: PostMediaItem[] = [];
  for (const entry of raw) {
    const ref = asMediaRef(entry);
    if (!ref) continue;
    const url = resolveMediaUrl(ref);
    if (!url) continue;
    items.push({
      url,
      mime: ref.mime,
      cid: ref.cid === 'preview' ? undefined : ref.cid,
      alt: ref.alt,
    });
    if (items.length >= POST_MEDIA_MAX_FILES) break;
  }
  return items;
}

function readVideoDurationSeconds(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(video.duration) ? video.duration : 0);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read video metadata.'));
    };
    video.src = url;
  });
}

export async function validatePostMediaFile(
  file: File
): Promise<string | null> {
  const mime = file.type.toLowerCase();
  if (!isPostMediaMime(mime)) {
    return 'Use a JPG, PNG, WebP, MP4, WebM, or MOV file.';
  }
  if (isPostImageMime(mime)) {
    if (file.size > POST_IMAGE_MAX_BYTES) {
      return 'Photo must be 5 MB or smaller.';
    }
    return null;
  }
  if (file.size > POST_VIDEO_MAX_BYTES) {
    return `Video must be ${Math.round(POST_VIDEO_MAX_BYTES / (1024 * 1024))} MB or smaller.`;
  }
  try {
    const duration = await readVideoDurationSeconds(file);
    if (duration > POST_VIDEO_MAX_SECONDS + 0.25) {
      return `Video must be ${POST_VIDEO_MAX_SECONDS} seconds or shorter.`;
    }
  } catch {
    return 'Could not read that video file.';
  }
  return null;
}

/** Longest edge of a captured video frame — keeps the cover upload small. */
const POSTER_FRAME_MAX_EDGE = 1080;
const POSTER_FRAME_TIMEOUT_MS = 12_000;

export class PosterFrameError extends Error {
  constructor(message = 'Could not read a frame from that video.') {
    super(message);
    this.name = 'PosterFrameError';
  }
}

export interface CaptureVideoPosterOptions {
  /** Seek target in seconds. Defaults to a short sample into the clip. */
  atSeconds?: number;
  fileName?: string;
}

/**
 * Default seek when the creator has not scrubbed yet — frame zero is often
 * black, so sample slightly into the clip (capped at 1s).
 */
export function defaultPosterSeekSeconds(duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  return Math.min(duration / 2, 1);
}

/** Probe duration for the frame scrubber. Rejects on load / timeout errors. */
export async function probeVideoDuration(url: string): Promise<number> {
  const video = document.createElement('video');
  video.crossOrigin = 'anonymous';
  video.muted = true;
  video.playsInline = true;
  video.preload = 'metadata';
  video.src = url;
  try {
    return await new Promise<number>((resolve, reject) => {
      const timer = window.setTimeout(
        () => reject(new PosterFrameError()),
        POSTER_FRAME_TIMEOUT_MS
      );
      const settle = (run: () => void) => {
        window.clearTimeout(timer);
        run();
      };
      video.onerror = () => settle(() => reject(new PosterFrameError()));
      video.onloadedmetadata = () => {
        const duration = Number.isFinite(video.duration) ? video.duration : 0;
        settle(() => resolve(Math.max(0, duration)));
      };
    });
  } finally {
    video.onerror = null;
    video.onloadedmetadata = null;
    video.removeAttribute('src');
    video.load();
  }
}

/**
 * Grab a still from an already-loaded `<video>` element. Prefer this when
 * the creator is scrubbing an on-screen preview — no second network load.
 */
export async function captureVideoElementFrame(
  video: HTMLVideoElement,
  fileName = 'cover.jpg'
): Promise<File> {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) throw new PosterFrameError();
  const scale = Math.min(1, POSTER_FRAME_MAX_EDGE / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const context = canvas.getContext('2d');
  if (!context) throw new PosterFrameError();
  try {
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
  } catch {
    throw new PosterFrameError();
  }

  const blob = await new Promise<Blob | null>((resolve) => {
    try {
      canvas.toBlob(resolve, 'image/jpeg', 0.9);
    } catch {
      resolve(null);
    }
  });
  if (!blob) throw new PosterFrameError();
  return new File([blob], fileName, { type: 'image/jpeg' });
}

/**
 * Grab a still frame from a video URL as a JPEG file. Used as the NEP-177
 * cover for video posts — wallets only render still images, so a scarce
 * minted from a clip needs a frame (or a chosen photo) to show.
 *
 * Requires the media host to allow cross-origin reads; a tainted canvas
 * throws `PosterFrameError` so callers can fall back to a photo picker.
 */
export async function captureVideoPosterFrame(
  url: string,
  options: CaptureVideoPosterOptions | string = {}
): Promise<File> {
  // Legacy callers passed the file name as the second argument.
  const opts: CaptureVideoPosterOptions =
    typeof options === 'string' ? { fileName: options } : options;
  const fileName = opts.fileName ?? 'cover.jpg';

  const video = document.createElement('video');
  video.crossOrigin = 'anonymous';
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = url;

  try {
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(
        () => reject(new PosterFrameError()),
        POSTER_FRAME_TIMEOUT_MS
      );
      const settle = (run: () => void) => {
        window.clearTimeout(timer);
        run();
      };
      video.onerror = () => settle(() => reject(new PosterFrameError()));
      video.onseeked = () => settle(resolve);
      video.onloadeddata = () => {
        const duration = Number.isFinite(video.duration) ? video.duration : 0;
        const requested =
          typeof opts.atSeconds === 'number' && Number.isFinite(opts.atSeconds)
            ? opts.atSeconds
            : defaultPosterSeekSeconds(duration);
        const target =
          duration > 0
            ? Math.min(Math.max(0, requested), Math.max(0, duration - 0.05))
            : 0;
        if (target <= 0 && video.currentTime === 0) settle(resolve);
        else video.currentTime = target;
      };
    });

    return await captureVideoElementFrame(video, fileName);
  } finally {
    video.onerror = null;
    video.onseeked = null;
    video.onloadeddata = null;
    video.removeAttribute('src');
    video.load();
  }
}

/** Optimistic media entries with local blob preview URLs. */
export function buildOptimisticMediaEntries(
  files: File[]
): Array<MediaRef & { previewUrl: string }> {
  return files.slice(0, POST_MEDIA_MAX_FILES).map((file) => ({
    cid: 'preview',
    mime: file.type || 'application/octet-stream',
    size: file.size,
    previewUrl: URL.createObjectURL(file),
  }));
}

/** Revoke blob: preview URLs embedded in an optimistic post body. */
export function revokeOptimisticMediaPreviewUrls(
  value: string | null | undefined
): void {
  const trimmed = value?.trim();
  if (!trimmed) return;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return;
  }
  const raw = Array.isArray(parsed.media) ? parsed.media : [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const previewUrl = (entry as { previewUrl?: unknown }).previewUrl;
    if (typeof previewUrl !== 'string' || !previewUrl.startsWith('blob:')) {
      continue;
    }
    URL.revokeObjectURL(previewUrl);
  }
}

/**
 * Revoke preview blobs for rows present in `previous` but not in `next`
 * (optimistic rows dropped after indexer catch-up or feed refresh).
 */
export function revokeDroppedOptimisticMedia(
  previous: Array<{ accountId: string; postId: string; value: string }>,
  next: Array<{ accountId: string; postId: string }>
): void {
  const nextKeys = new Set(next.map((row) => `${row.accountId}:${row.postId}`));
  for (const row of previous) {
    if (nextKeys.has(`${row.accountId}:${row.postId}`)) continue;
    revokeOptimisticMediaPreviewUrls(row.value);
  }
}

/** Class names for feed collage vs thread one-by-one carousel. */
export function postMediaStripClassName(options: {
  count: number;
  focused?: boolean;
  page?: boolean;
  quote?: boolean;
}): string {
  const count = Math.min(Math.max(options.count, 1), POST_MEDIA_MAX_FILES);
  const multi = count > 1;
  const carousel = multi && Boolean(options.focused || options.page);
  return [
    'post-media-strip',
    `post-media-strip--${count}`,
    multi && !carousel ? 'is-collage' : '',
    carousel ? 'is-carousel' : '',
    options.quote ? 'is-quote' : '',
    options.focused ? 'is-focused' : '',
    options.page ? 'is-page' : '',
  ]
    .filter(Boolean)
    .join(' ');
}

/** Open thread focused on a media tile (`?mi=`). */
export function appendPostMediaIndex(href: string, mediaIndex = 0): string {
  if (!Number.isFinite(mediaIndex) || mediaIndex <= 0) return href;
  const separator = href.includes('?') ? '&' : '?';
  return `${href}${separator}mi=${Math.floor(mediaIndex)}`;
}

/** Append `?media=unmute` (+ optional tile index) for list → thread video. */
export function appendPostMediaUnmute(href: string, mediaIndex = 0): string {
  const separator = href.includes('?') ? '&' : '?';
  let next = `${href}${separator}media=unmute`;
  if (Number.isFinite(mediaIndex) && mediaIndex > 0) {
    next += `&mi=${Math.floor(mediaIndex)}`;
  }
  return next;
}

export function readPostMediaUnmuteIndex(searchParams: {
  get(name: string): string | null;
}): number {
  const raw = searchParams.get('mi');
  if (!raw) return 0;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.min(parsed, POST_MEDIA_MAX_FILES - 1);
}
