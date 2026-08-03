/**
 * Writing drops — Article / Book manuscripts pinned as Markdown chapters
 * plus an `onsocial.writing.v1` manifesto CID in metadata.extra.
 */

export const DROP_WRITING_MAX_BYTES = 500 * 1024;
/** Comfortably supports long-form books; manifesto lives on IPFS, not in token extra. */
export const DROP_WRITING_MAX_CHAPTERS = 100;

export const WRITING_MANIFEST_FORMAT = 'onsocial.writing.v1' as const;

const DROP_WRITING_MIMES = new Set([
  'text/markdown',
  'text/x-markdown',
  'text/plain',
]);

export type WritingReleaseFormat = 'article' | 'book';

export interface ScarceReadableRef {
  cid: string;
  mime: string;
  title?: string;
}

/** Resolved chapter for drop / reader UI (same-origin content URL). */
export interface ScarceReadableMedia {
  url: string;
  mime: string;
  title?: string;
  /** Raw IPFS CID when known (manifest / legacy). */
  cid?: string;
}

export interface WritingManifestV1 {
  format: typeof WRITING_MANIFEST_FORMAT;
  title?: string;
  chapters: ScarceReadableRef[];
}

const CID_RE =
  /^(bafy[a-z0-9]{20,}|Qm[1-9A-HJ-NP-Za-km-z]{44,})$/i;

export function isLikelyIpfsCid(value: string): boolean {
  return CID_RE.test(value.trim());
}

/** Same-origin proxy so the reader can fetch Markdown without CDN CORS issues. */
export function writingContentUrl(cid: string): string | null {
  const trimmed = cid.trim().replace(/^ipfs:\/\//, '');
  if (!trimmed || !isLikelyIpfsCid(trimmed.split('/')[0] ?? '')) {
    return null;
  }
  return `/api/ipfs/${encodeURIComponent(trimmed)}`;
}

export function isDropWritingMime(mime: string, fileName?: string): boolean {
  const normalized = mime.toLowerCase().trim();
  if (DROP_WRITING_MIMES.has(normalized)) return true;
  if (normalized === 'application/octet-stream' || !normalized) {
    return Boolean(fileName && /\.(md|markdown|txt)$/i.test(fileName));
  }
  return false;
}

/** "01-the-road.md" → "The road" */
export function chapterTitleFromFile(file: File): string {
  const base = file.name
    .replace(/\.(md|markdown|txt)$/i, '')
    .replace(/^\d+[-_.\s]+/, '')
    .replace(/[-_]+/g, ' ')
    .trim();
  if (!base) return 'Chapter';
  return base.charAt(0).toUpperCase() + base.slice(1);
}

export function writingChaptersValid(
  format: WritingReleaseFormat,
  count: number
): boolean {
  if (format === 'article') return count === 1;
  return count >= 2 && count <= DROP_WRITING_MAX_CHAPTERS;
}

export function parseWritingFormat(
  raw: unknown
): WritingReleaseFormat | null {
  if (typeof raw !== 'string') return null;
  const key = raw.trim().toLowerCase();
  if (key === 'article' || key === 'book') return key;
  return null;
}

export function buildWritingManifest(opts: {
  title?: string;
  chapters: ScarceReadableRef[];
}): WritingManifestV1 {
  return {
    format: WRITING_MANIFEST_FORMAT,
    ...(opts.title?.trim() ? { title: opts.title.trim() } : {}),
    chapters: opts.chapters.map((chapter) => ({
      cid: chapter.cid.trim(),
      mime: chapter.mime.trim() || 'text/markdown',
      ...(chapter.title?.trim() ? { title: chapter.title.trim() } : {}),
    })),
  };
}

export function parseWritingManifest(
  raw: unknown
): WritingManifestV1 | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  if (record.format !== WRITING_MANIFEST_FORMAT) return null;
  if (!Array.isArray(record.chapters)) return null;
  const chapters: ScarceReadableRef[] = [];
  for (const entry of record.chapters) {
    if (chapters.length >= DROP_WRITING_MAX_CHAPTERS) break;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const row = entry as Record<string, unknown>;
    const cid = typeof row.cid === 'string' ? row.cid.trim() : '';
    const mime = typeof row.mime === 'string' ? row.mime.trim() : '';
    if (!cid || !mime || !isLikelyIpfsCid(cid)) continue;
    const title =
      typeof row.title === 'string' && row.title.trim()
        ? row.title.trim()
        : undefined;
    chapters.push({ cid, mime, ...(title ? { title } : {}) });
  }
  if (chapters.length === 0) return null;
  const title =
    typeof record.title === 'string' && record.title.trim()
      ? record.title.trim()
      : undefined;
  return {
    format: WRITING_MANIFEST_FORMAT,
    ...(title ? { title } : {}),
    chapters,
  };
}

export function readablesFromManifest(
  manifest: WritingManifestV1
): ScarceReadableMedia[] {
  const out: ScarceReadableMedia[] = [];
  for (const chapter of manifest.chapters) {
    const url = writingContentUrl(chapter.cid);
    if (!url) continue;
    out.push({
      url,
      mime: chapter.mime,
      cid: chapter.cid,
      ...(chapter.title ? { title: chapter.title } : {}),
    });
  }
  return out;
}

export function writingLastChapterStorageKey(
  collectionId: string,
  accountId: string
): string {
  return `onsocial.writing.chapter:${collectionId.trim()}:${accountId.trim().toLowerCase()}`;
}
