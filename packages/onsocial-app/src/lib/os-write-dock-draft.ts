export type WriteDockDraft = {
  text: string;
  file: File | null;
};

const drafts = new Map<string, WriteDockDraft>();

export function emptyWriteDockDraft(): WriteDockDraft {
  return { text: '', file: null };
}

export function writeDockDraftIsDirty(draft: WriteDockDraft): boolean {
  return Boolean(draft.text.trim() || draft.file);
}

export function readWriteDockDraft(key: string): WriteDockDraft {
  if (!key) return emptyWriteDockDraft();
  return drafts.get(key) ?? emptyWriteDockDraft();
}

export function writeWriteDockDraft(key: string, draft: WriteDockDraft): void {
  if (!key) return;
  if (!writeDockDraftIsDirty(draft)) {
    drafts.delete(key);
    return;
  }
  drafts.set(key, { text: draft.text, file: draft.file });
}

export function clearWriteDockDraft(key: string): void {
  if (!key) return;
  drafts.delete(key);
}
