/**
 * Writing drops — Article / Book manuscripts pinned as Markdown chapters
 * (Article may also use a single PDF). Books may attach one optional
 * whole-book PDF for holder download (`bookPdf` on the manifesto — not a TOC chapter).
 * Manifesto format: `onsocial.writing.v1` (CID in metadata.extra).
 */

/** Markdown / plain text chapter cap. */
export const DROP_WRITING_MAX_BYTES = 500 * 1024;
/** PDF chapters / whole-book PDF (same ballpark as audio tracks). */
export const DROP_WRITING_PDF_MAX_BYTES = 20 * 1024 * 1024;
/** Comfortably supports long-form books; manifesto lives on IPFS, not in token extra. */
export const DROP_WRITING_MAX_CHAPTERS = 100;

export const WRITING_MANIFEST_FORMAT = 'onsocial.writing.v1' as const;

const DROP_WRITING_MIMES = new Set([
  'text/markdown',
  'text/x-markdown',
  'text/plain',
  'application/pdf',
]);

const DROP_WRITING_CHAPTER_TEXT_MIMES = new Set([
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
  /** Optional whole-book PDF for holder download — not a TOC chapter. */
  bookPdf?: ScarceReadableRef;
}

/** CIDv0 (`Qm…`) and CIDv1 base32 (`bafy…` unixfs, `bafk…` raw audio/pdf). */
const CID_RE =
  /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|baf[a-z0-9]{20,})$/i;

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
    return Boolean(fileName && /\.(md|markdown|txt|pdf)$/i.test(fileName));
  }
  return false;
}

/**
 * Chapter files for the reader TOC.
 * Book chapters are Markdown / plain text only; Article still allows a single PDF.
 */
export function isDropWritingChapterMime(
  mime: string,
  fileName: string | undefined,
  format: WritingReleaseFormat
): boolean {
  if (format === 'book') {
    const normalized = mime.toLowerCase().trim();
    if (DROP_WRITING_CHAPTER_TEXT_MIMES.has(normalized)) return true;
    if (normalized === 'application/octet-stream' || !normalized) {
      return Boolean(fileName && /\.(md|markdown|txt)$/i.test(fileName));
    }
    return false;
  }
  return isDropWritingMime(mime, fileName);
}

export function isWritingPdfMime(mime: string, fileName?: string): boolean {
  const normalized = mime.toLowerCase().trim();
  if (normalized === 'application/pdf') return true;
  return Boolean(fileName && /\.pdf$/i.test(fileName));
}

/** Per-file size cap — PDFs get the larger budget. */
export function dropWritingMaxBytes(file: File): number {
  return isWritingPdfMime(file.type, file.name)
    ? DROP_WRITING_PDF_MAX_BYTES
    : DROP_WRITING_MAX_BYTES;
}

export function writingMimeForFile(file: File): string {
  const type = file.type.trim().toLowerCase();
  if (type && DROP_WRITING_MIMES.has(type)) return type;
  if (/\.pdf$/i.test(file.name)) return 'application/pdf';
  if (/\.txt$/i.test(file.name)) return 'text/plain';
  return type || 'text/markdown';
}

/** "01-the-road.md" → "The road" */
export function chapterTitleFromFile(file: File): string {
  const base = file.name
    .replace(/\.(md|markdown|txt|pdf)$/i, '')
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

function parseReadableRef(raw: unknown): ScarceReadableRef | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const cid = typeof row.cid === 'string' ? row.cid.trim() : '';
  const mime = typeof row.mime === 'string' ? row.mime.trim() : '';
  if (!cid || !mime || !isLikelyIpfsCid(cid)) return null;
  const title =
    typeof row.title === 'string' && row.title.trim()
      ? row.title.trim()
      : undefined;
  return { cid, mime, ...(title ? { title } : {}) };
}

export function buildWritingManifest(opts: {
  title?: string;
  chapters: ScarceReadableRef[];
  bookPdf?: ScarceReadableRef;
}): WritingManifestV1 {
  const bookPdf =
    opts.bookPdf && isWritingPdfMime(opts.bookPdf.mime)
      ? {
          cid: opts.bookPdf.cid.trim(),
          mime: 'application/pdf',
          ...(opts.bookPdf.title?.trim()
            ? { title: opts.bookPdf.title.trim() }
            : {}),
        }
      : undefined;
  return {
    format: WRITING_MANIFEST_FORMAT,
    ...(opts.title?.trim() ? { title: opts.title.trim() } : {}),
    chapters: opts.chapters.map((chapter) => ({
      cid: chapter.cid.trim(),
      mime: chapter.mime.trim() || 'text/markdown',
      ...(chapter.title?.trim() ? { title: chapter.title.trim() } : {}),
    })),
    ...(bookPdf ? { bookPdf } : {}),
  };
}

/**
 * Pair `uploadMany` results with the same-index chapter files.
 * Create UI order is `chapterFiles` top→bottom; that order is what pins
 * into the manifesto (and what holders read).
 */
