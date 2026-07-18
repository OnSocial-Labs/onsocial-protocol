// ---------------------------------------------------------------------------
// builders/rich-text — segment # / $ / @ / http(s) for bios and posts
// ---------------------------------------------------------------------------

const HASHTAG_IN_TEXT_RE = /#([a-zA-Z0-9_]{1,64})\b/g;
const TICKER_IN_TEXT_RE = /(?<![a-zA-Z0-9_])\$([a-zA-Z][a-zA-Z0-9_]{0,15})\b/g;
const MENTION_IN_TEXT_RE =
  /(?<![a-zA-Z0-9._-])@([a-zA-Z0-9][a-zA-Z0-9._-]{0,63})(?![a-zA-Z0-9._-])/g;
const URL_IN_TEXT_RE = /https?:\/\/[^\s<>"'`]+/gi;
const URL_TRAILING_PUNCT_RE = /[.,;:!?)\]}'"]+$/;

const HASHTAG_SLUG_RE = /^[a-z0-9_]{1,64}$/;
const TICKER_SLUG_RE = /^[a-z][a-z0-9_]{0,15}$/;
const NEAR_ACCOUNT_RE = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;

export type RichTextSegment =
  | { type: 'text'; value: string }
  | { type: 'hashtag'; value: string; slug: string }
  | { type: 'ticker'; value: string; slug: string }
  | { type: 'mention'; value: string; accountId: string }
  | { type: 'url'; value: string; href: string };

type MatchHit = {
  index: number;
  length: number;
  segment: Exclude<RichTextSegment, { type: 'text' }>;
};

function overlapsHit(hits: MatchHit[], index: number, length: number): boolean {
  const end = index + length;
  return hits.some((hit) => index < hit.index + hit.length && end > hit.index);
}

/** Peel prose punctuation stuck to the URL without eating a trailing slash. */
export function normalizeAutolinkUrl(raw: string): string | null {
  let value = raw.trim();
  while (value.length > 0 && URL_TRAILING_PUNCT_RE.test(value)) {
    value = value.replace(URL_TRAILING_PUNCT_RE, '');
  }
  if (!/^https?:\/\/.+/i.test(value)) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

/** Hostname label for autolink chips — `https://www.onsocial.id/` → `onsocial.id`. */
export function autolinkDisplayHost(href: string): string {
  try {
    const host = new URL(href).hostname.replace(/^www\./i, '');
    return host || href;
  } catch {
    return href;
  }
}

function isValidMentionAccountId(accountId: string): boolean {
  return (
    accountId.length >= 2 &&
    accountId.length <= 64 &&
    NEAR_ACCOUNT_RE.test(accountId)
  );
}

/**
 * Split free text into plain + protocol tokens (# / $ / @) and http(s) urls.
 * URLs win over overlapping hashtags (e.g. `https://x.com/#topics`).
 */
export function splitRichText(text: string): RichTextSegment[] {
  if (!text) return [{ type: 'text', value: '' }];

  const hits: MatchHit[] = [];

  URL_IN_TEXT_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = URL_IN_TEXT_RE.exec(text)) !== null) {
    const href = normalizeAutolinkUrl(match[0]!);
    if (!href) continue;
    hits.push({
      index: match.index,
      length: href.length,
      segment: { type: 'url', value: href, href },
    });
  }

  HASHTAG_IN_TEXT_RE.lastIndex = 0;
  while ((match = HASHTAG_IN_TEXT_RE.exec(text)) !== null) {
    const slug = match[1]!.toLowerCase();
    if (!HASHTAG_SLUG_RE.test(slug)) continue;
    if (overlapsHit(hits, match.index, match[0]!.length)) continue;
    hits.push({
      index: match.index,
      length: match[0]!.length,
      segment: { type: 'hashtag', value: match[0]!, slug },
    });
  }

  TICKER_IN_TEXT_RE.lastIndex = 0;
  while ((match = TICKER_IN_TEXT_RE.exec(text)) !== null) {
    const slug = match[1]!.toLowerCase();
    if (!TICKER_SLUG_RE.test(slug)) continue;
    if (overlapsHit(hits, match.index, match[0]!.length)) continue;
    hits.push({
      index: match.index,
      length: match[0]!.length,
      segment: { type: 'ticker', value: match[0]!, slug },
    });
  }

  MENTION_IN_TEXT_RE.lastIndex = 0;
  while ((match = MENTION_IN_TEXT_RE.exec(text)) !== null) {
    const accountId = match[1]!.toLowerCase().replace(/^@+/, '');
    if (!isValidMentionAccountId(accountId)) continue;
    if (overlapsHit(hits, match.index, match[0]!.length)) continue;
    hits.push({
      index: match.index,
      length: match[0]!.length,
      segment: {
        type: 'mention',
        value: match[0]!,
        accountId,
      },
    });
  }

  hits.sort((a, b) => a.index - b.index || b.length - a.length);

  const segments: RichTextSegment[] = [];
  let cursor = 0;
  for (const hit of hits) {
    if (hit.index < cursor) continue;
    if (hit.index > cursor) {
      segments.push({ type: 'text', value: text.slice(cursor, hit.index) });
    }
    segments.push(hit.segment);
    cursor = hit.index + hit.length;
  }
  if (cursor < text.length) {
    segments.push({ type: 'text', value: text.slice(cursor) });
  }
  return segments.length > 0 ? segments : [{ type: 'text', value: text }];
}
