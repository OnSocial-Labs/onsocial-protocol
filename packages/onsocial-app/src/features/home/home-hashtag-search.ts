/** Normalize typed search into a hashtag slug (no `#`). */
export function normalizeHashtagQuery(raw: string): string {
  return raw.trim().toLowerCase().replace(/^#+/, '');
}

const HASHTAG_SLUG_RE = /^[a-z0-9_]{1,64}$/;
/** Matches `#NEAR`, `#gm_1` in free text (schema: lowercase a-z0-9_). */
const HASHTAG_IN_TEXT_RE = /#([a-zA-Z0-9_]{1,64})\b/g;

export function isValidHashtagSlug(slug: string): boolean {
  return HASHTAG_SLUG_RE.test(slug);
}

export type HashtagTextSegment =
  | { type: 'text'; value: string }
  | { type: 'hashtag'; value: string };

/** Segment body text for composer/feed highlighting (same rules as extract). */
export function splitTextWithHashtags(text: string): HashtagTextSegment[] {
  if (!text) return [{ type: 'text', value: '' }];
  const segments: HashtagTextSegment[] = [];
  HASHTAG_IN_TEXT_RE.lastIndex = 0;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = HASHTAG_IN_TEXT_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({
        type: 'text',
        value: text.slice(lastIndex, match.index),
      });
    }
    segments.push({ type: 'hashtag', value: match[0]! });
    lastIndex = match.index + match[0]!.length;
  }
  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) });
  }
  return segments.length > 0 ? segments : [{ type: 'text', value: text }];
}

/**
 * Pull unique lowercase hashtags from post body text for indexed `hashtags[]`.
 * Bare `#NEAR` in text becomes `near` — required for search/indexing.
 */
export function extractHashtagsFromText(text: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  HASHTAG_IN_TEXT_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = HASHTAG_IN_TEXT_RE.exec(text)) !== null) {
    const slug = match[1]!.toLowerCase();
    if (!isValidHashtagSlug(slug) || seen.has(slug)) continue;
    seen.add(slug);
    found.push(slug);
  }
  return found;
}

/** Commit on Enter only when the draft is a full valid tag. */
export function parseHashtagCommit(raw: string): string | null {
  const slug = normalizeHashtagQuery(raw);
  if (!slug || !isValidHashtagSlug(slug)) return null;
  return slug;
}

export function homeHashtagSubtitle(tag: string): string {
  return `Posts tagged #${tag}.`;
}

export function homeHashtagEmptyCopy(tag: string): string {
  return `No posts tagged #${tag} yet.`;
}