export function chaptersFromPinnedFiles(
  files: File[],
  uploaded: ReadonlyArray<{ cid: string }>
): ScarceReadableRef[] {
  const count = Math.min(files.length, uploaded.length);
  const chapters: ScarceReadableRef[] = [];
  for (let index = 0; index < count; index++) {
    const file = files[index]!;
    const ref = uploaded[index]!;
    const cid = ref.cid.trim();
    if (!cid) continue;
    const title = chapterTitleFromFile(file);
    chapters.push({
      cid,
      mime: writingMimeForFile(file),
      ...(title ? { title } : {}),
    });
  }
  return chapters;
}

/** Whole-book PDF from a single pin result (not a TOC chapter). */
export function bookPdfRefFromPinnedFile(
  file: File,
  uploaded: { cid: string }
): ScarceReadableRef | null {
  const cid = uploaded.cid.trim();
  if (!cid || !isWritingPdfMime(file.type, file.name)) return null;
  const title = chapterTitleFromFile(file);
  return {
    cid,
    mime: 'application/pdf',
    ...(title ? { title } : {}),
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
    const ref = parseReadableRef(entry);
    if (!ref) continue;
    chapters.push(ref);
  }
  if (chapters.length === 0) return null;
  const title =
    typeof record.title === 'string' && record.title.trim()
      ? record.title.trim()
      : undefined;

  let bookPdf: ScarceReadableRef | undefined;
  if (record.bookPdf != null) {
    const ref = parseReadableRef(record.bookPdf);
    if (ref && isWritingPdfMime(ref.mime)) {
      bookPdf = { ...ref, mime: 'application/pdf' };
    }
  }

  return {
    format: WRITING_MANIFEST_FORMAT,
    ...(title ? { title } : {}),
    chapters,
    ...(bookPdf ? { bookPdf } : {}),
  };
}

export function readableFromRef(
  ref: ScarceReadableRef
): ScarceReadableMedia | null {
  const url = writingContentUrl(ref.cid);
  if (!url) return null;
  return {
    url,
    mime: ref.mime,
    cid: ref.cid,
    ...(ref.title ? { title: ref.title } : {}),
  };
}

/** Chapters only — never includes `bookPdf`. */
export function readablesFromManifest(
  manifest: WritingManifestV1
): ScarceReadableMedia[] {
  const out: ScarceReadableMedia[] = [];
  for (const chapter of manifest.chapters) {
    const media = readableFromRef(chapter);
    if (media) out.push(media);
  }
  return out;
}

export function bookPdfFromManifest(
  manifest: WritingManifestV1
): ScarceReadableMedia | null {
  if (!manifest.bookPdf) return null;
  if (!isWritingPdfMime(manifest.bookPdf.mime)) return null;
  return readableFromRef(manifest.bookPdf);
}

export function writingLastChapterStorageKey(
  collectionId: string,
  accountId: string
): string {
  return `onsocial.writing.chapter:${collectionId.trim()}:${accountId.trim().toLowerCase()}`;
}

/** Scroll ratio (0–1) for a chapter body. */
export function writingScrollRatioStorageKey(
  collectionId: string,
  accountId: string,
  chapterIndex: number
): string {
  const index = Number.isSafeInteger(chapterIndex) && chapterIndex >= 0
    ? chapterIndex
    : 0;
  return `onsocial.writing.scroll:${collectionId.trim()}:${accountId.trim().toLowerCase()}:${index}`;
}

export function readWritingChapterIndex(
  collectionId: string,
  accountId: string | null | undefined
): number {
  if (!accountId?.trim() || typeof window === 'undefined') return 0;
  try {
    const raw = window.localStorage.getItem(
      writingLastChapterStorageKey(collectionId, accountId)
    );
    const n = Number.parseInt(raw ?? '', 10);
    return Number.isSafeInteger(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

export function writeWritingChapterIndex(
  collectionId: string,
  accountId: string | null | undefined,
  chapterIndex: number
): void {
  if (!accountId?.trim() || typeof window === 'undefined') return;
  if (!Number.isSafeInteger(chapterIndex) || chapterIndex < 0) return;
  try {
    window.localStorage.setItem(
      writingLastChapterStorageKey(collectionId, accountId),
      String(chapterIndex)
    );
  } catch {
    // ignore
  }
}

export function readWritingScrollRatio(
  collectionId: string,
  accountId: string | null | undefined,
  chapterIndex: number
): number {
  if (!accountId?.trim() || typeof window === 'undefined') return 0;
  try {
    const raw = window.localStorage.getItem(
      writingScrollRatioStorageKey(collectionId, accountId, chapterIndex)
    );
    const r = Number.parseFloat(raw ?? '');
    return Number.isFinite(r) && r >= 0 && r <= 1 ? r : 0;
  } catch {
    return 0;
  }
}

export function writeWritingScrollRatio(
  collectionId: string,
  accountId: string | null | undefined,
  chapterIndex: number,
  scrollRatio: number
): void {
  if (!accountId?.trim() || typeof window === 'undefined') return;
  if (!Number.isFinite(scrollRatio)) return;
  const clamped = Math.min(1, Math.max(0, scrollRatio));
  try {
    window.localStorage.setItem(
      writingScrollRatioStorageKey(collectionId, accountId, chapterIndex),
      String(clamped)
    );
  } catch {
    // ignore
  }
}
