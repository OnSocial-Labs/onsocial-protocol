/**
 * Persist heavy-media pin results across refresh so creators don’t re-upload
 * after a successful prepare. Files themselves aren’t stored — CIDs are.
 * Drafts are scoped to account + template so a Writing pin can’t list as Art.
 */

export type DropPinDraftKind = 'music' | 'writing' | 'large-set' | 'generate-job';

export type PinnedMusicDraft = {
  playable: Array<{
    cid: string;
    mime: string;
    title?: string;
    lyrics?: string;
  }>;
  coverCid: string;
  coverHash: string;
};

export type PinnedWritingDraft = {
  writingManifestCid: string;
  writingFormat: 'issue' | 'book';
  chapterCount: number;
  coverCid: string;
  coverHash: string;
  /** Manifest includes a whole-book PDF companion. */
  hasBookPdf?: boolean;
};

export type PinnedLargeSetDraft = {
  cid: string;
  ext: string;
  /** Piece count at pin time — needed when local files are gone after refresh. */
  pieceCount: number;
};

type DropPinDraftBase = {
  accountId: string;
  fingerprint: string;
  savedAt: number;
  /** Template that owned this pin — restored on hydrate. */
  templateId: string;
};

export type DropPinDraft =
  | (DropPinDraftBase & {
      kind: 'music';
      musicFormat: 'single' | 'album';
      pinned: PinnedMusicDraft;
    })
  | (DropPinDraftBase & {
      kind: 'writing';
      writingFormat: 'issue' | 'book';
      pinned: PinnedWritingDraft;
    })
  | (DropPinDraftBase & {
      kind: 'large-set';
      pinned: PinnedLargeSetDraft;
    })
  | (DropPinDraftBase & {
      kind: 'generate-job';
      jobId: string;
    });

const STORAGE_KEY = 'onsocial.drop-pin-draft.v2';
/** Keep drafts long enough to survive “close and come back” the same day. */
export const DROP_PIN_DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

export function fileFingerprint(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

export function musicPinFingerprint(opts: {
  format: string;
  tracks: File[];
  lyrics: string[];
  cover: File;
}): string {
  return [
    'music',
    opts.format,
    opts.tracks.map(fileFingerprint).join('|'),
    opts.lyrics.map((line) => line.trim()).join('|'),
    fileFingerprint(opts.cover),
  ].join('::');
}

export function writingPinFingerprint(opts: {
  format: string;
  chapters: File[];
  cover: File;
  bookPdf?: File | null;
}): string {
  return [
    'writing',
    opts.format,
    opts.chapters.map(fileFingerprint).join('|'),
    fileFingerprint(opts.cover),
    ...(opts.bookPdf ? [fileFingerprint(opts.bookPdf)] : []),
  ].join('::');
}

export function largeSetPinFingerprint(files: File[]): string {
  return ['large-set', files.map(fileFingerprint).join('|')].join('::');
}

function readRaw(): DropPinDraft | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DropPinDraft> & {
      kind?: string;
      pinned?: unknown;
    };
    if (
      !parsed ||
      typeof parsed.accountId !== 'string' ||
      typeof parsed.fingerprint !== 'string' ||
      typeof parsed.savedAt !== 'number' ||
      typeof parsed.templateId !== 'string' ||
      parsed.kind !== 'music' &&
        parsed.kind !== 'writing' &&
        parsed.kind !== 'large-set' &&
        parsed.kind !== 'generate-job'
    ) {
      return null;
    }
    if (parsed.kind === 'generate-job') {
      return typeof (parsed as { jobId?: unknown }).jobId === 'string' &&
        (parsed as { jobId: string }).jobId.trim()
        ? (parsed as DropPinDraft)
        : null;
    }
    if (!parsed.pinned || typeof parsed.pinned !== 'object') {
      return null;
    }
    return parsed as DropPinDraft;
  } catch {
    return null;
  }
}

function writeRaw(draft: DropPinDraft | null): void {
  if (typeof window === 'undefined') return;
  try {
    // Drop legacy v1 keys so old cross-kind drafts can’t resurface.
    window.localStorage.removeItem('onsocial.drop-pin-draft.v1');
    if (!draft) {
      window.localStorage.removeItem(STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // Quota / private mode — pin still works in-session without resume.
  }
}

export function loadDropPinDraft(accountId: string): DropPinDraft | null {
  const draft = readRaw();
  if (!draft) return null;
  if (draft.accountId !== accountId) return null;
  if (Date.now() - draft.savedAt > DROP_PIN_DRAFT_TTL_MS) {
    writeRaw(null);
    return null;
  }
  return draft;
}

export function saveDropPinDraft(draft: DropPinDraft): void {
  writeRaw({ ...draft, savedAt: Date.now() });
}

export function clearDropPinDraft(): void {
  writeRaw(null);
}

export function clearDropPinDraftIfKind(
  accountId: string | null | undefined,
  kind: DropPinDraftKind
): void {
  if (!accountId) {
    clearDropPinDraft();
    return;
  }
  const draft = loadDropPinDraft(accountId);
  if (draft?.kind === kind) clearDropPinDraft();
}
