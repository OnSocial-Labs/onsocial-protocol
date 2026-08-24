import type { PublicPageConfig } from '@/lib/page-data';

/** Max length for a Launch link note. */
export const PAGE_LINK_NOTE_MAX = 60;

export function sanitizeLinkNotes(
  notes: PublicPageConfig['linkNotes'] | undefined
): Record<string, string> {
  if (!notes || typeof notes !== 'object') {
    return {};
  }
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(notes)) {
    const id = key.trim();
    if (!id || typeof value !== 'string') continue;
    const note = value.trim().slice(0, PAGE_LINK_NOTE_MAX);
    if (note) next[id] = note;
  }
  return next;
}

/** Drop titles for links that are no longer set. */
export function pruneLinkNotes(
  notes: PublicPageConfig['linkNotes'] | undefined,
  links: object
): Record<string, string> {
  const values = links as Record<string, unknown>;
  const sanitized = sanitizeLinkNotes(notes);
  const next: Record<string, string> = {};
  for (const [key, note] of Object.entries(sanitized)) {
    const value = values[key];
    if (typeof value !== 'string' || !value.trim()) continue;
    next[key] = note;
  }
  return next;
}

export function linkNotesEqual(
  a: PublicPageConfig['linkNotes'] | undefined,
  b: PublicPageConfig['linkNotes'] | undefined
): boolean {
  const left = sanitizeLinkNotes(a);
  const right = sanitizeLinkNotes(b);
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    if (left[key] !== right[key]) return false;
  }
  return true;
}
