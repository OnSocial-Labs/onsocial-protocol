export type WriteDockDraft = {
  text: string;
  files: File[];
};

export const WRITE_DOCK_DRAFT_STORAGE_PREFIX = 'os-write-dock:';

const drafts = new Map<string, WriteDockDraft>();
/** Text only — survives memory drop when localStorage is missing (tests / private). */
const storedTexts = new Map<string, string>();

export function emptyWriteDockDraft(): WriteDockDraft {
  return { text: '', files: [] };
}

export function writeDockDraftIsDirty(draft: WriteDockDraft): boolean {
  return Boolean(draft.text.trim() || draft.files.length > 0);
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
  return { text: stored, files: [] };
}

export function writeWriteDockDraft(key: string, draft: WriteDockDraft): void {
  if (!key) return;
  const normalized: WriteDockDraft = {
    text: draft.text,
    files: draft.files,
  };
  if (!writeDockDraftIsDirty(normalized)) {
    drafts.delete(key);
    writeStoredText(key, '');
    return;
  }
  drafts.set(key, normalized);
  writeStoredText(key, normalized.text);
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
    initialFiles: [...draft.files],
  };
}

export function writeDockDraftFromComposer(payload: {
  text: string;
  files: File[];
}): WriteDockDraft {
  return { text: payload.text, files: [...payload.files] };
}

/** Live dock payload wins for media; draft fills text when the field is empty. */
export function writeDockExpandSeed(
  key: string,
  payload: { text: string; files: File[] }
): { initialText: string; initialFiles: File[] } {
  const draft = readWriteDockDraft(key);
  const files =
    payload.files.length > 0
      ? [...payload.files]
      : draft.files.length > 0
        ? [...draft.files]
        : [];
  const text = payload.text.trim() ? payload.text : draft.text;
  return { initialText: text, initialFiles: files };
}
