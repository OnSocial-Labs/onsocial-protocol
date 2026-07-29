/** Shared topic slug for hubs, guilds (and feed hashtag shape). */

export const TOPIC_MAX_LENGTH = 32;
export const TOPIC_MAX_PER_ENTITY = 2;
export const TOPIC_SLUG_RE = /^[a-z0-9_]{1,32}$/;

/** Normalize raw input into a topic slug (no `#`). Returns null if empty/invalid. */
export function normalizeTopicSlug(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const slug = raw
    .trim()
    .replace(/^#+/, '')
    .toLowerCase()
    .replace(/-/g, '_')
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, TOPIC_MAX_LENGTH);
  if (!slug || !TOPIC_SLUG_RE.test(slug)) return null;
  return slug;
}

/** Cap + dedupe topic list; first entry is primary. */
export function normalizeTopicList(
  raw: unknown,
  max: number = TOPIC_MAX_PER_ENTITY
): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    const slug = normalizeTopicSlug(item);
    if (!slug || out.includes(slug)) continue;
    out.push(slug);
    if (out.length >= max) break;
  }
  return out;
}

export function topicsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((topic, index) => topic === b[index]);
}

/** Display label — known suggestions stay title-case words; else prettify slug. */
export function topicLabel(
  slug: string | null | undefined,
  suggestions?: ReadonlyArray<{ id: string; label: string }>
): string | null {
  if (!slug) return null;
  const known = suggestions?.find((entry) => entry.id === slug);
  if (known) return known.label;
  return slug
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
