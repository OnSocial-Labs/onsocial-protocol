import type { ProfileAboutAlign } from '@onsocial/sdk';
import type { ComposerDropDraft } from '@/features/guilds/guild-composer-sheet';
import {
  composerBeatHasContent,
  emptyComposerBeat,
  type ComposerBeat,
} from '@/lib/composer-thread';
import { writeDockDraftKey } from '@/lib/os-write-dock';

export const COMPOSER_NEW_POST_DRAFT_ID = 'new';

export function composerNewPostDraftKey(scope = 'personal'): string {
  return writeDockDraftKey('post', `${COMPOSER_NEW_POST_DRAFT_ID}:${scope}`);
}

type StoredComposerBeat = {
  text: string;
  pollEnabled: boolean;
  pollOptions: string[];
  pollDurationMs?: number;
  drop: ComposerDropDraft | null;
  contentWarning: string;
  nsfw: boolean;
  placeDraft: string;
  placeOpen: boolean;
  articleMode: boolean;
  articleTitle: string;
  articleAlign: ProfileAboutAlign;
};

const memoryFiles = new Map<string, File[][]>();
const storedBeats = new Map<string, StoredComposerBeat[]>();

export const COMPOSER_THREAD_DRAFT_STORAGE_PREFIX = 'os-compose-thread:';

function storageKey(key: string): string {
  return `${COMPOSER_THREAD_DRAFT_STORAGE_PREFIX}${key}`;
}

function toStored(beat: ComposerBeat): StoredComposerBeat {
  return {
    text: beat.text,
    pollEnabled: beat.pollEnabled,
    pollOptions: [...beat.pollOptions],
    ...(beat.pollDurationMs != null
      ? { pollDurationMs: beat.pollDurationMs }
      : {}),
    drop: beat.drop,
    contentWarning: beat.contentWarning,
    nsfw: beat.nsfw,
    placeDraft: beat.placeDraft,
    placeOpen: beat.placeOpen,
    articleMode: beat.articleMode,
    articleTitle: beat.articleTitle,
    articleAlign: beat.articleAlign,
  };
}

function fromStored(stored: StoredComposerBeat, files: File[]): ComposerBeat {
  return {
    ...emptyComposerBeat(),
    ...stored,
    pollOptions: [...stored.pollOptions],
    files: [...files],
  };
}

export function composerThreadDraftIsDirty(
  beats: readonly ComposerBeat[]
): boolean {
  return beats.some(composerBeatHasContent);
}

function readStored(key: string): StoredComposerBeat[] {
  if (!key) return [];
  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(storageKey(key));
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) return parsed as StoredComposerBeat[];
      }
    } catch {
      // fall through
    }
  }
  return storedBeats.get(key) ?? [];
}

function writeStored(key: string, beats: StoredComposerBeat[]) {
  if (!key) return;
  if (beats.length === 0) {
    storedBeats.delete(key);
  } else {
    storedBeats.set(key, beats);
  }
  if (typeof window === 'undefined') return;
  try {
    const itemKey = storageKey(key);
    if (beats.length === 0) {
      window.localStorage.removeItem(itemKey);
      return;
    }
    window.localStorage.setItem(itemKey, JSON.stringify(beats));
  } catch {
    // Private mode / quota — process map still holds the draft.
  }
}

export function readComposerThreadDraft(key: string): ComposerBeat[] {
  if (!key) return [];
  const stored = readStored(key);
  if (stored.length === 0) return [];
  const files = memoryFiles.get(key) ?? [];
  return stored.map((beat, index) => fromStored(beat, files[index] ?? []));
}

export function writeComposerThreadDraft(
  key: string,
  beats: readonly ComposerBeat[]
): void {
  if (!key) return;
  const persist = beats.filter(composerBeatHasContent);
  if (persist.length === 0) {
    clearComposerThreadDraft(key);
    return;
  }
  memoryFiles.set(
    key,
    persist.map((beat) => [...beat.files])
  );
  writeStored(key, persist.map(toStored));
}

export function clearComposerThreadDraft(key: string): void {
  if (!key) return;
  memoryFiles.delete(key);
  writeStored(key, []);
}

/** Drop in-memory files only — simulates a reload. Storage stays. */
export function dropComposerThreadDraftMemory(key: string): void {
  if (!key) return;
  memoryFiles.delete(key);
}
