export type WriteDockDraft = {
  text: string;
  file: File | null;
};

export const WRITE_DOCK_DRAFT_STORAGE_PREFIX = 'os-write-dock:';

const drafts = new Map<string, WriteDockDraft>();
/** Text only — survives memory drop when localStorage is missing (tests / private). */
const storedTexts = new Map<string, string>();

export function emptyWriteDockDraft(): WriteDockDraft {
  return { text: '', file: null };
}

export function writeDockDraftIsDirty(draft: WriteDockDraft): boolean {
  return Boolean(draft.text.trim() || draft.file);
}

export function writeDockDraftStorageKey(key: string): string {
  return `${WRITE_DOCK_DRAFT_STORAGE_PREFIX}${key}`;
}

function readStoredText(key: string): string {
  if (!key) return '';
  if (typeof window !== 'undefined') {
    try {
      const stored = window.localStorage.getItem(writeDockDraftStorageKey(key));
      if (stored != null) return stored;
    } catch {
      // fall through to the process map
    }
  }
  return storedTexts.get(key) ?? '';
}

function writeStoredText(key: string, text: string): void {
  if (!key) return;
  const trimmed = text.trim();
  if (!trimmed) {
    storedTexts.delete(key);
  } else {
    storedTexts.set(key, text);
  }
  if (typeof window === 'undefined') return;
  try {
    const storageKey = writeDockDraftStorageKey(key);
    if (!trimmed) {
      window.localStorage.removeItem(storageKey);
      return;
    }
    window.localStorage.setItem(storageKey, text);
  } catch {
    // Private mode / quota — process map still holds the line.
  }
}

export function readWriteDockDraft(key: string): WriteDockDraft {
  if (!key) return emptyWriteDockDraft();
  const memory = drafts.get(key);
  if (memory) return memory;
  const stored = readStoredText(key);
  if (!stored.trim()) return emptyWriteDockDraft();
  return { text: stored, file: null };
}

export function writeWriteDockDraft(key: string, draft: WriteDockDraft): void {
  if (!key) return;
  if (!writeDockDraftIsDirty(draft)) {
    drafts.delete(key);
    writeStoredText(key, '');
    return;
  }
  drafts.set(key, { text: draft.text, file: draft.file });
  writeStoredText(key, draft.text);
}

export function clearWriteDockDraft(key: string): void {
  if (!key) return;
  drafts.delete(key);
  writeStoredText(key, '');
}

/** Drop the in-memory row only — simulates a reload. Storage stays. */
export function dropWriteDockDraftMemory(key: string): void {
  if (!key) return;
  drafts.delete(key);
}

export function writeDockToComposerSeed(draft: WriteDockDraft): {
  initialText: string;
  initialFiles: File[];
} {
  return {
    initialText: draft.text,
    initialFiles: draft.file ? [draft.file] : [],
  };
}

export function writeDockDraftFromComposer(payload: {
  text: string;
  files: File[];
}): WriteDockDraft {
  return { text: payload.text, file: payload.files[0] ?? null };
}
